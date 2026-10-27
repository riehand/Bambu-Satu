$ErrorActionPreference='Stop'
try {
  $dir='D:\WellBeingHub-Backups\Supabase-Phase2-20261026-Retry01'
  $allowed=@([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544')
  $item=Get-Item -LiteralPath $dir -Force
  while($null -ne $item){
    if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirect'}
    $item=$item.Parent
  }
  foreach($path in @($dir,'D:\WellBeingHub-Backups')) {
    foreach($rule in (Get-Acl -LiteralPath $path).GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
      if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin $allowed){throw 'Broad access'}
    }
  }
  if(Test-Path -LiteralPath (Join-Path $dir 'recovery.json.age')){throw 'Existing output'}
  if((Get-PSDrive D).Free -lt 10MB){throw 'Capacity'}
  Write-Output '{"safe":true,"unused":true,"restricted":true}'
}catch{Write-Output 'Recovery destination check failed; raw diagnostics suppressed.';exit 1}
