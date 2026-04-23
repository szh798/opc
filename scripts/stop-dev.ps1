[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $repoRoot "backend"
$backendPidFile = Join-Path $backendRoot ".backend.pid"
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

function Get-MatchingProcesses {
  $processes = Get-CimInstance Win32_Process

  $backendProcesses = $processes | Where-Object {
    $_.CommandLine -and
    $_.CommandLine -match [regex]::Escape($backendRoot) -and
    (
      $_.CommandLine -match 'npm-cli\.js"\s+run\s+dev' -or
      $_.CommandLine -match 'src/main\.ts'
    )
  }

  $postgresProcesses = $processes | Where-Object {
    $_.CommandLine -and
    $_.Name -ieq "postgres.exe" -and
    $_.CommandLine -match [regex]::Escape($postgresDataDir)
  }

  return @{
    Backend = @($backendProcesses)
    Postgres = @($postgresProcesses)
  }
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

Write-Step "Repo root: $repoRoot"

$matches = Get-MatchingProcesses
$backendIds = @($matches.Backend | Select-Object -ExpandProperty ProcessId -Unique)
$postgresIds = @($matches.Postgres | Select-Object -ExpandProperty ProcessId -Unique)

if (Test-Path $backendPidFile) {
  $wrapperPid = Get-Content $backendPidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($wrapperPid -match '^\d+$') {
    $backendIds += [int]$wrapperPid
  }
}

Stop-ProcessIds -Ids $backendIds -Label "backend"
Stop-ProcessIds -Ids $postgresIds -Label "local PostgreSQL"

if (Test-Path $backendPidFile) {
  Remove-Item $backendPidFile -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2

$backendListening = Test-TcpPort -HostName "127.0.0.1" -Port 3000
$postgresListening = Test-TcpPort -HostName "127.0.0.1" -Port 5433

Write-Host ""
Write-Host "Stopped:"
Write-Host "- Backend port 3000 listening: $backendListening"
Write-Host "- PostgreSQL port 5433 listening: $postgresListening"
