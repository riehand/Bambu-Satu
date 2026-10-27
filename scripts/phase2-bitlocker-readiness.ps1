# Read-only Windows audit. Never enables encryption, changes partitions/policy,
# mounts volumes, or reads recovery passwords. Writes only sanitized evidence.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Read-only audit requires an elevated PowerShell terminal.' }
$repoPath = Split-Path -Parent $PSScriptRoot
$evidencePath = Join-Path $repoPath 'docs\evidence\PHASE2-BITLOCKER-ADMIN-20261025.json'
if (Test-Path -LiteralPath $evidencePath) { throw 'Evidence already exists; preserve it and review before another audit.' }
$audit = [ordered]@{
  RecordedAtUtc = [DateTime]::UtcNow.ToString('o')
  Scope = 'Read-only BitLocker readiness metadata; no recovery key retrieval'
  AdministratorToken = $isAdmin
  SettingsChanged = $false
  Checks = [ordered]@{}
}
function Record-Check([string]$Name, [scriptblock]$Action) {
  try { $audit.Checks[$Name] = [ordered]@{Status='OK'; Result=@(& $Action)} }
  catch { $audit.Checks[$Name] = [ordered]@{Status='UNVERIFIED'; ErrorType=$_.Exception.GetType().FullName; ErrorId=$_.FullyQualifiedErrorId} }
}
Record-Check 'BitLockerC' {
  Get-BitLockerVolume -MountPoint 'C:' | Select-Object MountPoint,
    @{n='VolumeStatus';e={$_.VolumeStatus.ToString()}},
    @{n='ProtectionStatus';e={$_.ProtectionStatus.ToString()}},
    EncryptionPercentage, @{n='EncryptionMethod';e={$_.EncryptionMethod.ToString()}},
    @{n='LockStatus';e={$_.LockStatus.ToString()}}
}
Record-Check 'BitLockerD' {
  Get-BitLockerVolume -MountPoint 'D:' | Select-Object MountPoint,
    @{n='VolumeStatus';e={$_.VolumeStatus.ToString()}},
    @{n='ProtectionStatus';e={$_.ProtectionStatus.ToString()}},
    EncryptionPercentage, @{n='EncryptionMethod';e={$_.EncryptionMethod.ToString()}},
    @{n='LockStatus';e={$_.LockStatus.ToString()}}
}
Record-Check 'Tpm' { Get-Tpm | Select-Object TpmPresent,TpmReady,TpmEnabled,TpmActivated,LockedOut }
Record-Check 'TpmSpecification' {
  Get-CimInstance -Namespace 'root\CIMV2\Security\MicrosoftTpm' -ClassName Win32_Tpm |
    Select-Object SpecVersion,IsEnabled_InitialValue,IsActivated_InitialValue
}
Record-Check 'SecureBoot' { Confirm-SecureBootUEFI }
Record-Check 'WinRE' {
  $result = & reagentc.exe /info 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'Read-only reagentc status failed.' }
  $result | Out-String
}
Record-Check 'OSPartitionAndBootVolumes' {
  $osPartition = Get-Partition -DriveLetter C
  $partitions = @(Get-Partition -DiskNumber $osPartition.DiskNumber)
  foreach ($part in $partitions) {
    $volume = $null
    $volumeStatus = 'Not inspected: reserved/non-filesystem partition'
    if ($part.Type -ne 'Reserved') {
      try { $volume = $part | Get-Volume -ErrorAction Stop; $volumeStatus='Queried' }
      catch { $volumeStatus='Unavailable through Storage API' }
    }
    [pscustomobject]@{
      DiskNumber=$part.DiskNumber; PartitionNumber=$part.PartitionNumber
      Type=$part.Type; Size=$part.Size; IsBoot=$part.IsBoot; IsSystem=$part.IsSystem
      FileSystemType=if($volume){$volume.FileSystemType.ToString()}else{$null}
      VolumeSize=if($volume){$volume.Size}else{$null}
      FreeBytes=if($volume){$volume.SizeRemaining}else{$null}
      VolumeQuery=$volumeStatus
    }
  }
}
Record-Check 'Disks' {
  Get-Disk | Select-Object Number,@{n='PartitionStyle';e={$_.PartitionStyle.ToString()}},
    @{n='HealthStatus';e={$_.HealthStatus.ToString()}},IsBoot,IsSystem,Size
}
Record-Check 'PhysicalDiskHealth' {
  Get-PhysicalDisk | Select-Object @{n='MediaType';e={$_.MediaType.ToString()}},
    @{n='HealthStatus';e={$_.HealthStatus.ToString()}},Size
}
Record-Check 'Pagefile' { Get-CimInstance Win32_PageFileUsage | Select-Object Name,AllocatedBaseSize,CurrentUsage,PeakUsage }
Record-Check 'GroupPolicyBitLocker' {
  $policyPath = 'HKLM:\SOFTWARE\Policies\Microsoft\FVE'
  if (-not (Test-Path -LiteralPath $policyPath)) { 'Registry key absent'; return }
  Get-ItemProperty -LiteralPath $policyPath | Select-Object UseAdvancedStartup,
    EnableBDEWithNoTPM,UseTPM,UseTPMPIN,UseTPMKey,UseTPMKeyPIN,OSRecovery,
    OSRecoveryPassword,OSRecoveryKey,OSHideRecoveryPage,OSActiveDirectoryBackup,
    OSRequireActiveDirectoryBackup,OSEncryptionType,EncryptionMethodWithXtsOs,
    OSAllowSecureBootForIntegrity
}
Record-Check 'MdmBitLocker' {
  $policyPath = 'HKLM:\SOFTWARE\Microsoft\PolicyManager\current\device\BitLocker'
  if (-not (Test-Path -LiteralPath $policyPath)) { 'Registry key absent'; return }
  Get-ItemProperty -LiteralPath $policyPath | Select-Object RequireDeviceEncryption,
    AllowWarningForOtherDiskEncryption,AllowStandardUserEncryption,
    SystemDrivesRequireStartupAuthentication,SystemDrivesRecoveryOptions,
    EncryptionMethodByDriveType,SystemDrivesEncryptionType,
    SystemDrivesEnablePrebootInputProtectorsOnSlates
}
Record-Check 'AutomaticEncryptionPrevention' {
  Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\BitLocker' | Select-Object PreventDeviceEncryption
}
Record-Check 'Services' { Get-Service BDESVC,ShellHWDetection | Select-Object Name,@{n='Status';e={$_.Status.ToString()}},@{n='StartType';e={$_.StartType.ToString()}} }
Record-Check 'PendingRebootIndicators' {
  [pscustomobject]@{
    CBS = Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending'
    WindowsUpdate = Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired'
    PendingFileRenameOperationsPresent = [bool](Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager').PendingFileRenameOperations
  }
}
$audit.CompletedAtUtc = [DateTime]::UtcNow.ToString('o')
$audit | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $evidencePath -Encoding UTF8
Write-Output 'Read-only readiness evidence saved. No encryption settings changed.'
