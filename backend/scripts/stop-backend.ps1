param(
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)

if ($listeners.Count -eq 0) {
  Write-Host "No backend listener found on port $Port."
  return
}

$listenerProcessIds = $listeners |
  Select-Object -ExpandProperty OwningProcess -Unique |
  Where-Object { $_ -and $_ -gt 0 }

foreach ($processId in $listenerProcessIds) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
  if (!$process) {
    continue
  }

  $commandLine = [string]$process.CommandLine
  if ($commandLine -and $commandLine.Contains($BackendRoot)) {
    Write-Host "Stopping existing backend on port $Port. PID: $processId"
    Stop-Process -Id $processId -Force
    continue
  }

  throw "Port $Port is used by PID $processId, but it does not look like this backend. Stop it manually or choose another port."
}
