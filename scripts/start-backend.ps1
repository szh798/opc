[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $repoRoot "backend"
$backendPidFile = Join-Path $backendRoot ".backend.pid"
$backendOutLog = Join-Path $backendRoot "backend-dev.out.log"
$backendErrLog = Join-Path $backendRoot "backend-dev.err.log"
$postgresTaskLog = Join-Path $backendRoot "pg-local-task.log"
$runtimeConfigPath = Join-Path $repoRoot "utils\runtime-config.local.js"
$backendHost = "127.0.0.1"
$backendPort = 3000
$postgresHost = "127.0.0.1"
$postgresPort = 5433
$databaseUrl = "postgresql://postgres@127.0.0.1:5433/opc?schema=public"
$postgresTaskName = "opc-postgres-local-task"
$postgresExe = "C:\Program Files\PostgreSQL\16\bin\postgres.exe"
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

function Get-ConfiguredPublicBaseUrl {
  if (-not (Test-Path $runtimeConfigPath)) {
    return "http://127.0.0.1:$backendPort"
  }

  $content = Get-Content $runtimeConfigPath -Raw
  $match = [regex]::Match($content, 'dev\s*:\s*\{[\s\S]*?baseURL\s*:\s*"([^"]+)"')
  if ($match.Success) {
    return $match.Groups[1].Value.Trim()
  }

  return "http://127.0.0.1:$backendPort"
}

function Test-PostgresReady {
  if (-not (Test-Path $postgresReadyExe)) {
    return Test-TcpPort -HostName $postgresHost -Port $postgresPort
  }

  $null = & $postgresReadyExe -h $postgresHost -p $postgresPort -d opc -U postgres 2>$null
  return $LASTEXITCODE -eq 0
}

function Wait-ForPostgresReady {
  param([int]$TimeoutSeconds = 20)

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-PostgresReady) {
      return $true
    }

    Start-Sleep -Milliseconds 500
  }

  return $false
}

function Test-BackendReady {
  try {
    $response = Invoke-RestMethod -Uri "http://$backendHost`:$backendPort/ready" -TimeoutSec 3
    return [bool]$response.ready
  } catch {
    return $false
  }
}

function Wait-ForBackendReady {
  param([int]$TimeoutSeconds = 30)

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-BackendReady) {
      return $true
    }

    Start-Sleep -Milliseconds 750
  }

  return $false
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

  return @($ids | Where-Object { $_ -gt 0 } | Select-Object -Unique)
}

function Get-PostgresProcesses {
  $processes = @(
    Get-CimInstance Win32_Process | Where-Object {
      $_.Name -ieq "postgres.exe" -and
      $_.CommandLine -and
      $_.CommandLine -match [regex]::Escape($postgresDataDir)
    }
  )

  try {
    $portOwnerIds = @(Get-NetTCPConnection -LocalPort $postgresPort -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess)
    if ($portOwnerIds.Count) {
      $processes += @(Get-Process -Id $portOwnerIds -ErrorAction SilentlyContinue)
    }
  } catch {
  }

  return @($processes | Where-Object { $_ } | Sort-Object Id -Unique)
}

function Stop-PostgresProcesses {
  $postgresProcesses = Get-PostgresProcesses
  if (-not $postgresProcesses.Count) {
    return
  }

  $processIds = @(
    $postgresProcesses |
      ForEach-Object {
        if ($_.PSObject.Properties["ProcessId"]) {
          return [int]$_.ProcessId
        }
        if ($_.PSObject.Properties["Id"]) {
          return [int]$_.Id
        }
      } |
      Where-Object { $_ -gt 0 } |
      Select-Object -Unique
  )
  if (-not $processIds.Count) {
    return
  }

  Write-Step "Force-stopping local PostgreSQL processes: $($processIds -join ', ')"
  foreach ($processId in $processIds) {
    try {
      Get-Process -Id $processId -ErrorAction Stop | Stop-Process -Force -ErrorAction Stop
    } catch {
      if ($_.Exception.Message -match "Access is denied") {
        $script:ProcessStopAccessDenied = $true
      }
      Write-Step "Skipping local PostgreSQL process ${processId}: $($_.Exception.Message)"
    }
  }
  Start-Sleep -Seconds 2
}

function Ensure-PostgresTask {
  if (-not (Test-Path $postgresExe)) {
    throw "PostgreSQL executable not found: $postgresExe"
  }

  if (-not (Test-Path $postgresDataDir)) {
    throw "Local PostgreSQL data directory not found: $postgresDataDir"
  }

  $script = "& '$postgresExe' -D '$postgresDataDir' -h $postgresHost -p $postgresPort *>> '$postgresTaskLog'"
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
  $expectedArgs = "-NoProfile -ExecutionPolicy Bypass -EncodedCommand $encoded"
  $existingTask = Get-ScheduledTask -TaskName $postgresTaskName -ErrorAction SilentlyContinue

  if ($existingTask) {
    $existingAction = $existingTask.Actions | Select-Object -First 1
    $existingPrincipal = $existingTask.Principal
    $actionMatches = $existingAction -and
      $existingAction.Execute -eq "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -and
      $existingAction.Arguments -eq $expectedArgs
    $principalMatches = $existingPrincipal -and
      $existingPrincipal.UserId -eq "LOCALSERVICE"

    if ($actionMatches -and $principalMatches) {
      return
    }

    Unregister-ScheduledTask -TaskName $postgresTaskName -Confirm:$false | Out-Null
  }

  $action = New-ScheduledTaskAction `
    -Execute "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -Argument $expectedArgs
  $principal = New-ScheduledTaskPrincipal -UserId "LOCALSERVICE" -LogonType ServiceAccount -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew `
    -StartWhenAvailable
  $task = New-ScheduledTask -Action $action -Principal $principal -Settings $settings

  Register-ScheduledTask -TaskName $postgresTaskName -InputObject $task -Force | Out-Null
}

function Stop-BackendProcesses {
  $backendIds = Get-BackendProcessIds
  if (-not $backendIds.Count) {
    Write-Step "No existing backend process found"
    return
  }

  Write-Step "Stopping backend processes: $($backendIds -join ', ')"
  foreach ($backendId in $backendIds) {
    try {
      Get-Process -Id $backendId -ErrorAction Stop | Stop-Process -Force -ErrorAction Stop
    } catch {
      if ($_.Exception.Message -match "Access is denied") {
        $script:ProcessStopAccessDenied = $true
      }
      Write-Step "Skipping backend process ${backendId}: $($_.Exception.Message)"
    }
  }
  if (Test-Path $backendPidFile) {
    Remove-Item $backendPidFile -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 2
}

function Stop-LocalPostgresGracefully {
  if (-not (Test-Path $postgresCtl)) {
    return $false
  }

  if (-not (Test-Path $postgresDataDir)) {
    return $false
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

function Remove-StalePostmasterPid {
  $postmasterPidFile = Join-Path $postgresDataDir "postmaster.pid"
  if (-not (Test-Path $postmasterPidFile)) {
    return
  }

  $postgresProcesses = Get-PostgresProcesses
  if ($postgresProcesses.Count -gt 0) {
    return
  }

  Write-Step "Removing stale PostgreSQL lock file $postmasterPidFile"
  Remove-Item $postmasterPidFile -Force -ErrorAction SilentlyContinue
}

function Start-LocalPostgres {
  if ((Test-TcpPort -HostName $postgresHost -Port $postgresPort) -and (Test-PostgresReady)) {
    Write-Step "Local PostgreSQL already listening on ${postgresHost}:$postgresPort"
    return
  }

  if (Test-TcpPort -HostName $postgresHost -Port $postgresPort) {
    Write-Step "Local PostgreSQL port is open but the server is unhealthy; restarting it"
    $null = Stop-LocalPostgresGracefully
    Stop-PostgresProcesses
    if ((Test-TcpPort -HostName $postgresHost -Port $postgresPort) -and (-not (Test-PostgresReady)) -and $script:ProcessStopAccessDenied) {
      throw "Local PostgreSQL is unhealthy and could not be restarted from this terminal. Re-run scripts\start-backend.cmd from an elevated terminal once."
    }
  }

  Remove-StalePostmasterPid
  Ensure-PostgresTask
  Write-Step "Starting local PostgreSQL task $postgresTaskName on ${postgresHost}:$postgresPort"
  Start-ScheduledTask -TaskName $postgresTaskName

  if (Wait-ForPostgresReady) {
    return
  }

  throw "Local PostgreSQL did not become ready on ${postgresHost}:$postgresPort. See $postgresTaskLog"
}

function Start-Backend {
  if (-not (Test-Path $backendRoot)) {
    throw "Backend directory not found: $backendRoot"
  }

  $publicBaseUrl = Get-ConfiguredPublicBaseUrl
  Start-LocalPostgres
  Stop-BackendProcesses

  if (Test-TcpPort -HostName $backendHost -Port $backendPort) {
    if ($script:ProcessStopAccessDenied) {
      throw "Port $backendPort is still occupied and the existing backend could not be stopped from this terminal. Re-run scripts\start-backend.cmd from an elevated terminal once."
    }
    throw "Port $backendPort is already in use after stopping old backend. Resolve the port conflict first."
  }

  Write-Step "Starting backend in $backendRoot"

  $backendScript = @"
Set-Location '$backendRoot'
`$env:DATABASE_URL = '$databaseUrl'
`$env:PUBLIC_BASE_URL = '$publicBaseUrl'
npm run dev
"@

  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($backendScript))
  $process = Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $encoded) `
    -WorkingDirectory $backendRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $backendOutLog `
    -RedirectStandardError $backendErrLog `
    -PassThru

  Set-Content -Path $backendPidFile -Value $process.Id -Encoding ascii

  if (-not (Wait-ForBackendReady)) {
    throw "Backend did not become ready. See $backendOutLog and $backendErrLog"
  }

  Write-Step "Backend is ready at http://$backendHost`:$backendPort"
  Write-Host "- PID: $($process.Id)"
  Write-Host "- Database: $databaseUrl"
  Write-Host "- Public base URL: $publicBaseUrl"
  Write-Host "- Health: http://$backendHost`:$backendPort/health"
  Write-Host "- Ready: http://$backendHost`:$backendPort/ready"
  Write-Host "- Stdout: $backendOutLog"
  Write-Host "- Stderr: $backendErrLog"
  Write-Host "- Postgres log: $postgresTaskLog"
}

Start-Backend
