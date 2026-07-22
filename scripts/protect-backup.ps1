[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$BackupDirectory,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^\d{8}-\d{6}$')]
    [string]$BackupId,

    [ValidateSet('unavailable-spark', 'enabled', 'unknown')]
    [string]$RemoteBackupStatus = 'unknown'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$allowedBackupRoot = [System.IO.Path]::GetFullPath('D:\Backups\dias_trabalhados_2')
$resolvedBackupDirectory = (Resolve-Path -LiteralPath $BackupDirectory).Path

if (-not $resolvedBackupDirectory.StartsWith("$allowedBackupRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Diretório de backup fora da raiz permitida: $resolvedBackupDirectory"
}

$requiredNames = @(
    'rtdb-data.json',
    'rtdb-rules.json',
    'auth-users.json',
    'firebase-web-sdk-config.json',
    'source-summary.json'
)
$optionalNames = @(
    'rtdb-restored-from-emulator.json',
    'restore-verification.json'
)

$sourceNames = [System.Collections.Generic.List[string]]::new()
foreach ($name in $requiredNames) {
    $path = Join-Path $resolvedBackupDirectory $name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Arquivo obrigatório ausente: $path"
    }
    $sourceNames.Add($name)
}
foreach ($name in $optionalNames) {
    if (Test-Path -LiteralPath (Join-Path $resolvedBackupDirectory $name) -PathType Leaf) {
        $sourceNames.Add($name)
    }
}

$userProfile = [Environment]::GetFolderPath('UserProfile')
if ([string]::IsNullOrWhiteSpace($userProfile)) {
    throw 'Não foi possível resolver o perfil do usuário para armazenar a chave protegida.'
}

$keyRoot = Join-Path $userProfile '.dias-trabalhados-backup-keys'
$keyPath = Join-Path $keyRoot "$BackupId.key.dpapi"
New-Item -ItemType Directory -Path $keyRoot -Force | Out-Null

if (Test-Path -LiteralPath $keyPath) {
    throw "Já existe uma chave protegida para este backup: $keyPath"
}

$fileEntries = foreach ($name in $sourceNames) {
    $file = Get-Item -LiteralPath (Join-Path $resolvedBackupDirectory $name)
    [ordered]@{
        name = $name
        bytes = $file.Length
        sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}

$summary = Get-Content -Raw -LiteralPath (Join-Path $resolvedBackupDirectory 'source-summary.json') |
    ConvertFrom-Json
$authExport = Get-Content -Raw -LiteralPath (Join-Path $resolvedBackupDirectory 'auth-users.json') |
    ConvertFrom-Json
$restoreResultPath = Join-Path $resolvedBackupDirectory 'restore-verification.json'
$restoreVerified = $false
if (Test-Path -LiteralPath $restoreResultPath) {
    $restoreResult = Get-Content -Raw -LiteralPath $restoreResultPath | ConvertFrom-Json
    $restoreVerified = $restoreResult.equal -eq $true
}

$remoteBackup = switch ($RemoteBackupStatus) {
    'unavailable-spark' {
        [ordered]@{
            status = 'unavailable'
            plan = 'Spark'
            actionRequired = 'Explicit Blaze billing approval'
        }
    }
    'enabled' { [ordered]@{ status = 'enabled' } }
    default { [ordered]@{ status = 'unknown' } }
}

$manifest = [ordered]@{
    formatVersion = 1
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    projectId = 'dias-trabalhados-bf99a'
    databaseInstance = 'dias-trabalhados-bf99a-default-rtdb'
    authUserCount = @($authExport.users).Count
    files = $fileEntries
    invariants = $summary
    restoreVerification = [ordered]@{
        equal = $restoreVerified
        emulatorProject = if ($restoreVerified) { 'demo-dias-trabalhados-2' } else { $null }
        verifiedAt = if ($restoreVerified) { (Get-Date).ToUniversalTime().ToString('o') } else { $null }
    }
    encryption = [ordered]@{
        algorithm = 'AES-256-GCM'
        keyProtection = 'Windows DPAPI CurrentUser'
        keyReference = $keyPath
    }
    remoteAutomatedBackup = $remoteBackup
}

$utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
$manifestPath = Join-Path $resolvedBackupDirectory 'manifest.json'
[System.IO.File]::WriteAllText(
    $manifestPath,
    (($manifest | ConvertTo-Json -Depth 12) + [Environment]::NewLine),
    $utf8WithoutBom
)

$archivePath = Join-Path $resolvedBackupDirectory "backup-$BackupId.zip"
$encryptedPath = Join-Path $resolvedBackupDirectory "backup-$BackupId.dtbackup"
$verificationArchive = Join-Path $resolvedBackupDirectory "backup-$BackupId.verify.zip"

foreach ($target in @($archivePath, $encryptedPath, $verificationArchive)) {
    if (Test-Path -LiteralPath $target) {
        throw "Arquivo de destino já existe: $target"
    }
}

$archiveInputs = $sourceNames | ForEach-Object { Join-Path $resolvedBackupDirectory $_ }
$archiveInputs += $manifestPath
Compress-Archive -LiteralPath $archiveInputs -DestinationPath $archivePath -CompressionLevel Optimal

$keyBytes = [byte[]]::new(32)
$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rawKey = $null

try {
    $random.GetBytes($keyBytes)
    $rawKey = [Convert]::ToBase64String($keyBytes)
    $protectedKey = ConvertFrom-SecureString (
        ConvertTo-SecureString $rawKey -AsPlainText -Force
    )
    [System.IO.File]::WriteAllText($keyPath, $protectedKey, $utf8WithoutBom)

    $env:DIAS_BACKUP_KEY = $rawKey
    node (Join-Path $PSScriptRoot 'backup-crypto.mjs') encrypt $archivePath $encryptedPath
    if ($LASTEXITCODE -ne 0) {
        throw 'Falha ao criptografar o arquivo de backup.'
    }

    node (Join-Path $PSScriptRoot 'backup-crypto.mjs') decrypt $encryptedPath $verificationArchive
    if ($LASTEXITCODE -ne 0) {
        throw 'Falha ao validar a descriptografia do backup.'
    }

    $archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
    $verificationHash = (Get-FileHash -LiteralPath $verificationArchive -Algorithm SHA256).Hash
    if ($archiveHash -ne $verificationHash) {
        throw 'O arquivo descriptografado não corresponde ao arquivo original.'
    }
}
finally {
    $random.Dispose()
    [Array]::Clear($keyBytes, 0, $keyBytes.Length)
    $rawKey = $null
    Remove-Item Env:DIAS_BACKUP_KEY -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $verificationArchive) {
        Remove-Item -LiteralPath $verificationArchive -Force
    }
}

$integrity = [ordered]@{
    archive = [System.IO.Path]::GetFileName($encryptedPath)
    bytes = (Get-Item -LiteralPath $encryptedPath).Length
    sha256 = (Get-FileHash -LiteralPath $encryptedPath -Algorithm SHA256).Hash.ToLowerInvariant()
    manifestSha256 = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
    encryptionVerified = $true
    verifiedAt = (Get-Date).ToUniversalTime().ToString('o')
}
$integrityPath = Join-Path $resolvedBackupDirectory 'integrity.json'
[System.IO.File]::WriteAllText(
    $integrityPath,
    (($integrity | ConvertTo-Json -Depth 5) + [Environment]::NewLine),
    $utf8WithoutBom
)

[PSCustomObject]@{
    EncryptedArchive = $encryptedPath
    Bytes = $integrity.bytes
    SHA256 = $integrity.sha256
    Manifest = $manifestPath
    Integrity = $integrityPath
    KeyReference = $keyPath
    EncryptionVerified = $true
    RestoreVerified = $restoreVerified
}
