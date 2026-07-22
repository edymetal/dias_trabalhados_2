[CmdletBinding()]
param(
    [ValidateRange(1, 3650)]
    [int]$RetentionDays = 30,

    [string]$BackupRoot = 'D:\Backups\dias_trabalhados_2'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectId = 'dias-trabalhados-bf99a'
$databaseInstance = 'dias-trabalhados-bf99a-default-rtdb'
$webAppId = '1:807305373436:web:5b12891242f350326e9979'
$expectedBackupRoot = [System.IO.Path]::GetFullPath('D:\Backups\dias_trabalhados_2')
$resolvedBackupRoot = [System.IO.Path]::GetFullPath($BackupRoot).TrimEnd('\')

if (-not $resolvedBackupRoot.Equals($expectedBackupRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "A rotina automática aceita somente a raiz segura $expectedBackupRoot."
}

$firebaseCommand = (Get-Command firebase.ps1 -ErrorAction Stop).Source
$nodeCommand = (Get-Command node.exe -ErrorAction Stop).Source
$env:NODE_USE_SYSTEM_CA = '1'

New-Item -ItemType Directory -Path $resolvedBackupRoot -Force | Out-Null
$logRoot = Join-Path $resolvedBackupRoot 'logs'
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null

$backupId = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDirectory = Join-Path $resolvedBackupRoot $backupId
$logPath = Join-Path $logRoot "backup-$backupId.log"
New-Item -ItemType Directory -Path $backupDirectory | Out-Null

function Write-BackupLog {
    param([string]$Message)
    $line = "{0} {1}{2}" -f (Get-Date).ToUniversalTime().ToString('o'), $Message, [Environment]::NewLine
    [System.IO.File]::AppendAllText($logPath, $line, [System.Text.UTF8Encoding]::new($false))
}

function Invoke-FirebaseCommand {
    param([string[]]$CommandArguments)
    & $firebaseCommand @CommandArguments
    if ($LASTEXITCODE -ne 0) {
        throw "O Firebase CLI falhou no comando $($CommandArguments[0])."
    }
}

try {
    Write-BackupLog "Inicio do backup de $projectId."

    Invoke-FirebaseCommand @(
        'database:get', '/', '--project', $projectId, '--instance', $databaseInstance,
        '--export', '--pretty', '--output', (Join-Path $backupDirectory 'rtdb-data.json')
    )
    Invoke-FirebaseCommand @(
        'database:get', '/.settings/rules', '--project', $projectId, '--instance', $databaseInstance,
        '--pretty', '--output', (Join-Path $backupDirectory 'rtdb-rules.json')
    )
    Invoke-FirebaseCommand @(
        'auth:export', (Join-Path $backupDirectory 'auth-users.json'),
        '--project', $projectId, '--format=json'
    )
    Invoke-FirebaseCommand @(
        'apps:sdkconfig', 'WEB', $webAppId, '--project', $projectId,
        '--out', (Join-Path $backupDirectory 'firebase-web-sdk-config.json')
    )

    & $nodeCommand (Join-Path $PSScriptRoot 'verify-rtdb-backup.mjs') inspect `
        (Join-Path $backupDirectory 'rtdb-data.json') `
        (Join-Path $backupDirectory 'source-summary.json')
    if ($LASTEXITCODE -ne 0) {
        throw 'Falha ao gerar o inventário do backup.'
    }

    & (Join-Path $PSScriptRoot 'protect-backup.ps1') `
        -BackupDirectory $backupDirectory `
        -BackupId $backupId `
        -RemoteBackupStatus 'unavailable-spark' | Out-Null

    $encryptedPath = Join-Path $backupDirectory "backup-$backupId.dtbackup"
    $keyPath = Join-Path (
        Join-Path ([Environment]::GetFolderPath('UserProfile')) '.dias-trabalhados-backup-keys'
    ) "$backupId.key.dpapi"
    $archivePath = Join-Path $backupDirectory "backup-$backupId.zip"
    $recoveryTestPath = Join-Path $backupDirectory "backup-$backupId.recovery-test.zip"

    & (Join-Path $PSScriptRoot 'unprotect-backup.ps1') `
        -EncryptedBackup $encryptedPath `
        -ProtectedKey $keyPath `
        -OutputArchive $recoveryTestPath | Out-Null

    $archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
    $recoveryHash = (Get-FileHash -LiteralPath $recoveryTestPath -Algorithm SHA256).Hash
    if ($archiveHash -ne $recoveryHash) {
        throw 'A recuperação independente não corresponde ao arquivo original.'
    }

    $plainNames = @(
        'rtdb-data.json',
        'rtdb-rules.json',
        'auth-users.json',
        'firebase-web-sdk-config.json',
        'source-summary.json',
        "backup-$backupId.zip",
        "backup-$backupId.recovery-test.zip"
    )
    foreach ($name in $plainNames) {
        $target = Join-Path $backupDirectory $name
        if (Test-Path -LiteralPath $target) {
            $resolvedTarget = (Resolve-Path -LiteralPath $target).Path
            if (-not $resolvedTarget.StartsWith("$backupDirectory\", [System.StringComparison]::OrdinalIgnoreCase)) {
                throw "Alvo de limpeza inseguro: $resolvedTarget"
            }
            Remove-Item -LiteralPath $resolvedTarget -Force
        }
    }

    $cutoff = (Get-Date).AddDays(-$RetentionDays)
    $keyRoot = [System.IO.Path]::GetFullPath(
        (Join-Path ([Environment]::GetFolderPath('UserProfile')) '.dias-trabalhados-backup-keys')
    )
    $expiredDirectories = Get-ChildItem -LiteralPath $resolvedBackupRoot -Directory |
        Where-Object {
            $_.Name -match '^\d{8}-\d{6}$' -and
            $_.Name -ne $backupId -and
            [DateTime]::ParseExact($_.Name, 'yyyyMMdd-HHmmss', $null) -lt $cutoff -and
            (Test-Path -LiteralPath (Join-Path $_.FullName "backup-$($_.Name).dtbackup")) -and
            (Test-Path -LiteralPath (Join-Path $_.FullName 'integrity.json'))
        }

    foreach ($directory in $expiredDirectories) {
        $resolvedExpired = (Resolve-Path -LiteralPath $directory.FullName).Path
        if (-not $resolvedExpired.StartsWith("$resolvedBackupRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Diretório de retenção inseguro: $resolvedExpired"
        }
        Remove-Item -LiteralPath $resolvedExpired -Recurse -Force

        $expiredKey = Join-Path $keyRoot "$($directory.Name).key.dpapi"
        if (Test-Path -LiteralPath $expiredKey) {
            $resolvedKey = (Resolve-Path -LiteralPath $expiredKey).Path
            if (-not $resolvedKey.StartsWith("$keyRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
                throw "Chave de retenção fora da raiz segura: $resolvedKey"
            }
            Remove-Item -LiteralPath $resolvedKey -Force
        }
    }

    Write-BackupLog "Backup concluido, criptografia e recuperacao verificadas."
    [PSCustomObject]@{
        BackupId = $backupId
        Directory = $backupDirectory
        EncryptedArchive = $encryptedPath
        SHA256 = (Get-FileHash -LiteralPath $encryptedPath -Algorithm SHA256).Hash.ToLowerInvariant()
        KeyReference = $keyPath
        RetentionDays = $RetentionDays
        PlaintextRemoved = $true
    }
}
catch {
    Write-BackupLog "FALHA: $($_.Exception.Message)"
    throw
}
finally {
    Remove-Item Env:NODE_USE_SYSTEM_CA -ErrorAction SilentlyContinue
}
