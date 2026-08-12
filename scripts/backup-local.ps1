# Local backup zip (no git remote required).
# Usage: powershell -File scripts/backup-local.ps1

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$repoName = Split-Path -Leaf $repoRoot
$parent = Split-Path -Parent $repoRoot
$backupDir = Join-Path $parent "$repoName-backups"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$zipPath = Join-Path $backupDir "$repoName-$stamp.zip"

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

# Exclude bulky / regenerable paths
$exclude = @(
	"\\node_modules\\",
	"\\.git\\",
	"\\dist\\",
	"\\tmp\\",
	"\\.cache\\"
)

$temp = Join-Path $env:TEMP "sdb-backup-$stamp"
if (Test-Path $temp) { Remove-Item -Recurse -Force $temp }
New-Item -ItemType Directory -Force -Path $temp | Out-Null

robocopy $repoRoot (Join-Path $temp $repoName) /E /NFL /NDL /NJH /NJS /nc /ns /np `
	/XD node_modules .git dist tmp .cache `
	| Out-Null
# robocopy exit codes 0-7 are success-ish
if ($LASTEXITCODE -ge 8) {
	throw "robocopy failed with exit $LASTEXITCODE"
}

Compress-Archive -Path (Join-Path $temp $repoName) -DestinationPath $zipPath -Force
Remove-Item -Recurse -Force $temp

Write-Host "Backup written: $zipPath"
Get-Item $zipPath | Format-List FullName, Length, LastWriteTime
