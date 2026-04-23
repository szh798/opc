[CmdletBinding()]
param(
  [switch]$SkipDevTools
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $repoRoot "backend"

$backendPidFile = Join-Path $backendRoot ".backend.pid"
$backendOutLog = Join-Path $backendRoot "backend-dev.out.log"
$backendErrLog = Join-Path $backendRoot "backend-dev.err.log"
$postgresOutLog = Join-Path $backendRoot "pg-local-start.out.log"
$postgresErrLog = Join-Path $backendRoot "pg-local-start.err.log"

$backendHost = "127.0.0.1"
$backendPort = 3000
$postgresHost = "127.0.0.1"
$postgresPort = 5433
$databaseUrl = "postgresql://postgres@127.0.0.1:5433/opc?schema=public"

$postgresExe = "C:\Program Files\PostgreSQL\16\bin\postgres.exe"
$postgresDataDir = Join-Path $backendRoot ".local-postgres\data"

function Write-Step {
  param([string]$Message)
  Write-Host "==> $Message"
}

function Find-FirstFile {
  param(
    [string[]]$Roots,
    [string]$Filter
  )

  foreach ($root in $Roots) {
    if (-not (Test-Path $root)) {
      continue
    }

    $match = Get-ChildItem -Path $root -Filter $Filter -File -Recurse -ErrorAction SilentlyContinue |
      Select-Object -First 1

    if ($match) {
      return $match.FullName
    }
  }

  return $null
}

function Find-WeChatDevToolsDir {
  param(
    [string[]]$CandidateDirs,
    [string[]]$SearchRoots
  )

  $preferredMatch = @(
    $CandidateDirs |
      Where-Object {
        $_ -and
        (Test-Path (Join-Path $_ "wechatdevtools.exe"))
      } |
      Select-Object -Unique |
      Select-Object -First 1
  )

  if ($preferredMatch.Count -gt 0) {
    return $preferredMatch[0]
  }

  foreach ($root in $SearchRoots) {
    if (-not (Test-Path $root)) {
      continue
    }

    $match = Get-ChildItem -Path $root -Filter "wechatdevtools.exe" -File -Recurse -ErrorAction SilentlyContinue |
      Select-Object -First 1

    if ($match) {
      return (Split-Path -Parent $match.FullName)
    }
  }

  return $null
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

function Get-PreferredLanIPv4 {
  $candidates = @(Get-NetIPConfiguration -ErrorAction SilentlyContinue | Where-Object {
    $_.IPv4Address -and
    $_.IPv4DefaultGateway -and
    $_.NetAdapter.Status -eq "Up"
  })

  foreach ($candidate in $candidates) {
    foreach ($address in @($candidate.IPv4Address)) {
      $ip = [string]$address.IPAddress
      if (
        $ip -and
        $ip -notmatch '^127\.' -and
        $ip -notmatch '^169\.254\.' -and
        $ip -notmatch '^198\.18\.'
      ) {
        return $ip
      }
    }
  }

  return $null
}

function Stop-ProcessTree {
  param([int]$ProcessId)

  if ($ProcessId -le 0) {
    return
  }

  $childIds = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty ProcessId)

  foreach ($childId in $childIds) {
    Stop-ProcessTree -ProcessId $childId
  }

  Get-Process -Id $ProcessId -ErrorAction SilentlyContinue | Stop-Process -Force
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

function Invoke-UnelevatedPowerShell {
  param([string]$Script)

  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Script))
  $shell = New-Object -ComObject Shell.Application
  $shell.ShellExecute(
    "powershell.exe",
    "-NoProfile -ExecutionPolicy Bypass -EncodedCommand $encoded",
    "",
    "open",
    0
  ) | Out-Null
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

function Start-LocalPostgres {
  if (Test-TcpPort -HostName $postgresHost -Port $postgresPort) {
    Write-Step "PostgreSQL already listening on ${postgresHost}:$postgresPort"
    return
  }

  if (-not (Test-Path $postgresExe)) {
    throw "PostgreSQL executable not found: $postgresExe"
  }

  if (-not (Test-Path $postgresDataDir)) {
    throw "Local PostgreSQL data directory not found: $postgresDataDir"
  }

  Write-Step "Starting local PostgreSQL on ${postgresHost}:$postgresPort"

  $launchScript = @"
Start-Process -FilePath '$postgresExe' -ArgumentList '-D ""$postgresDataDir"" -h $postgresHost -p $postgresPort' -WindowStyle Hidden -RedirectStandardOutput '$postgresOutLog' -RedirectStandardError '$postgresErrLog'
"@

  Invoke-UnelevatedPowerShell -Script $launchScript

  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline) {
    if (Test-TcpPort -HostName $postgresHost -Port $postgresPort) {
      return
    }

    Start-Sleep -Milliseconds 500
  }

  throw "PostgreSQL did not start on ${postgresHost}:$postgresPort. See $postgresErrLog"
}

function Start-Backend {
  if (Test-BackendReady) {
    Write-Step "Backend already ready at http://$backendHost`:$backendPort"
    return
  }

  Stop-BackendProcesses

  if (Test-TcpPort -HostName $backendHost -Port $backendPort) {
    throw "Port $backendPort is already in use, but OPC backend is not healthy."
  }

  Write-Step "Starting backend with DATABASE_URL=$databaseUrl"

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
}

function Invoke-WeChatDevToolsCli {
  param(
    [string]$CliPath,
    [string]$ProjectPath,
    [int]$TimeoutSeconds = 90
  )

  $cliStdout = [System.IO.Path]::GetTempFileName()
  $cliStderr = [System.IO.Path]::GetTempFileName()
  $cliArgs = "/c `"`"$CliPath`" open --project `"$ProjectPath`" --lang zh`""

  try {
    $cliProcess = Start-Process `
      -FilePath "cmd.exe" `
      -ArgumentList $cliArgs `
      -WindowStyle Hidden `
      -RedirectStandardOutput $cliStdout `
      -RedirectStandardError $cliStderr `
      -PassThru

    $timedOut = -not $cliProcess.WaitForExit($TimeoutSeconds * 1000)
    if ($timedOut) {
      Stop-ProcessTree -ProcessId $cliProcess.Id
      Start-Sleep -Milliseconds 200
    }

    $cliProcess.Refresh()
    $exitCode = $null
    if ($cliProcess.HasExited) {
      $exitCode = $cliProcess.ExitCode
    }

    $cliOutput = @(
      if (Test-Path $cliStdout) { Get-Content $cliStdout -ErrorAction SilentlyContinue }
      if (Test-Path $cliStderr) { Get-Content $cliStderr -ErrorAction SilentlyContinue }
    ) -join [Environment]::NewLine

    return [pscustomobject]@{
      TimedOut = $timedOut
      ExitCode = $exitCode
      Output   = $cliOutput
    }
  } finally {
    Remove-Item $cliStdout, $cliStderr -Force -ErrorAction SilentlyContinue
  }
}

function Open-DevTools {
  if ($SkipDevTools) {
    Write-Step "Skipping WeChat DevTools launch"
    return
  }

  $runningDevtoolsDirs = @(Get-Process wechatdevtools -ErrorAction SilentlyContinue |
    ForEach-Object {
      if ($_.Path) {
        Split-Path -Parent $_.Path
      }
    } |
    Where-Object { $_ } |
    Select-Object -Unique)

  # Prefer a directly-installed D:\* DevTools directory when present, even if
  # another copy is already running. This avoids binding to a stale install.
  $preferredDDriveInstall = $null
  $dLevel1Dirs = @(Get-ChildItem -Path "D:\" -Directory -ErrorAction SilentlyContinue)
  foreach ($level1 in $dLevel1Dirs) {
    if ((Test-Path (Join-Path $level1.FullName "wechatdevtools.exe")) -and
        (Test-Path (Join-Path $level1.FullName "cli.bat"))) {
      $preferredDDriveInstall = $level1.FullName
      break
    }

    $dLevel2Dirs = @(Get-ChildItem -Path $level1.FullName -Directory -ErrorAction SilentlyContinue)
    foreach ($level2 in $dLevel2Dirs) {
      if ((Test-Path (Join-Path $level2.FullName "wechatdevtools.exe")) -and
          (Test-Path (Join-Path $level2.FullName "cli.bat"))) {
        $preferredDDriveInstall = $level2.FullName
        break
      }
    }

    if ($preferredDDriveInstall) {
      break
    }
  }

  $preferredDirs = @(
    @($preferredDDriveInstall) +
    $runningDevtoolsDirs +
    @(
      "D:\WeChatDevTools"
    )
  ) | Where-Object { $_ } | Select-Object -Unique

  $searchRoots = @(
    "D:\WeChatDevTools",
    "D:\Software",
    "D:\",
    "C:\Program Files (x86)\Tencent",
    "C:\Program Files\Tencent",
    (Join-Path $env:LOCALAPPDATA "Programs")
  )
  $searchRoots = @($runningDevtoolsDirs + $searchRoots | Select-Object -Unique)

  $devtoolsDir = Find-WeChatDevToolsDir -CandidateDirs $preferredDirs -SearchRoots $searchRoots
  $devtoolsExe = if ($devtoolsDir) { Join-Path $devtoolsDir "wechatdevtools.exe" } else { Find-FirstFile -Roots $searchRoots -Filter "wechatdevtools.exe" }
  $devtoolsCli = if ($devtoolsDir) { Join-Path $devtoolsDir "cli.bat" } else { Find-FirstFile -Roots $searchRoots -Filter "cli.bat" }

  if ($devtoolsExe) {
    $devtoolsDir = Split-Path -Parent $devtoolsExe
  }

  $cliKnownBroken = -not ($devtoolsCli -and (Test-Path $devtoolsCli))
  if ((-not $cliKnownBroken) -and $devtoolsExe -and (-not (Test-Path $devtoolsExe))) {
    $cliKnownBroken = $true
  }

  if ((-not $cliKnownBroken) -and (Test-Path $devtoolsCli)) {
    Write-Step "Trying to open project in WeChat DevTools"

    $cliResult = Invoke-WeChatDevToolsCli -CliPath $devtoolsCli -ProjectPath $repoRoot
    $cliOutput = $cliResult.Output
    $cliFailed = $cliResult.TimedOut -or
      (($cliResult.ExitCode -ne $null) -and ($cliResult.ExitCode -ne 0)) -or
      ($cliOutput -match "initialize-error|Runtime error|ENOENT|wait IDE port timeout")

    if (-not $cliFailed) {
      return
    }

    if ($cliResult.TimedOut) {
      Write-Warning "WeChat DevTools CLI timed out and was terminated. Falling back to launching the IDE directly."
    } else {
      Write-Warning "WeChat DevTools CLI could not auto-open the project on this machine."
    }

    if ($cliOutput) {
      Write-Host $cliOutput
    }
  }

  if ($cliKnownBroken) {
    Write-Warning "WeChat DevTools CLI is incompatible with this local install and was skipped."
  }

  if (Test-Path $devtoolsExe) {
    $isRunning = @(Get-Process wechatdevtools -ErrorAction SilentlyContinue).Count -gt 0
    if (-not $isRunning) {
      Write-Step "Launching WeChat DevTools"
      Start-Process -FilePath $devtoolsExe | Out-Null
    }

    Write-Warning "Open this project manually in WeChat DevTools if it is not already selected:"
    Write-Host $repoRoot
    return
  }

  Write-Warning "WeChat DevTools was not found. Open this project manually when available:"
  Write-Host $repoRoot
}

Write-Step "Repo root: $repoRoot"
Start-LocalPostgres
Start-Backend
Open-DevTools

$lanIp = Get-PreferredLanIPv4
$lanBaseUrl = if ($lanIp) { "http://$lanIp`:$backendPort" } else { $null }

Write-Host ""
Write-Host "Ready:"
Write-Host "- PostgreSQL: ${postgresHost}:$postgresPort"
Write-Host "- Backend: http://$backendHost`:$backendPort"
Write-Host "- Health: http://$backendHost`:$backendPort/health"
Write-Host "- Ready: http://$backendHost`:$backendPort/ready"
if ($lanBaseUrl) {
  Write-Host "- LAN baseURL: $lanBaseUrl"
  Write-Host "- LAN health: $lanBaseUrl/health"
}
Write-Host "- Mini program path: $repoRoot"
