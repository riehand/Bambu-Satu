# Project-file inventory only. No archive, password, database, upload or restore operation.
# Default mode prints aggregate metadata only. Private manifest modes require a
# pre-existing restricted metadata directory; they never print per-file entries.
[CmdletBinding()]
param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [switch]$WritePrivateManifest,
  [switch]$VerifyManifest
)
$ErrorActionPreference = 'Stop'
if ($WritePrivateManifest -and $VerifyManifest) { throw 'Choose one manifest mode.' }
$rootPath = [IO.Path]::GetFullPath($Root).TrimEnd('\')
$manifestRelative = '.tmp\phase2-project-backup\manifest.json'
$manifestPath = Join-Path $rootPath $manifestRelative
$privateDirectory = Split-Path -Parent $manifestPath
$hashFiles = $WritePrivateManifest -or $VerifyManifest
$files = New-Object 'System.Collections.Generic.List[object]'
$directories = New-Object 'System.Collections.Generic.List[string]'
$aliases = New-Object 'System.Collections.Generic.List[object]'
$skillNames = @('prisma-cli','prisma-client-api','prisma-compute','prisma-database-setup',
  'prisma-driver-adapter-implementation','prisma-mongodb-upgrade','prisma-orm-setup',
  'prisma-postgres','prisma-postgres-setup','prisma-upgrade-v7')

function Assert-OrdinaryAncestors([string]$Path) {
  $item = Get-Item -LiteralPath $Path -Force
  while ($null -ne $item) {
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw 'Unexpected reparse point in required ordinary path; stop and review privately.'
    }
    if ($item -is [IO.FileInfo]) { $item = $item.Directory } else { $item = $item.Parent }
  }
}

function Assert-PrivateManifestLocation {
  Assert-OrdinaryAncestors $privateDirectory
  $acl = Get-Acl -LiteralPath $privateDirectory
  $ownerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $allowed = @($ownerSid,'S-1-5-18','S-1-5-32-544')
  if (-not $acl.AreAccessRulesProtected) { throw 'Private manifest directory must disable ACL inheritance first.' }
  foreach ($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
    if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin $allowed) {
      throw 'Private manifest directory grants an unexpected account access.'
    }
  }
  if (Test-Path -LiteralPath $manifestPath) {
    Assert-OrdinaryAncestors $manifestPath
    $fileAcl = Get-Acl -LiteralPath $manifestPath
    foreach ($rule in $fileAcl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
      if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin $allowed) {
        throw 'Private manifest file grants an unexpected account access.'
      }
    }
  }
}

function Visit-Directory([string]$Physical, [string]$Logical) {
  foreach ($item in Get-ChildItem -LiteralPath $Physical -Force -ErrorAction Stop) {
    $relative = if ($Logical) { $Logical + '\' + $item.Name } else { $item.Name }
    # These are the only archive exclusions, and only at the source root.
    if ($relative -in @('node_modules','.next')) { continue }
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      $parts = $relative.Split('\')
      if ($parts.Count -ne 3 -or $parts[0] -notin @('.claude','.windsurf') -or
          $parts[1] -ne 'skills' -or $parts[2] -notin $skillNames -or
          $item.LinkType -ne 'Junction' -or @($item.Target).Count -ne 1) {
        throw 'Unreviewed link in backup scope; stop without following it.'
      }
      $canonical = Join-Path $rootPath ('.agents\skills\' + $parts[2])
      if ([IO.Path]::GetFullPath([string]$item.Target[0]).TrimEnd('\') -ne $canonical) {
        throw 'Reviewed alias now points to a different target.'
      }
      Assert-OrdinaryAncestors $canonical
      $aliases.Add([pscustomobject]@{ RelativePath=$relative; CanonicalRelativePath=('.agents\skills\'+$parts[2]) })
      $directories.Add($relative)
      Visit-Directory $canonical $relative
    } elseif ($item.PSIsContainer) {
      $directories.Add($relative)
      Visit-Directory $item.FullName $relative
    } elseif ($relative -ne $manifestRelative) {
      $lengthBefore = $item.Length
      $writeBefore = $item.LastWriteTimeUtc.Ticks
      $hash = if ($hashFiles) { (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash } else { $null }
      $item.Refresh()
      if ($item.Length -ne $lengthBefore -or $item.LastWriteTimeUtc.Ticks -ne $writeBefore) {
        throw 'Source changed during inventory; freeze writers and retry.'
      }
      $files.Add([pscustomobject]@{ RelativePath=$relative; Bytes=$lengthBefore; SHA256=$hash })
    }
  }
}

Assert-OrdinaryAncestors $rootPath
if (-not (Test-Path -LiteralPath (Join-Path $rootPath '.git') -PathType Container)) {
  throw 'Expected complete .git directory is missing; this recipe is not for linked worktrees.'
}
if (Test-Path -LiteralPath (Join-Path $rootPath '.git\objects\info\alternates')) {
  throw 'External Git object-store dependency needs separate review.'
}
if ($hashFiles) { Assert-PrivateManifestLocation }
if ($WritePrivateManifest -and (Test-Path -LiteralPath $manifestPath)) {
  throw 'Manifest already exists; never overwrite a frozen snapshot automatically.'
}
Visit-Directory $rootPath ''
$sortedFiles = @($files.ToArray() | Sort-Object RelativePath)
$sortedDirectories = @($directories.ToArray() | Sort-Object)
$summary = [ordered]@{
  Status='INVENTORIED'; Files=$files.Count
  Bytes=($files | Measure-Object Bytes -Sum).Sum
  Directories=$directories.Count; ReviewedAliases=$aliases.Count
  ExcludedRootDirectories=@('node_modules','.next')
  ManifestSelfHashOmitted=$manifestRelative
}
if ($WritePrivateManifest) {
  $snapshot = [ordered]@{
    Version=1; CapturedUtc=[DateTime]::UtcNow.ToString('o')
    CapturedJakarta=([DateTime]::UtcNow.AddHours(7).ToString('yyyy-MM-ddTHH:mm:ss')+'+07:00')
    ExcludedRootDirectories=@('node_modules','.next')
    ManifestSelfHashOmitted=$manifestRelative
    Files=$sortedFiles; Directories=$sortedDirectories; Aliases=$aliases.ToArray()
  }
  $bytes = [Text.Encoding]::UTF8.GetBytes(($snapshot | ConvertTo-Json -Depth 7))
  $stream = [IO.File]::Open($manifestPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try { $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose() }
  $summary.Status='PRIVATE_MANIFEST_CREATED'
} elseif ($VerifyManifest) {
  $snapshot = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($snapshot.Version -ne 1 -or $snapshot.ManifestSelfHashOmitted -ne $manifestRelative -or
      @($snapshot.ExcludedRootDirectories).Count -ne 2 -or
      @(Compare-Object @('node_modules','.next') @($snapshot.ExcludedRootDirectories)).Count -ne 0) {
    throw 'Unexpected manifest format or exclusions.'
  }
  $expected = @{}
  foreach ($entry in $snapshot.Files) {
    if ($expected.ContainsKey($entry.RelativePath)) { throw 'Duplicate manifest entry.' }
    $expected[$entry.RelativePath] = $entry
  }
  $missing = 0; $extra = 0; $different = 0
  foreach ($entry in $sortedFiles) {
    if (-not $expected.ContainsKey($entry.RelativePath)) { $extra++; continue }
    $before = $expected[$entry.RelativePath]
    if ($before.Bytes -ne $entry.Bytes -or $before.SHA256 -ne $entry.SHA256) { $different++ }
    $expected.Remove($entry.RelativePath)
  }
  $missing = $expected.Count
  $directoryDifferences = @(Compare-Object @($snapshot.Directories) $sortedDirectories).Count
  $summary.Missing=$missing; $summary.Extra=$extra; $summary.Different=$different
  $summary.DirectoryDifferences=$directoryDifferences
  if ($missing -or $extra -or $different -or $directoryDifferences) {
    $summary.Status='MISMATCH'; $summary | ConvertTo-Json; exit 1
  }
  $summary.Status='MANIFEST_MATCH'
}
$summary | ConvertTo-Json
