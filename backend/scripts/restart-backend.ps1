param(
  [int]$Port = 3000,
  [int]$ReadyTimeoutSeconds = 45,
  [switch]$SkipDbDeploy,
  [switch]$NoFixDatabaseUrl
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$EnvPath = Join-Path $BackendRoot ".env"
$PidPath = Join-Path $BackendRoot ".backend.pid"
$LogFilesPath = Join-Path $BackendRoot ".backend.logfiles"

function Test-TcpPort {
  param(
    [string]$HostName,
    [int]$Port
  )

  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne(1200, $false)) {
      return $false
    }
    $client.EndConnect($async)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Repair-LocalDatabaseUrl {
  if ($NoFixDatabaseUrl) {
    Write-Host "Skip DATABASE_URL auto-fix."
    return
  }

  if (-not (Test-Path $EnvPath)) {
    throw "Missing backend .env: $EnvPath"
  }

  $content = @(Get-Content -LiteralPath $EnvPath)
  $databaseLine = $content | Where-Object { $_ -match "^DATABASE_URL=" } | Select-Object -First 1

  if (-not $databaseLine) {
    throw "DATABASE_URL is missing in $EnvPath"
  }

  $local5432Down = -not (Test-TcpPort -HostName "127.0.0.1" -Port 5432)
  $local5433Up = Test-TcpPort -HostName "127.0.0.1" -Port 5433

  if ($databaseLine -match "127\.0\.0\.1:5432" -and $local5432Down -and $local5433Up) {
    $replacement = "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/opc?schema=public"
    $nextContent = $content | ForEach-Object {
      if ($_ -match "^DATABASE_URL=") { $replacement } else { $_ }
    }
    Set-Content -LiteralPath $EnvPath -Value $nextContent -Encoding utf8
    Write-Host "Fixed DATABASE_URL: 127.0.0.1:5432 -> 127.0.0.1:5433"
    return
  }

  Write-Host "DATABASE_URL check passed."
}

function Invoke-Npm {
  param([string[]]$Arguments)

  & npm.cmd @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "npm $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

function Wait-BackendReady {
  $deadline = (Get-Date).AddSeconds($ReadyTimeoutSeconds)
  $readyUrl = "http://127.0.0.1:$Port/ready"
  $lastError = ""

  do {
    try {
      $ready = Invoke-RestMethod -Uri $readyUrl -TimeoutSec 5
      if ($ready -and $ready.ready) {
        return $ready
      }
      $lastError = "ready=false"
    } catch {
      $lastError = $_.Exception.Message
    }

    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)

  throw "Backend did not become ready within ${ReadyTimeoutSeconds}s. Last error: $lastError"
}

Set-Location $BackendRoot

Write-Host "Starting local PostgreSQL..."
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ScriptDir "local-postgres.ps1") start
if ($LASTEXITCODE -ne 0) {
  throw "local-postgres start failed with exit code $LASTEXITCODE"
}

Repair-LocalDatabaseUrl

Write-Host "Stopping backend on port $Port..."
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ScriptDir "stop-backend.ps1") -Port $Port
if ($LASTEXITCODE -ne 0) {
  throw "stop-backend failed with exit code $LASTEXITCODE"
}

if (-not $SkipDbDeploy) {
  Write-Host "Applying Prisma migrations..."
  Invoke-Npm -Arguments @("run", "db:deploy")
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outLog = Join-Path $BackendRoot "backend-dev-$stamp.out.log"
$errLog = Join-Path $BackendRoot "backend-dev-$stamp.err.log"

Write-Host "Starting backend..."
$process = Start-Process `
  -FilePath "powershell.exe" `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "npm run dev") `
  -WorkingDirectory $BackendRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -PassThru

Set-Content -LiteralPath $PidPath -Value $process.Id -Encoding ascii
Set-Content -LiteralPath $LogFilesPath -Value "$outLog`n$errLog" -Encoding utf8

try {
  $ready = Wait-BackendReady
} catch {
  Write-Host "Backend startup failed. Recent stdout:"
  if (Test-Path $outLog) {
    Get-Content -LiteralPath $outLog -Tail 80
  }
  Write-Host "Backend startup failed. Recent stderr:"
  if (Test-Path $errLog) {
    Get-Content -LiteralPath $errLog -Tail 80
  }
  throw
}

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1

Write-Host "Backend restarted."
Write-Host "Parent PID: $($process.Id)"
if ($listener) {
  Write-Host "Listener PID: $($listener.OwningProcess)"
}
Write-Host "Ready: $($ready.ready)"
Write-Host "Ready checks: $($ready.checks | ConvertTo-Json -Compress)"
Write-Host "Local: http://127.0.0.1:$Port"
Write-Host "Logs:"
Write-Host "  stdout: $outLog"
Write-Host "  stderr: $errLog"
