$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendRoot = Resolve-Path (Join-Path $ScriptDir "..")

Set-Location $BackendRoot

& powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local-postgres.ps1 start
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

& powershell -NoProfile -ExecutionPolicy Bypass -File scripts/stop-backend.ps1 -Port 3000
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

& npm.cmd run db:deploy
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

& npm.cmd run dev
exit $LASTEXITCODE
