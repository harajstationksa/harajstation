param([Parameter(Mandatory=$true)][string]$EncryptedPath,[Parameter(Mandatory=$true)][string]$OutputPath)
Add-Type -AssemblyName System.Security
if (Test-Path -LiteralPath $OutputPath) { throw "Output already exists" }
$entropy = [Text.Encoding]::UTF8.GetBytes("HarajStation-backup-v1")
$plain = [Security.Cryptography.ProtectedData]::Unprotect(
  [IO.File]::ReadAllBytes([IO.Path]::GetFullPath($EncryptedPath)), $entropy,
  [Security.Cryptography.DataProtectionScope]::CurrentUser)
[IO.File]::WriteAllBytes([IO.Path]::GetFullPath($OutputPath),$plain)
Write-Output "Backup restored. Requires the original Windows account and machine."
