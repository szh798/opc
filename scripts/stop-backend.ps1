[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $repoRoot "backend"
$backendPidFile = Join-Path $backendRoot ".backend.pid"
$backendHost = "127.0.0.1"
$backendPort = 3000
$postgresHost = "127.0.0.1"
$postgresPort = 5433
$postgresTaskName = "opc-postgres-local-task"
$postgresDataDir = Join-Path $backendRoot ".local-postgres\data"

function Write-Step {
  param([string]$Message)
  Write-Host "==> $Message"
}

function Test-TcpPort {
  param(
    [string]$HostName,
    [int]$Port,
    [int]$TimeoutMs = 1000
  )

  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
      return $false
    }

    $client.EndConnect($async)
    return $true
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Get-BackendProcessIds {
  $processes = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq "node.exe" -and
    $_.CommandLine -and
    $_.CommandLine -match [regex]::Escape($backendRoot) -and
    (
      $_.CommandLine -match 'npm-cli\.js"\s+run\s+dev' -or
      $_.CommandLine -match 'src/main\.ts'
    )
  }

  $ids = @($processes | Select-Object -ExpandProperty ProcessId -Unique)

  if (Test-Path $backendPidFile) {
    $wrapperPid = Get-Content $backendPidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($wrapperPid -match '^\d+$') {
      $ids += [int]$wrapperPid
    }
  }

  return @($ids | Where-Object { $_ -gt 0 } | Select-Object -Unique)
}

function Get-PostgresProcessIds {
  $processes = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -ieq "postgres.exe" -and
    $_.CommandLine -and
    $_.CommandLine -match [regex]::Escape($postgresDataDir)
  }

  return @($processes | Select-Object -ExpandProperty ProcessId -Unique)
}

function Stop-ProcessIds {
  param(
    [int[]]$Ids,
    [string]$Label
  )

  $targetIds = @($Ids | Where-Object { $_ -gt 0 } | Select-Object -Unique)
  if (-not $targetIds.Count) {
    Write-Step "No $Label processes found"
    return
  }

  Write-Step "Stopping $Label processes: $($targetIds -join ', ')"
  Get-Process -Id $targetIds -ErrorAction SilentlyContinue | Stop-Process -Force
}

function Stop-PostgresTask {
  $task = Get-ScheduledTask -TaskName $postgresTaskName -ErrorAction SilentlyContinue
  if (-not $task) {
    return
  }

  try {
    Stop-ScheduledTask -TaskName $postgresTaskName -ErrorAction SilentlyContinue
  } catch {
  }
}

Stop-ProcessIds -Ids (Get-BackendProcessIds) -Label "backend"
Stop-PostgresTask
Stop-ProcessIds -Ids (Get-PostgresProcessIds) -Label "local PostgreSQL"

if (Test-Path $backendPidFile) {
  Remove-Item $backendPidFile -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2

$backendListening = Test-TcpPort -HostName $backendHost -Port $backendPort
$postgresListening = Test-TcpPort -HostName $postgresHost -Port $postgresPort

Write-Host ""
Write-Host "Stopped:"
Write-Host "- Backend port $backendPort listening: $backendListening"
Write-Host "- PostgreSQL port $postgresPort listening: $postgresListening"
