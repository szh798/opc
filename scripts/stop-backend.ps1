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
$postgresCtl = "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe"
$postgresReadyExe = "C:\Program Files\PostgreSQL\16\bin\pg_isready.exe"
$postgresDataDir = Join-Path $backendRoot ".local-postgres\data"
$script:ProcessStopAccessDenied = $false

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

function Test-PostgresReady {
  if (-not (Test-Path $postgresReadyExe)) {
    return Test-TcpPort -HostName $postgresHost -Port $postgresPort
  }

  $null = & $postgresReadyExe -h $postgresHost -p $postgresPort -d opc -U postgres 2>$null
  return $LASTEXITCODE -eq 0
}

function Get-ProcessDescendantIds {
  param([int[]]$RootIds)

  $allProcesses = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId)
  $pending = New-Object System.Collections.Generic.Queue[int]
  $seen = New-Object System.Collections.Generic.HashSet[int]

  foreach ($rootId in @($RootIds | Where-Object { $_ -gt 0 })) {
    if ($seen.Add([int]$rootId)) {
      $pending.Enqueue([int]$rootId)
    }
  }

  while ($pending.Count -gt 0) {
    $currentId = $pending.Dequeue()
    foreach ($process in $allProcesses) {
      if ($process.ParentProcessId -eq $currentId) {
        $childId = [int]$process.ProcessId
        if ($seen.Add($childId)) {
          $pending.Enqueue($childId)
        }
      }
    }
  }

  return @($seen | Sort-Object)
}

function Get-BackendProcessIds {
  $currentPid = $PID
  $processes = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq "node.exe" -and
    $_.ProcessId -ne $currentPid -and
    $_.CommandLine -and
    $_.CommandLine -match [regex]::Escape($backendRoot) -and
    (
      $_.CommandLine -match 'npm-cli\.js"\s+run\s+dev' -or
      $_.CommandLine -match 'src/main\.ts'
    )
  }

  $ids = @($processes | Select-Object -ExpandProperty ProcessId -Unique)

  try {
    $ids += @(Get-NetTCPConnection -LocalPort $backendPort -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess)
  } catch {
  }

  if (Test-Path $backendPidFile) {
    $wrapperPid = Get-Content $backendPidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($wrapperPid -match '^\d+$') {
      $ids += [int]$wrapperPid
      $ids += Get-ProcessDescendantIds -RootIds @([int]$wrapperPid)
    }
  }

  return @($ids | Where-Object { $_ -gt 0 -and $_ -ne $currentPid } | Select-Object -Unique)
}

function Get-PostgresProcessIds {
  $currentPid = $PID
  $processes = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -ieq "postgres.exe" -and
    $_.ProcessId -ne $currentPid -and
    $_.CommandLine -and
    $_.CommandLine -match [regex]::Escape($postgresDataDir)
  }

  $ids = @($processes | Select-Object -ExpandProperty ProcessId -Unique)

  try {
    $ids += @(Get-NetTCPConnection -LocalPort $postgresPort -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess)
  } catch {
  }

  return @($ids | Where-Object { $_ -gt 0 -and $_ -ne $currentPid } | Select-Object -Unique)
}

function Stop-ProcessIds {
  param(
    [int[]]$Ids,
    [string]$Label
  )

  $currentPid = $PID
  $targetIds = @($Ids | Where-Object { $_ -gt 0 -and $_ -ne $currentPid } | Select-Object -Unique)
  if (-not $targetIds.Count) {
    Write-Step "No $Label processes found"
    return
  }

  Write-Step "Stopping $Label processes: $($targetIds -join ', ')"
  foreach ($targetId in $targetIds) {
    try {
      Get-Process -Id $targetId -ErrorAction Stop | Stop-Process -Force -ErrorAction Stop
    } catch {
      if ($_.Exception.Message -match "Access is denied") {
        $script:ProcessStopAccessDenied = $true
      }
      Write-Step "Skipping $Label process ${targetId}: $($_.Exception.Message)"
    }
  }
}

function Stop-LocalPostgresGracefully {
  if (-not (Test-Path $postgresCtl)) {
    return $false
  }

  if (-not ((Test-TcpPort -HostName $postgresHost -Port $postgresPort) -or (Test-Path (Join-Path $postgresDataDir "postmaster.pid")))) {
    return $true
  }

  try {
    Write-Step "Stopping local PostgreSQL gracefully"
    & $postgresCtl -D $postgresDataDir -m fast -w -t 20 stop | Out-Null
    if ($LASTEXITCODE -ne 0) {
      return $false
    }
    Start-Sleep -Seconds 1
    return $true
  } catch {
    return $false
  }
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
$null = Stop-LocalPostgresGracefully
Stop-PostgresTask

if (Test-TcpPort -HostName $postgresHost -Port $postgresPort) {
  Stop-ProcessIds -Ids (Get-PostgresProcessIds) -Label "local PostgreSQL"
}

if (Test-Path $backendPidFile) {
  Remove-Item $backendPidFile -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2

$backendListening = Test-TcpPort -HostName $backendHost -Port $backendPort
$postgresListening = Test-TcpPort -HostName $postgresHost -Port $postgresPort
$postgresReady = Test-PostgresReady

Write-Host ""
Write-Host "Stopped:"
Write-Host "- Backend port $backendPort listening: $backendListening"
Write-Host "- PostgreSQL port $postgresPort listening: $postgresListening"
Write-Host "- PostgreSQL ready: $postgresReady"
if ($script:ProcessStopAccessDenied -and ($backendListening -or $postgresListening -or (-not $postgresReady))) {
  Write-Host "- Action required: rerun scripts\stop-backend.cmd from an elevated terminal to terminate the existing backend/PostgreSQL processes."
}
