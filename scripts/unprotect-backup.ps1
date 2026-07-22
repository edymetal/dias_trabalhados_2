[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$EncryptedBackup,

    [Parameter(Mandatory = $true)]
    [string]$ProtectedKey,

    [Parameter(Mandatory = $true)]
    [string]$OutputArchive
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$allowedBackupRoot = [System.IO.Path]::GetFullPath('D:\Backups\dias_trabalhados_2')
$allowedKeyRoot = [System.IO.Path]::GetFullPath(
    (Join-Path ([Environment]::GetFolderPath('UserProfile')) '.dias-trabalhados-backup-keys')
)
$resolvedBackup = (Resolve-Path -LiteralPath $EncryptedBackup).Path
$resolvedKey = (Resolve-Path -LiteralPath $ProtectedKey).Path
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputArchive)

if (-not $resolvedBackup.StartsWith("$allowedBackupRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Backup fora da raiz permitida: $resolvedBackup"
}
if (-not $resolvedOutput.StartsWith("$allowedBackupRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Saída fora da raiz permitida: $resolvedOutput"
}
if (-not $resolvedKey.StartsWith("$allowedKeyRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Chave fora da raiz permitida: $resolvedKey"
}
if (Test-Path -LiteralPath $resolvedOutput) {
    throw "O arquivo de saída já existe: $resolvedOutput"
}

$protectedValue = Get-Content -Raw -LiteralPath $resolvedKey
$secureKey = ConvertTo-SecureString $protectedValue
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
$rawKey = $null

try {
    $rawKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
    $env:DIAS_BACKUP_KEY = $rawKey
    node (Join-Path $PSScriptRoot 'backup-crypto.mjs') decrypt $resolvedBackup $resolvedOutput
    if ($LASTEXITCODE -ne 0) {
        throw 'Falha ao descriptografar o backup.'
    }
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    $rawKey = $null
    Remove-Item Env:DIAS_BACKUP_KEY -ErrorAction SilentlyContinue
}

Get-Item -LiteralPath $resolvedOutput |
    Select-Object FullName, Length, @{Name = 'SHA256'; Expression = {
        (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }}
