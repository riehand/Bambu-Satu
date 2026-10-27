# Ciphertext-only destination. Creation is allowed only after separate export approval.
[CmdletBinding()]
param([switch]$CreateApprovedDirectory)
$ErrorActionPreference='Stop'
try {
  $parent='D:\WellBeingHub-Backups'
  $target=Join-Path $parent 'Supabase-Phase2-20261026-Retry01'
  $item=Get-Item -LiteralPath $parent -Force
  while($null -ne $item){
    if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirect'}
    $item=$item.Parent
  }
  $acl=Get-Acl -LiteralPath $parent
  $allowed=@([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544')
  if(-not $acl.AreAccessRulesProtected){throw 'Parent inheritance'}
  foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
    if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin $allowed){throw 'Broad access'}
  }
  if((Get-PSDrive D).Free -lt 512MB){throw 'Capacity'}
  if(Test-Path -LiteralPath $target){throw 'Reserved run directory already exists; retain and review'}
  if($CreateApprovedDirectory){
    New-Item -ItemType Directory -Path $target -ErrorAction Stop|Out-Null
    foreach($rule in (Get-Acl -LiteralPath $target).GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
      if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin $allowed){throw 'Unexpected inherited access'}
    }
  }
  [pscustomobject]@{ParentRestricted=$true;NoReparseRedirect=$true;FreeBytes=(Get-PSDrive D).Free;RunDirectoryCreated=[bool]$CreateApprovedDirectory;Target=$target}|ConvertTo-Json
}catch{Write-Output 'Destination prerequisite failed; no raw diagnostics.';exit 1}
