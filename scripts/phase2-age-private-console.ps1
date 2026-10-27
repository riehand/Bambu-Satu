param(
    [ValidateSet('PromptCheck','ExportApproved','VerifyRetry01','RecoveryRetry01')][string]$Mode = 'PromptCheck',
    [switch]$ChildConsole
)
# ExportApproved is an invocation, NOT permission. Owner authorized one Retry01
# attempt; existing destinations are rejected and no automatic retry is allowed.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if (-not $ChildConsole) {
    # A dedicated -File process exits when done. Never use -NoExit, Invoke-Expression,
    # Read-Host, or an interactive shell command to collect a passphrase.
    $arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -Mode ' + $Mode + ' -ChildConsole'
    $child = Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $arguments -WorkingDirectory $repo -WindowStyle Normal -Wait -PassThru
    Write-Output ('Dedicated workflow exit code: ' + $child.ExitCode)
    exit $child.ExitCode
    return
}
$resultCode = 1
try {
    Set-Location -LiteralPath $repo
    if ($Mode -eq 'PromptCheck') {
        $Host.UI.RawUI.WindowTitle = 'WellBeing Hub - SYNTHETIC private age prompt check - NO DATABASE'
        & 'C:\Program Files\nodejs\node.exe' (Join-Path $PSScriptRoot 'phase2-age-prompt-check.mjs')
    } elseif ($Mode -eq 'VerifyRetry01') {
        $Host.UI.RawUI.WindowTitle = 'WellBeing Hub - VERIFY RETRY01 ONLY - NO DATABASE CONNECTION'
        & 'C:\Program Files\nodejs\node.exe' (Join-Path $PSScriptRoot 'phase2-db-verify-retry01.mjs') '--verify-approved'
    } elseif ($Mode -eq 'RecoveryRetry01') {
        $Host.UI.RawUI.WindowTitle = 'WellBeing Hub - RECOVERY COMPANION ONLY - NO DATABASE CONNECTION'
        & 'C:\Program Files\nodejs\node.exe' (Join-Path $PSScriptRoot 'phase2-create-recovery-retry01.mjs') '--create-approved'
    } else {
        $Host.UI.RawUI.WindowTitle = 'WellBeing Hub - authorized encrypted database export - PRIVATE AGE PROMPTS'
        Write-Host 'Type a NEW NONEMPTY passphrase ONLY at an age Enter/Confirm passphrase prompt. Input must not echo.'
        Write-Host 'Never type a passphrase at a PS prompt, after STOP, or into chat. Close this window if the private prompt is absent.'
        & 'C:\Program Files\nodejs\node.exe' (Join-Path $PSScriptRoot 'phase2-db-export.mjs') '--export-approved'
    }
    $resultCode = $LASTEXITCODE
} catch {
    Write-Host 'STOP: private-console check failed. Do not type a passphrase. No raw diagnostics displayed.'
} finally {
    # Static completion dialog has no text-entry field. No return to an active PS prompt.
    Write-Host 'STOP: password entry has ended. Do not type anything. Close the completion dialog.'
    try {
        Add-Type -AssemblyName System.Windows.Forms
        $operation = if ($Mode -eq 'PromptCheck') { 'Local synthetic check (no database connection)' } elseif ($Mode -eq 'VerifyRetry01') { 'Local Retry01 verification (no database connection)' } elseif ($Mode -eq 'RecoveryRetry01') { 'Recovery companion (no database connection)' } else { 'Authorized export/verification' }
        $message = if ($resultCode -eq 0) { $operation + ' completed. Password entry has ended.' } else { $operation + ' STOPPED. Do not type a passphrase. Retained outputs are unverified.' }
        [void][System.Windows.Forms.MessageBox]::Show($message, 'WellBeing Hub - finished', 'OK', 'Information')
    } catch { }
    exit $resultCode
}
