# Dung Showdown Offline: tat server game + bot + web theo .pids, quet them theo ten.
param([string]$Root = (Split-Path -Parent $MyInvocation.MyCommand.Path))

$killed = 0
function Kill-NodePid($id, $why) {
  try {
    $p = Get-Process -Id $id -ErrorAction Stop
    if ($p.ProcessName -ne 'node') { return }
    Stop-Process -Id $id -Force -ErrorAction Stop
    Write-Host ("Tat PID " + $id + " (" + $why + ")")
    $script:killed++
  } catch {}
}

$pidsDir = Join-Path $Root '.pids'
foreach ($n in @('web', 'server', 'bot')) {
  $f = Join-Path $pidsDir ($n + '.pid')
  if (Test-Path $f) {
    Kill-NodePid ([int](Get-Content $f)) $n
    Remove-Item $f -Force -ErrorAction SilentlyContinue
  }
}

$rootNorm = $Root.TrimEnd('\', '/')
foreach ($p in (Get-CimInstance Win32_Process -Filter "Name='node.exe'")) {
  $c = [string]$p.CommandLine
  if (-not $c) { continue }
  $mine = $false
  if ($c.Contains($rootNorm)) { $mine = $true }
  elseif ($c -match 'pokemon-showdown 8000') { $mine = $true }
  elseif ($c -match '(start|client-server)\.js') { $mine = $true }
  elseif ($c -match 'bot[\/\\]bot\.js') { $mine = $true }
  if ($mine) {
    try {
      Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
      Write-Host ("Tat PID " + $p.ProcessId + " (quet)")
      $killed++
    } catch {}
  }
}

Write-Host ("Da tat " + $killed + " tien trinh.")
