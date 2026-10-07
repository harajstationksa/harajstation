param([string]$Destination = "$PSScriptRoot/../backups/daily")
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
$latest = (ssh -o BatchMode=yes haraj "find /var/backups/harajstation -maxdepth 1 -type f -name 'haraj-*.tar.gz.age' | sort | tail -n 1").Trim()
if ($LASTEXITCODE -ne 0 -or $latest -notmatch '^/var/backups/harajstation/haraj-[0-9TZ-]+\.tar\.gz\.age$') { throw 'Cannot locate a valid encrypted backup' }
$target = Join-Path $Destination ([IO.Path]::GetFileName($latest))
scp "haraj:$latest" $target
if ($LASTEXITCODE -ne 0) { throw 'Backup download failed' }
$expected = (ssh -o BatchMode=yes haraj "sha256sum '$latest'").Split(' ')[0]
if ($LASTEXITCODE -ne 0 -or (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $expected) { throw 'Backup checksum mismatch' }
Write-Output "Encrypted backup verified: $target"
