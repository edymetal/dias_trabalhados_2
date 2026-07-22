[CmdletBinding()]
param(
    [ValidatePattern('^([01]\d|2[0-3]):[0-5]\d$')]
    [string]$DailyAt = '03:00'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$automationRoot = [System.IO.Path]::GetFullPath('D:\Backups\dias_trabalhados_2\automation')
$allowedRoot = [System.IO.Path]::GetFullPath('D:\Backups\dias_trabalhados_2')
if (-not $automationRoot.StartsWith("$allowedRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Diretório de automação inseguro: $automationRoot"
}

New-Item -ItemType Directory -Path $automationRoot -Force | Out-Null
$scriptNames = @(
    'backup-production.ps1',
    'protect-backup.ps1',
    'unprotect-backup.ps1',
    'backup-crypto.mjs',
    'verify-rtdb-backup.mjs'
)
foreach ($name in $scriptNames) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) `
        -Destination (Join-Path $automationRoot $name) -Force
}

$taskName = 'Dias Trabalhados - Backup Firebase'
$backupScript = Join-Path $automationRoot 'backup-production.ps1'
$action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$backupScript`""
$triggerTime = [DateTime]::ParseExact($DailyAt, 'HH:mm', $null)
$trigger = New-ScheduledTaskTrigger -Daily -At $triggerTime
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal `
    -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description 'Backup diário criptografado do Firebase Dias Trabalhados, com retenção local de 30 dias.' `
    -Force | Out-Null

Get-ScheduledTask -TaskName $taskName |
    Select-Object TaskName, State, TaskPath, @{Name = 'DailyAt'; Expression = { $DailyAt }}, `
        @{Name = 'Script'; Expression = { $backupScript }}
