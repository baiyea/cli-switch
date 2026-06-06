$ErrorActionPreference = "Continue"

# Build the set of PIDs to exclude: this script's own process tree (PowerShell + installer parent).
$excludePids = @{}
$currentPid = $PID
$excludePids[$currentPid] = $true

# Walk up the parent chain (PowerShell → installer → ...) up to 4 levels.
try {
  $parentPid = $currentPid
  for ($i = 0; $i -lt 4; $i++) {
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $parentPid" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $parent -or $parent.ProcessId -eq 0) { break }
    $parentPid = $parent.ParentProcessId
    if ($parentPid -and $parentPid -ne 0) {
      $excludePids[$parentPid] = $true
    } else {
      break
    }
  }
} catch {
  Write-Host "[close-cli-switch] unable to walk parent chain: $_"
}

Write-Host "[close-cli-switch] excluding PIDs: $($excludePids.Keys -join ', ')"

$installRoots = @()
$installRoots += Join-Path $env:LOCALAPPDATA "Programs\Cli-Switch"
$installRoots += Join-Path $env:ProgramFiles "Cli-Switch"

if (${env:ProgramFiles(x86)}) {
  $installRoots += Join-Path ${env:ProgramFiles(x86)} "Cli-Switch"
}

function Is-CliSwitchProcess($proc) {
  $pid = $proc.ProcessId
  if ($excludePids.ContainsKey($pid)) {
    return $false
  }

  $name = [string]$proc.Name

  # Match by process name: "Cli-Switch" or "Cli-Switch.exe".
  if ($name -eq "Cli-Switch.exe" -or $name -eq "Cli-Switch") {
    return $true
  }

  # Full-path / command-line checks only work with CimInstance objects.
  $cmd = if ($proc.CommandLine) { [string]$proc.CommandLine } else { "" }
  $exe = if ($proc.ExecutablePath) { [string]$proc.ExecutablePath } else { "" }

  foreach ($root in $installRoots) {
    if ($root -and ($cmd.Contains($root) -or $exe.Contains($root))) {
      return $true
    }
  }

  if ($cmd -match "Cli-Switch[\\/]resources[\\/]cli-runtime") {
    return $true
  }

  return $false
}

# Prefer Get-CimInstance for rich process info; fall back to Get-Process.
$allProcs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
if (-not $allProcs) {
  Write-Host "[close-cli-switch] Get-CimInstance failed, falling back to Get-Process"
  $allProcs = Get-Process -ErrorAction SilentlyContinue
}

$targets = $allProcs | Where-Object { Is-CliSwitchProcess $_ }

foreach ($proc in $targets) {
  try {
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
    Write-Host "[close-cli-switch] stopped PID=$($proc.ProcessId) $($proc.Name)"
  } catch {
    Write-Host "[close-cli-switch] skip PID=$($proc.ProcessId): $($_.Exception.Message)"
  }
}

Start-Sleep -Milliseconds 1200

# Refresh process list for remaining check; still exclude our own tree.
$remainingProcs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
if (-not $remainingProcs) {
  $remainingProcs = Get-Process -ErrorAction SilentlyContinue
}
$remaining = $remainingProcs | Where-Object { Is-CliSwitchProcess $_ }
foreach ($proc in $remaining) {
  try {
    taskkill.exe /PID $proc.ProcessId /T /F | Out-Host
  } catch {
    Write-Host "[close-cli-switch] taskkill failed PID=$($proc.ProcessId): $($_.Exception.Message)"
  }
}

exit 0
