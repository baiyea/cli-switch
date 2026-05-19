const { execFileSync, execSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function cleanupUnix() {
  const currentPid = process.pid;
  const shouldKill = (cmd) => {
    if (!cmd) return false;
    const inRepo = cmd.includes(repoRoot);
    const hasDevMarker =
      cmd.includes('VITE_DEV_SERVER_URL=http://localhost:5073') ||
      cmd.includes('wait-on tcp:5073') ||
      cmd.includes('scripts/run-electron.js') ||
      cmd.includes('pnpm dev:renderer') ||
      cmd.includes('pnpm dev:electron') ||
      cmd.includes('vite');
    return inRepo && hasDevMarker;
  };

  try {
    const psOutput = execSync('ps -ax -o pid= -o command=', { encoding: 'utf8' });
    for (const line of psOutput.split('\n')) {
      const match = line.match(/^\s*(\d+)\s+(.*)$/);
      if (!match) continue;
      const pid = Number(match[1]);
      const cmd = match[2] || '';
      if (!Number.isInteger(pid) || pid <= 0 || pid === currentPid) continue;
      if (!shouldKill(cmd)) continue;
      try {
        terminatePid(pid);
        console.log(`[cleanup-dev] stopped PID=${pid}`);
      } catch {}
    }
  } catch {}

  try {
    const pids = execSync('lsof -ti tcp:5073', { encoding: 'utf8' })
      .split('\n')
      .map((item) => Number(item.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== currentPid);
    for (const pid of new Set(pids)) {
      try {
        terminatePid(pid);
        console.log(`[cleanup-dev] stopped port 5073 owner PID=${pid}`);
      } catch {}
    }
  } catch {}
}

if (process.platform !== 'win32') {
  cleanupUnix();
  process.exit(0);
}

const script = `
$ErrorActionPreference = 'Continue'
$repo = ${JSON.stringify(repoRoot)}
$currentPid = $PID
$nodePid = ${process.pid}
$procs = Get-CimInstance Win32_Process | Where-Object {
  $cmd = [string]$_.CommandLine
  if ($_.ProcessId -eq $currentPid) { return $false }
  if ($_.ProcessId -eq $nodePid) { return $false }
  if (@('node.exe', 'cmd.exe') -contains $_.Name -and $cmd -match 'VITE_DEV_SERVER_URL=http://localhost:5073') { return $true }
  if ($_.Name -eq 'electron.exe' -and $cmd -match '\\.cli-switch-dev') { return $true }
  if ($_.Name -eq 'electron.exe' -and $cmd -match 'node_modules.*electron.*dist.*electron\\.exe"?\\s+\\.') { return $true }
  if ($cmd -notmatch [regex]::Escape($repo)) { return $false }
  if (@('node.exe', 'cmd.exe', 'electron.exe', 'esbuild.exe') -notcontains $_.Name) { return $false }
  if ($cmd -match 'vite\\.js') { return $true }
  if ($cmd -match 'scripts[\\\\/]run-electron\\.js') { return $true }
  if ($cmd -match 'pnpm(\\.cjs)?\\s+dev(:renderer|:electron)?') { return $true }
  if ($cmd -match 'concurrently.*pnpm dev:renderer') { return $true }
  if ($_.Name -eq 'electron.exe' -and $cmd -match 'electron\\.exe"?\\s+\\.') { return $true }
  if ($_.Name -eq 'esbuild.exe') { return $true }
  if ($_.Name -eq 'cmd.exe' -and $cmd -match 'wait-on tcp:5073') { return $true }
  return $false
}
foreach ($proc in $procs) {
  try {
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
    Write-Host "[cleanup-dev] stopped PID=$($proc.ProcessId) $($proc.Name)"
  } catch {
    Write-Host "[cleanup-dev] skip PID=$($proc.ProcessId): $($_.Exception.Message)"
  }
}
$portOwners = Get-NetTCPConnection -LocalPort 5073 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique
foreach ($pidToStop in $portOwners) {
  if ($pidToStop -and $pidToStop -ne $currentPid) {
    try {
      Stop-Process -Id $pidToStop -Force -ErrorAction Stop
      Write-Host "[cleanup-dev] stopped port 5073 owner PID=$pidToStop"
    } catch {
      Write-Host "[cleanup-dev] skip port owner PID=$($pidToStop): $($_.Exception.Message)"
    }
  }
}
exit 0
`;

try {
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    stdio: 'inherit',
  });
} catch (error) {
  console.warn(`[cleanup-dev] failed: ${error.message}`);
}
function terminatePid(pid) {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return false;
  }
  try {
    process.kill(pid, 0);
    process.kill(pid, 'SIGKILL');
  } catch {}
  return true;
}
