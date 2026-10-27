# Read-only Windows mount inspection. No mount, dismount, password or key IOCTLs.
# Interface reviewed against VeraCrypt_1.26.29/src/Common/Apidrvr.h and Tcdefs.h:
# https://github.com/veracrypt/VeraCrypt/tree/VeraCrypt_1.26.29/src/Common
param([switch]$VerifyMount, [string]$ExpectedContainer = '')
function Get-Phase2VeraCryptMount {
  param([ValidatePattern('^[A-Za-z]:$')][string]$Drive = 'W:')
  if (-not ('WellBeingBackup.VeraCryptMount' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
namespace WellBeingBackup {
  public sealed class MountEvidence {
    public string DeviceTarget;
    public string ContainerPath;
    public string DriverInterface;
  }
  public static class VeraCryptMount {
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    private static extern uint QueryDosDevice(string name, StringBuilder target, int length);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    private static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError=true)]
    private static extern bool DeviceIoControl(SafeFileHandle handle, uint code, IntPtr input, uint inputLength, byte[] output, uint outputLength, out uint returned, IntPtr overlapped);
    public static MountEvidence Read(string drive) {
      drive = drive.ToUpperInvariant();
      if (drive.Length != 2 || drive[0] < 'A' || drive[0] > 'Z' || drive[1] != ':') throw new InvalidOperationException("Invalid drive.");
      var target = new StringBuilder(1024);
      if (QueryDosDevice(drive, target, target.Capacity) == 0 || target.ToString() != @"\Device\VeraCryptVolume" + drive[0])
        throw new InvalidOperationException("Drive is not mapped to VeraCrypt.");
      using (var handle = CreateFile(@"\\.\VeraCrypt", 0, 3, IntPtr.Zero, 3, 0, IntPtr.Zero)) {
        if (handle.IsInvalid) throw new InvalidOperationException("VeraCrypt driver query unavailable.");
        uint returned;
        var version = new byte[4];
        // CTL_CODE(FILE_DEVICE_UNKNOWN, 0x800 + n, METHOD_BUFFERED, FILE_ANY_ACCESS).
        if (!DeviceIoControl(handle, 0x222004, IntPtr.Zero, 0, version, 4, out returned, IntPtr.Zero) || returned != 4 || BitConverter.ToUInt32(version, 0) != 0x126)
          throw new InvalidOperationException("Unreviewed VeraCrypt driver interface.");
        var mounts = new byte[65536];
        if (!DeviceIoControl(handle, 0x222018, IntPtr.Zero, 0, mounts, (uint)mounts.Length, out returned, IntPtr.Zero) || returned < 4 + 26 * 260 * 2)
          throw new InvalidOperationException("VeraCrypt mount list unavailable.");
        int index = drive[0] - 'A';
        if ((BitConverter.ToUInt32(mounts, 0) & (1u << index)) == 0) throw new InvalidOperationException("Mount not visible to this account.");
        string path = Encoding.Unicode.GetString(mounts, 4 + index * 520, 520).Split('\0')[0];
        if (path.StartsWith(@"\??\")) path = path.Substring(4);
        if (path.Length < 3 || !Char.IsLetter(path[0]) || path[1] != ':' || path[2] != '\\')
          throw new InvalidOperationException("A local file-backed container is required.");
        return new MountEvidence { DeviceTarget=target.ToString(), ContainerPath=path, DriverInterface="0x0126" };
      }
    }
  }
}
'@
  }
  [WellBeingBackup.VeraCryptMount]::Read($Drive)
}

if ($VerifyMount) {
  try {
    $evidence = Get-Phase2VeraCryptMount -Drive 'W:'
    if (-not $ExpectedContainer -or -not [IO.Path]::IsPathRooted($ExpectedContainer) -or
      -not ([IO.Path]::GetFullPath($evidence.ContainerPath)).Equals([IO.Path]::GetFullPath($ExpectedContainer), [StringComparison]::OrdinalIgnoreCase) -or
      ([IO.DriveInfo]::new('W:\')).DriveFormat -ne 'NTFS') { throw 'Mount mismatch.' }
    exit 0
  } catch {
    Write-Output 'VeraCrypt identity/filesystem check failed. No database connection attempted by this check.'
    exit 1
  }
}
