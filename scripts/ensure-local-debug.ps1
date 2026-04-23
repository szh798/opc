[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeConfigPath = Join-Path $repoRoot "utils\runtime-config.local.js"
$firewallRuleName = "OPC Local Debug 3000"
$backendPort = 3000

function Write-Step {
  param([string]$Message)
  Write-Host "==> $Message"
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

function Test-IsAdmin {
  $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Ensure-FirewallRule {
  if (-not (Test-IsAdmin)) {
    Write-Warning "Current PowerShell is not elevated. Skipping firewall rule creation."
    return
  }

  $existingRules = @(Get-NetFirewallRule -DisplayName $firewallRuleName -ErrorAction SilentlyContinue)
  if (-not $existingRules.Count) {
    New-NetFirewallRule `
      -DisplayName $firewallRuleName `
      -Direction Inbound `
      -Action Allow `
      -Enabled True `
      -Profile Private `
      -Protocol TCP `
      -LocalPort $backendPort | Out-Null
    Write-Step "Created Windows firewall rule '$firewallRuleName'"
    return
  }

  $existingRules | Set-NetFirewallRule -Enabled True -Profile Private -Direction Inbound -Action Allow | Out-Null
  Write-Step "Firewall rule '$firewallRuleName' already exists"
}

function Read-DevBaseUrl {
  if (-not (Test-Path $runtimeConfigPath)) {
    return $null
  }

  $content = Get-Content -Path $runtimeConfigPath -Raw
  $match = [regex]::Match(
    $content,
    'dev\s*:\s*\{[^}]*baseURL\s*:\s*"(?<url>[^"]+)"',
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )

  if ($match.Success) {
    return $match.Groups["url"].Value
  }

  return $null
}

function Test-HealthEndpoint {
  param([string]$Url)

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
    return [pscustomobject]@{
      Url = $Url
      Ok = $true
      Status = $response.StatusCode
      Detail = $response.Content
    }
  } catch {
    return [pscustomobject]@{
      Url = $Url
      Ok = $false
      Status = 0
      Detail = $_.Exception.Message
    }
  }
}

$lanIp = Get-PreferredLanIPv4
$expectedBaseUrl = if ($lanIp) { "http://$lanIp`:$backendPort" } else { $null }
$configuredDevBaseUrl = Read-DevBaseUrl

Write-Step "Repo root: $repoRoot"
Write-Host "- runtime config: $runtimeConfigPath"
Write-Host "- configured dev.baseURL: $configuredDevBaseUrl"
Write-Host "- detected LAN IP: $lanIp"
if ($expectedBaseUrl) {
  Write-Host "- expected dev.baseURL: $expectedBaseUrl"
}

if ($expectedBaseUrl -and $configuredDevBaseUrl -ne $expectedBaseUrl) {
  Write-Warning "dev.baseURL does not match the current LAN IP."
}

Ensure-FirewallRule

$healthChecks = @(
  Test-HealthEndpoint -Url "http://127.0.0.1:$backendPort/health"
)

if ($expectedBaseUrl) {
  $healthChecks += Test-HealthEndpoint -Url "$expectedBaseUrl/health"
}

Write-Host ""
Write-Host "Health checks:"
foreach ($result in $healthChecks) {
  $status = if ($result.Ok) { "OK" } else { "FAIL" }
  Write-Host "- [$status] $($result.Url)"
  Write-Host "  $($result.Detail)"
}

Write-Host ""
Write-Host "Next:"
Write-Host "- Keep phone and PC on the same Wi-Fi."
Write-Host "- In WeChat DevTools, use real-device debug and keep 'Do not verify request domain' enabled."
if ($expectedBaseUrl) {
  Write-Host "- On phone browser, open $expectedBaseUrl/health before testing the mini program."
}
