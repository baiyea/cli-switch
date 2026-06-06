$ErrorActionPreference = "Continue"

$installRoots = @()
$installRoots += Join-Path $env:LOCALAPPDATA "Programs\Cli-Switch"
$installRoots += Join-Path $env:ProgramFiles "Cli-Switch"

if (${env:ProgramFiles(x86)}) {
  $installRoots += Join-Path ${env:ProgramFiles(x86)} "Cli-Switch"
}

function Is-CliSwitchProcess($proc) {
  $name = [string]$proc.Name
  $cmd = [string]$proc.CommandLine
  $exe = [string]$proc.ExecutablePath

  if ($name -eq "Cli-Switch.exe") {
    return $true
  }

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

$targets = Get-CimInstance Win32_Process | Where-Object { Is-CliSwitchProcess $_ }

foreach ($proc in $targets) {
  try {
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
    Write-Host "[close-cli-switch] stopped PID=$($proc.ProcessId) $($proc.Name)"
  } catch {
    Write-Host "[close-cli-switch] skip PID=$($proc.ProcessId): $($_.Exception.Message)"
  }
}

Start-Sleep -Milliseconds 1200

$remaining = Get-CimInstance Win32_Process | Where-Object { Is-CliSwitchProcess $_ }
foreach ($proc in $remaining) {
  try {
    taskkill.exe /PID $proc.ProcessId /T /F | Out-Host
  } catch {
    Write-Host "[close-cli-switch] taskkill failed PID=$($proc.ProcessId): $($_.Exception.Message)"
  }
}

exit 0
