# Preparation only. No export, archive creation, upload or system/storage changes.
[CmdletBinding()]
param(
  [string]$BackupDirectory = '',
  [string]$PgBin = '',
  [switch]$ExportApproved
)
$ErrorActionPreference = 'Stop'
if ($ExportApproved) {
  Write-Error 'Export is disabled in this preparation tool. Separate source/destination/risk authorization and a reviewed execution procedure are required.'
  exit 1
}
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $PgBin) { $PgBin = Join-Path $repository '.tmp\postgresql17-client-tools\pgsql\bin' }
try {
  $versions = [ordered]@{}
  $toolsReady = $true
  foreach ($name in @('pg_dump','pg_dumpall','pg_restore','psql')) {
    $executable = Join-Path $PgBin ($name + '.exe')
    if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
      $versions[$name]='UNAVAILABLE'; $toolsReady=$false; continue
    }
    $version = (& $executable --version 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $version -notmatch '^\w+ \(PostgreSQL\) 17\.\d+$') {
      $versions[$name]='VERSION_CHECK_FAILED'; $toolsReady=$false
    } else { $versions[$name]=$version }
  }
  $sevenZip = Get-Command 7zFM.exe -ErrorAction SilentlyContinue
  $standardSevenZip = Join-Path $env:ProgramFiles '7-Zip\7zFM.exe'
  [pscustomobject]@{
    Mode='PREPARATION_ONLY'
    Strategy='GOOGLE_DRIVE_ENCRYPTED_ARCHIVES'
    Pg17ToolsReady=$toolsReady
    Versions=$versions
    SevenZipGuiFound=([bool]$sevenZip -or (Test-Path -LiteralPath $standardSevenZip -PathType Leaf))
    PasswordEntry='Owner-only interactive GUI; never script arguments/environment/logs'
    DestinationStatus=if($BackupDirectory){'PROPOSED_NOT_VERIFIED'}else{'OWNER_SELECTION_REQUIRED'}
    StorageReadinessEstablished=$false
    ExportEnabled=$false
    CurrentDatabasePlan='node scripts/phase2-db-export.mjs --plan; no plaintext database staging'
    WritesPerformed=$false
    UploadPerformed=$false
  } | ConvertTo-Json -Depth 4
  $planArgs = @((Join-Path $PSScriptRoot 'phase2-backup.mjs'),'--dry-run')
  if ($BackupDirectory) { $planArgs += @('--directory',$BackupDirectory) }
  & node @planArgs
  if ($LASTEXITCODE -ne 0) { throw 'Path planning failed.' }
} catch {
  Write-Error 'Preparation stopped; inspect the proposed path and local tool availability. No database operation performed.'
  exit 1
}
