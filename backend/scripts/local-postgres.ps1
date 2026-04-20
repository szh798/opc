param(
  [ValidateSet("start", "stop", "status", "init")]
  [string]$Action = "start"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendRoot = Resolve-Path (Join-Path $ScriptDir "..")
$DataDir = Join-Path $BackendRoot ".local-postgres\data"
$OutLog = Join-Path $BackendRoot "pg-local-start.out.log"
$ErrLog = Join-Path $BackendRoot "pg-local-start.err.log"
$HostName = "127.0.0.1"
$Port = if ($env:LOCAL_POSTGRES_PORT) { $env:LOCAL_POSTGRES_PORT } else { "5433" }
$DatabaseName = if ($env:LOCAL_POSTGRES_DB) { $env:LOCAL_POSTGRES_DB } else { "opc" }
$UserName = if ($env:LOCAL_POSTGRES_USER) { $env:LOCAL_POSTGRES_USER } else { "postgres" }

function Find-PostgresBin {
  if ($env:POSTGRES_BIN -and (Test-Path (Join-Path $env:POSTGRES_BIN "postgres.exe"))) {
    return $env:POSTGRES_BIN
  }

  $defaultBin = "C:\Program Files\PostgreSQL\16\bin"
  if (Test-Path (Join-Path $defaultBin "postgres.exe")) {
    return $defaultBin
  }

  $postgresRoot = Join-Path $env:ProgramFiles "PostgreSQL"
  if (Test-Path $postgresRoot) {
    $candidate = Get-ChildItem $postgresRoot -Directory |
      Sort-Object Name -Descending |
      ForEach-Object { Join-Path $_.FullName "bin" } |
      Where-Object { Test-Path (Join-Path $_ "postgres.exe") } |
      Select-Object -First 1

    if ($candidate) {
      return $candidate
    }
  }

  throw "PostgreSQL was not found. Install PostgreSQL 16 or set POSTGRES_BIN to the folder containing postgres.exe."
}

$PgBin = Find-PostgresBin
$PostgresExe = Join-Path $PgBin "postgres.exe"
$InitDbExe = Join-Path $PgBin "initdb.exe"
$PgIsReadyExe = Join-Path $PgBin "pg_isready.exe"
$PsqlExe = Join-Path $PgBin "psql.exe"
$CreatedbExe = Join-Path $PgBin "createdb.exe"

function Get-LocalPostgresProcess {
  Get-CimInstance Win32_Process -Filter "Name = 'postgres.exe'" |
    Where-Object { $_.CommandLine -like "*.local-postgres*" }
}

function Initialize-LocalPostgres {
  $versionFile = Join-Path $DataDir "PG_VERSION"
  if (Test-Path $versionFile) {
    Write-Host "Local PostgreSQL data directory already exists: $DataDir"
    return
  }

  New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
  Write-Host "Initializing local PostgreSQL data directory: $DataDir"
  & $InitDbExe -D $DataDir -U $UserName --auth=trust --encoding=UTF8 --locale=C
}

function Wait-ForPostgres {
  $deadline = (Get-Date).AddSeconds(40)
  do {
    & $PgIsReadyExe -h $HostName -p $Port -U $UserName | Out-Null
    if ($LASTEXITCODE -eq 0) {
      return
    }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)

  throw "Local PostgreSQL did not become ready on ${HostName}:${Port}. Check $ErrLog."
}

function Ensure-Database {
  $exists = & $PsqlExe -h $HostName -p $Port -U $UserName -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DatabaseName'"
  if (($exists | Out-String).Trim() -eq "1") {
    Write-Host "Database '$DatabaseName' already exists."
    return
  }

  & $CreatedbExe -h $HostName -p $Port -U $UserName $DatabaseName
  Write-Host "Created database '$DatabaseName'."
}

function Start-LocalPostgres {
  Initialize-LocalPostgres

  $existing = Get-LocalPostgresProcess | Select-Object -First 1
  if ($existing) {
    Write-Host "Local PostgreSQL is already running. PID: $($existing.ProcessId)"
  } else {
    Write-Host "Starting local PostgreSQL on ${HostName}:${Port}..."
    $process = Start-Process `
      -FilePath $PostgresExe `
      -ArgumentList @("-D", $DataDir, "-h", $HostName, "-p", $Port) `
      -WorkingDirectory $BackendRoot `
      -RedirectStandardOutput $OutLog `
      -RedirectStandardError $ErrLog `
      -PassThru

    Write-Host "Local PostgreSQL PID: $($process.Id)"
  }

  Wait-ForPostgres
  Ensure-Database
  Write-Host "Local PostgreSQL is ready at ${HostName}:${Port}."
}

function Stop-LocalPostgres {
  $processes = @(Get-LocalPostgresProcess)
  if ($processes.Count -eq 0) {
    Write-Host "Local PostgreSQL is not running."
    return
  }

  foreach ($process in $processes) {
    Write-Host "Stopping local PostgreSQL PID: $($process.ProcessId)"
    Stop-Process -Id $process.ProcessId -Force
  }
}

function Show-Status {
  $process = Get-LocalPostgresProcess | Select-Object -First 1
  if ($process) {
    & $PgIsReadyExe -h $HostName -p $Port -U $UserName
    Write-Host "PID: $($process.ProcessId)"
    return
  }

  Write-Host "Local PostgreSQL is not running."
}

switch ($Action) {
  "init" { Initialize-LocalPostgres }
  "start" { Start-LocalPostgres }
  "stop" { Stop-LocalPostgres }
  "status" { Show-Status }
}
