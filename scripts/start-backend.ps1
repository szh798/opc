[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $repoRoot "backend"
$backendPidFile = Join-Path $backendRoot ".backend.pid"
$backendOutLog = Join-Path $backendRoot "backend-dev.out.log"
$backendErrLog = Join-Path $backendRoot "backend-dev.err.log"
$postgresTaskLog = Join-Path $backendRoot "pg-local-task.log"
$backendHost = "127.0.0.1"
$backendPort = 3000
$postgresHost = "127.0.0.1"
$postgresPort = 5433
$databaseUrl = "postgresql://postgres@127.0.0.1:5433/opc?schema=public"
$postgresTaskName = "opc-postgres-local-task"
$postgresExe = "C:\Program Files\PostgreSQL\16\bin\postgres.exe"
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

function Get-PostgresProcesses {
  return @(
    Get-CimInstance Win32_Process | Where-Object {
      $_.Name -ieq "postgres.exe" -and
      $_.CommandLine -and
      $_.CommandLine -match [regex]::Escape($postgresDataDir)
    }
  )
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
  Get-Process -Id $backendIds -ErrorAction SilentlyContinue | Stop-Process -Force
  if (Test-Path $backendPidFile) {
    Remove-Item $backendPidFile -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 2
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
  if (Test-TcpPort -HostName $postgresHost -Port $postgresPort) {
    Write-Step "Local PostgreSQL already listening on ${postgresHost}:$postgresPort"
    return
  }

  Remove-StalePostmasterPid
  Ensure-PostgresTask
  Write-Step "Starting local PostgreSQL task $postgresTaskName on ${postgresHost}:$postgresPort"
  Start-ScheduledTask -TaskName $postgresTaskName

  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline) {
    if (Test-TcpPort -HostName $postgresHost -Port $postgresPort) {
      return
    }

    Start-Sleep -Milliseconds 500
  }

  throw "Local PostgreSQL did not start on ${postgresHost}:$postgresPort. See $postgresTaskLog"
}

function Start-Backend {
  if (-not (Test-Path $backendRoot)) {
    throw "Backend directory not found: $backendRoot"
  }

  Start-LocalPostgres
  Stop-BackendProcesses

  if (Test-TcpPort -HostName $backendHost -Port $backendPort) {
    throw "Port $backendPort is already in use after stopping old backend. Resolve the port conflict first."
  }

  Write-Step "Starting backend in $backendRoot"

  $backendScript = @"
Set-Location '$backendRoot'
`$env:DATABASE_URL = '$databaseUrl'
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
  Write-Host "- Health: http://$backendHost`:$backendPort/health"
  Write-Host "- Ready: http://$backendHost`:$backendPort/ready"
  Write-Host "- Stdout: $backendOutLog"
  Write-Host "- Stderr: $backendErrLog"
  Write-Host "- Postgres log: $postgresTaskLog"
}

Start-Backend
