# Limited owner-approved correction; default execution makes no storage changes.
[CmdletBinding()]
param([switch]$ExecuteApproved)
$ErrorActionPreference = 'Stop'
if (-not $ExecuteApproved) { Write-Output 'Preparation only. No conversion, ACL change or connection performed.'; return }
$repoPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runStamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$evidencePath = Join-Path $repoPath ('docs\evidence\PHASE2-STORAGE-EXECUTION-' + $runStamp + '.json')
$approvedContainerPath = 'D:\TELKOM UNIVERSITY\SEMESTER 7\Capstone\WellBeingHub-Backup.hc\WellBeingHub-Backup.hc'
$approvedParentPath = Split-Path -Parent $approvedContainerPath
$approvedBackupPath = 'W:\WellBeingHub-Backups'
$state = [ordered]@{
  StartedAtUtc = [DateTime]::UtcNow.ToString('o')
  StartedAtAsiaJakarta = [DateTimeOffset]::UtcNow.ToOffset([TimeSpan]::FromHours(7)).ToString('o')
  Status = 'PREFLIGHT'; Stage = 'ADMINISTRATOR_CHECK'; ConversionInvoked = $false
  CompletedAclTargets = @(); BackupDirectoryCreated = $false; ProbePassed = $false
  HostedConnectionPerformed = $false; WindowsMemorySettingsChanged = $false; ExportReady = $false
}
function Save-Evidence { $state | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $evidencePath -Encoding UTF8 }
function Assert-Mount([string]$FileSystem) {
  if (-not (Test-Path -LiteralPath 'W:\')) { throw 'W: unavailable.' }
  $mount = Get-Phase2VeraCryptMount -Drive 'W:'
  if (-not $mount.ContainerPath.Equals($approvedContainerPath, [StringComparison]::OrdinalIgnoreCase) -or
      $mount.DeviceTarget -ne '\Device\VeraCryptVolumeW') { throw 'Mount identity mismatch.' }
  $driveInfo = [IO.DriveInfo]::new('W:\')
  if ($driveInfo.DriveFormat -ne $FileSystem -or $driveInfo.AvailableFreeSpace -lt 5.1GB) { throw 'Filesystem or capacity prerequisite failed.' }
  if ((Get-Item -LiteralPath $approvedContainerPath).Length -ne 10737418240) { throw 'Container size changed.' }
  $state.Mount = $mount
  $state.FileSystem = $driveInfo.DriveFormat
  $state.AvailableBytes = $driveInfo.AvailableFreeSpace
}
function Assert-NoReparse([string]$Path) {
  $item = Get-Item -LiteralPath $Path -Force
  while ($null -ne $item) {
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Reparse path refused.' }
    if ($item -is [IO.FileInfo]) { $item = $item.Directory } else { $item = $item.Parent }
  }
}
function Invoke-CheckedNative([string]$Executable, [string]$Arguments, [string]$EvidenceKey) {
  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $Executable
  $startInfo.Arguments = $Arguments
  $startInfo.WorkingDirectory = $repoPath
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  if (-not $process.Start()) { throw 'Native process could not start.' }
  $outputTask = $process.StandardOutput.ReadToEndAsync()
  $errorTask = $process.StandardError.ReadToEndAsync()
  # No affirmative input: decline force-dismount/reboot prompts, then EOF.
  try { $process.StandardInput.WriteLine('N'); $process.StandardInput.WriteLine('N'); $process.StandardInput.Close() } catch { }
  $state.NativeProcessId = $process.Id
  Save-Evidence
  $process.WaitForExit()
  $exitCode = $process.ExitCode
  $output = $outputTask.GetAwaiter().GetResult()
  $errorText = $errorTask.GetAwaiter().GetResult()
  $state[$EvidenceKey] = [ordered]@{ Command = ([IO.Path]::GetFileName($Executable) + ' ' + $Arguments); ExitCode = $exitCode; Output = $output; Error = $errorText }
  $process.Dispose()
  Save-Evidence
  if ($exitCode -ne 0) { throw 'Native operation returned an error; stop without fallback.' }
}
function Set-ApprovedAcl([string]$Path, [bool]$Directory) {
  if ($Path -notin @($approvedContainerPath, $approvedParentPath, $approvedBackupPath)) { throw 'ACL target not approved.' }
  Assert-Mount 'NTFS'
  Assert-NoReparse $Path
  $acl = if ($Directory) { [Security.AccessControl.DirectorySecurity]::new() } else { [Security.AccessControl.FileSecurity]::new() }
  $acl.SetOwner($ownerSid)
  $acl.SetAccessRuleProtection($true, $false)
  $inherit = if ($Directory) { [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit' } else { [Security.AccessControl.InheritanceFlags]::None }
  foreach ($entry in @(@($ownerSid, 'Modify'), @($systemSid, 'FullControl'), @($adminSid, 'FullControl'))) {
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($entry[0], [Security.AccessControl.FileSystemRights]$entry[1], $inherit, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow))
  }
  Set-Acl -LiteralPath $Path -AclObject $acl
  $state.CompletedAclTargets += $Path
  Save-Evidence
  $actual = Get-Acl -LiteralPath $Path
  if (-not $actual.AreAccessRulesProtected -or $actual.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $ownerSid.Value -or $actual.Access.Count -ne 3) { throw 'ACL verification failed.' }
  foreach ($entry in @(@($ownerSid, 'Modify'), @($systemSid, 'FullControl'), @($adminSid, 'FullControl'))) {
    $matches = @($actual.Access | Where-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -eq $entry[0].Value -and $_.AccessControlType -eq 'Allow' })
    $rights = [Security.AccessControl.FileSystemRights]$entry[1]
    if ($matches.Count -ne 1 -or $matches[0].IsInherited -or $matches[0].InheritanceFlags -ne $inherit -or
        ($matches[0].FileSystemRights -band $rights) -ne $rights -or
        ($matches[0].FileSystemRights -band (-bnot ($rights -bor [Security.AccessControl.FileSystemRights]::Synchronize))) -ne 0) { throw 'ACL rights mismatch.' }
  }
}
try {
  Save-Evidence
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  if ($identity.Name -ne 'DESKTOP-0JBKJEC\hp' -or -not ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Elevated hp token required.' }
  $ownerSid = $identity.User
  $systemSid = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
  $adminSid = [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
  . (Join-Path $PSScriptRoot 'phase2-veracrypt.ps1')
  $state.Stage = 'MOUNT_AND_INVENTORY'
  Assert-Mount 'FAT32'
  Assert-NoReparse $approvedContainerPath
  Assert-NoReparse 'W:\'
  if (Test-Path -LiteralPath $approvedBackupPath) { throw 'Unexpected pre-existing backup directory.' }
  $inventory = @(Get-ChildItem -LiteralPath 'W:\' -Force -Recurse -ErrorAction Stop)
  if ($inventory.Count -ne 2 -or @($inventory | Where-Object {$_.PSIsContainer -and $_.FullName -eq 'W:\System Volume Information'}).Count -ne 1 -or
      @($inventory | Where-Object {-not $_.PSIsContainer -and $_.FullName -eq 'W:\System Volume Information\WPSettings.dat' -and $_.Length -eq 12}).Count -ne 1) { throw 'Inventory changed.' }
  $parentEntries = @(Get-ChildItem -LiteralPath $approvedParentPath -Force)
  if ($parentEntries.Count -ne 1 -or $parentEntries[0].FullName -ne $approvedContainerPath) { throw 'Unrelated parent entries found.' }
  $state.InventoryBefore = @($inventory | Select-Object FullName,PSIsContainer,Length)
  $state.AclBefore = @($approvedParentPath,$approvedContainerPath) | ForEach-Object { $acl=Get-Acl -LiteralPath $_; [pscustomobject]@{Path=$_;Owner=$acl.Owner;Sddl=$acl.Sddl} }
  $state.Stage = 'READ_ONLY_CHKDSK'
  Save-Evidence
  Invoke-CheckedNative (Join-Path $env:SystemRoot 'System32\chkdsk.exe') 'W:' 'ChkdskBefore'
  Assert-Mount 'FAT32'
  $state.Stage = 'CONVERT'; $state.ConversionInvoked = $true
  Save-Evidence
  Invoke-CheckedNative (Join-Path $env:SystemRoot 'System32\convert.exe') 'W: /FS:NTFS /V' 'Conversion'
  Assert-Mount 'NTFS'
  $state.Stage = 'POST_CONVERSION_HEALTH'
  Save-Evidence
  Invoke-CheckedNative (Join-Path $env:SystemRoot 'System32\chkdsk.exe') 'W:' 'ChkdskAfter'
  $state.Stage = 'SCOPED_ACLS'
  Save-Evidence
  Set-ApprovedAcl $approvedParentPath $true
  Set-ApprovedAcl $approvedContainerPath $false
  Assert-Mount 'NTFS'
  if (Test-Path -LiteralPath $approvedBackupPath) { throw 'Backup path unexpectedly appeared.' }
  [void][IO.Directory]::CreateDirectory($approvedBackupPath)
  $state.BackupDirectoryCreated = $true
  Save-Evidence
  Set-ApprovedAcl $approvedBackupPath $true
  $state.AclAfter = @($approvedParentPath,$approvedContainerPath,$approvedBackupPath) | ForEach-Object { $acl=Get-Acl -LiteralPath $_; [pscustomobject]@{Path=$_;Owner=$acl.Owner;Sddl=$acl.Sddl} }
  $state.Stage = 'NON_SENSITIVE_PROBE'
  Save-Evidence
  Assert-Mount 'NTFS'
  $probePath = Join-Path $approvedBackupPath ('storage-probe-' + [Guid]::NewGuid().ToString('N') + '.txt')
  $state.ProbePath = $probePath
  $bytes = [Text.Encoding]::UTF8.GetBytes('WellBeing Hub non-sensitive storage verification.')
  $stream = [IO.File]::Open($probePath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try { $stream.Write($bytes,0,$bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
  if ([IO.File]::ReadAllText($probePath) -ne 'WellBeing Hub non-sensitive storage verification.') { throw 'Probe read mismatch.' }
  Remove-Item -LiteralPath $probePath -ErrorAction Stop
  if (Test-Path -LiteralPath $probePath) { throw 'Probe deletion failed.' }
  $state.ProbePassed = $true
  Assert-Mount 'NTFS'
  $state.Status = 'CONVERSION_AND_SCOPED_ACLS_VERIFIED'
  $state.Stage = 'COMPLETE'
  $state.RemainingBlocker = 'Windows memory-spill protection and recovery custody still need verification; production export remains unapproved.'
} catch {
  $state.Status = 'STOPPED'
  $state.StopReason = $_.Exception.Message
} finally {
  $state.FinishedAtUtc = [DateTime]::UtcNow.ToString('o')
  Save-Evidence
}
if ($state.Status -eq 'STOPPED') { exit 1 }
