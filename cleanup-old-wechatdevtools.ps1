$ErrorActionPreference = "Stop"

$log = Join-Path $env:TEMP "cleanup-old-wechatdevtools.log"

function Write-Log {
  param([string]$Message)
  $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -LiteralPath $log -Value $line
  Write-Host $Message
}

New-Item -ItemType File -Path $log -Force | Out-Null

$parent = "C:\Program Files (x86)\Tencent"
if (-not (Test-Path -LiteralPath $parent)) {
  Write-Log "Parent directory not found: $parent"
  exit 0
}

$targets = Get-ChildItem -LiteralPath $parent -Directory |
  Where-Object { Test-Path (Join-Path $_.FullName "wechatdevtools.exe") }

if (-not $targets) {
  Write-Log "No legacy WeChat DevTools directory found under: $parent"
  exit 0
}

if ($targets.Count -gt 1) {
  $paths = $targets | ForEach-Object { $_.FullName }
  throw ("Multiple matching directories found:`n" + ($paths -join "`n"))
}

$target = $targets[0].FullName
$expected = [System.IO.Path]::GetFullPath($target)
Write-Log "Starting cleanup for $expected"

Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -like "$expected*" } |
  Stop-Process -Force -ErrorAction SilentlyContinue

Write-Log "Deleting $expected"
Remove-Item -LiteralPath $expected -Recurse -Force

if (Test-Path -LiteralPath $expected) {
  throw "Delete failed: $expected"
}

Write-Log "Removed: $expected"
