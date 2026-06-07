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
  $processId = $proc.ProcessId
  if ($excludePids.ContainsKey($processId)) {
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
  if ($proc.Name -ne "Cli-Switch.exe" -and $proc.Name -ne "Cli-Switch") {
    continue
  }
  try {
    $process = Get-Process -Id $proc.ProcessId -ErrorAction Stop
    if ($process.MainWindowHandle -and $process.MainWindowHandle -ne 0) {
      $null = $process.CloseMainWindow()
      Write-Host "[close-cli-switch] requested window close PID=$($proc.ProcessId) $($proc.Name)"
    }
  } catch {
    Write-Host "[close-cli-switch] window close skipped PID=$($proc.ProcessId): $($_.Exception.Message)"
  }
}

Start-Sleep -Milliseconds 2500

$allProcs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
if (-not $allProcs) {
  $allProcs = Get-Process -ErrorAction SilentlyContinue
}
$targets = $allProcs | Where-Object { Is-CliSwitchProcess $_ }

foreach ($proc in $targets) {
  try {
    taskkill.exe /PID $proc.ProcessId /T /F | Out-Host
    Write-Host "[close-cli-switch] taskkill tree PID=$($proc.ProcessId) $($proc.Name)"
  } catch {
    Write-Host "[close-cli-switch] skip PID=$($proc.ProcessId): $($_.Exception.Message)"
  }
}

Start-Sleep -Milliseconds 800

# Refresh process list for remaining check; still exclude our own tree.
$deadline = (Get-Date).AddSeconds(8)
do {
  $remainingProcs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
  if (-not $remainingProcs) {
    $remainingProcs = Get-Process -ErrorAction SilentlyContinue
  }
  $remaining = @($remainingProcs | Where-Object { Is-CliSwitchProcess $_ })
  if ($remaining.Count -eq 0) {
    Write-Host "[close-cli-switch] all Cli-Switch processes closed"
    exit 0
  }
  Write-Host "[close-cli-switch] waiting for remaining PIDs: $(($remaining | ForEach-Object { $_.ProcessId }) -join ', ')"
  Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt $deadline)

Write-Host "[close-cli-switch] remaining processes after timeout: $(($remaining | ForEach-Object { "$($_.ProcessId):$($_.Name)" }) -join ', ')"

exit 0
