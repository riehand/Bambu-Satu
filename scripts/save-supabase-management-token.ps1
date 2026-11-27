param()

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Script ini membutuhkan Windows DPAPI.' }
$privateDirectory = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'WellBeingHub'
$tokenPath = Join-Path $privateDirectory 'supabase-management-token.dpapi'
if (Test-Path -LiteralPath $tokenPath) {
    throw 'Token privat sudah tersedia. File tidak ditimpa; lanjutkan verifikasi akses dengan Codex.'
}
if (-not (Test-Path -LiteralPath $privateDirectory)) {
    New-Item -ItemType Directory -Path $privateDirectory | Out-Null
}
$directory = Get-Item -LiteralPath $privateDirectory
if ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) {
    throw 'Direktori privat tidak boleh berupa junction atau symbolic link.'
}
$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$systemSid = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
$acl = [Security.AccessControl.DirectorySecurity]::new()
$acl.SetOwner($currentSid)
$acl.SetAccessRuleProtection($true, $false)
foreach ($sid in @($currentSid, $systemSid)) {
    $rule = [Security.AccessControl.FileSystemAccessRule]::new(
        $sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $privateDirectory -AclObject $acl

$secureToken = Read-Host 'Tempel Supabase access token (input tersembunyi; jangan kirim melalui chat)' -AsSecureString
try {
    if ($secureToken.Length -eq 0) { throw 'Token kosong; tidak disimpan.' }
    # Without -Key, Windows encrypts with DPAPI for the current Windows user.
    $encrypted = ConvertFrom-SecureString -SecureString $secureToken
    $stream = [IO.File]::Open($tokenPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes($encrypted)
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Flush($true)
    } finally { $stream.Dispose() }
    Write-Host 'Token tersimpan terenkripsi di luar repository, untuk pengguna Windows ini saja.'
    Write-Host 'Token belum diverifikasi. Beri tahu Codex: token sudah disiapkan. Jangan kirim nilainya.'
} finally { $secureToken.Dispose() }
