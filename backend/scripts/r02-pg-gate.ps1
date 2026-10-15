# R2 real-PG gate: throwaway Postgres 16 container -> migrate -> jest file(s) -> summary lines -> remove container.
# Usage: powershell -File backend/scripts/r02-pg-gate.ps1 -Suite src/scripts/__tests__/mutation-audit.pg.test.js [-Suite ...]
#        add -All to run the whole real-PG suite instead of named files.
# Credentials are generated in this process only; the container binds to loopback; nothing is written to disk.
param(
  [string[]]$Suite = @(),
  [switch]$All,
  [switch]$Reconcile,
  [switch]$R4Baseline,
  [switch]$R4,
  [switch]$R4PasswordAfter,
  [string]$Filter = '^(FAIL|PASS) |Test Suites:|Tests:|^\s+R2 (mutation registry|fixture error|no audit row|rollback leak)|^\s+● .*›'
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$Suite = @($Suite | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
if (-not $All -and -not $Reconcile -and -not $R4Baseline -and -not $R4PasswordAfter -and $Suite.Count -eq 0) { throw 'Pass -Suite <path>, -All, -Reconcile, -R4Baseline or -R4PasswordAfter.' }
$backend = Resolve-Path (Join-Path $PSScriptRoot '..')
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$name = if ($R4Baseline) { "erp-r04-baseline-$stamp" } elseif ($R4PasswordAfter) { "erp-r04-password-after-$stamp" } elseif ($R4) { "erp-r04-gate-$stamp" } else { "erp-r02-gate-$stamp" }
$rand = { -join ((48..57 + 97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ }) }
$pw = & $rand
$port = Get-Random -Minimum 55000 -Maximum 58000
$env:DB_HOST = '127.0.0.1'; $env:DB_PORT = "$port"; $env:DB_NAME = if ($R4Baseline) { 'erp_r04_baseline' } elseif ($R4PasswordAfter) { 'erp_r04_password_after' } elseif ($R4) { 'erp_r04_test' } else { 'erp_r02_test' }
$env:DB_USER = if ($R4Baseline -or $R4PasswordAfter -or $R4) { 'erp_r04' } else { 'erp_r02' }; $env:DB_PASSWORD = $pw
$env:JWT_SECRET = & $rand; $env:TEST_PG = '1'; $env:NODE_ENV = 'test'; $env:APP_ENV = 'test'
$exit = 1
try {
  docker run -d --rm --pull=never --name $name -p "127.0.0.1:${port}:5432" `
    -e "POSTGRES_PASSWORD=$pw" -e "POSTGRES_USER=$($env:DB_USER)" -e "POSTGRES_DB=$($env:DB_NAME)" postgres:16 | Out-Null
  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    docker exec $name pg_isready -U $env:DB_USER -d $env:DB_NAME 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { Start-Sleep -Seconds 2; $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'Postgres container did not become ready.' }
  Push-Location $backend
  $ErrorActionPreference = 'Continue'
  $mig = npm.cmd run migrate 2>&1 | ForEach-Object { "$_" } | Out-String
  if ($LASTEXITCODE -ne 0) { Write-Output $mig.Substring([Math]::Max(0, $mig.Length - 1500)); throw 'migrate failed' }
  Write-Output ('migrations: ' + (($mig -split "`n" | Select-String -Pattern 'applied|Applied' | Select-Object -Last 1) -join ''))
  if ($R4Baseline) {
    $out = node src/scripts/r4-capacity-baseline.js 2>&1 | ForEach-Object { "$_" } | Out-String
    $exit = $LASTEXITCODE
    Write-Output $out
    Pop-Location
    return
  }
  if ($R4PasswordAfter) {
    $env:UV_THREADPOOL_SIZE = '16'
    $out = node src/scripts/r4-capacity-baseline.js --password-after 2>&1 | ForEach-Object { "$_" } | Out-String
    $exit = $LASTEXITCODE
    Write-Output $out
    Pop-Location
    return
  }
  if ($Reconcile) {
    # Fresh seeded throwaway database -> golden reconciliation (read-only checks). Prints summary lines only.
    $env:RECONCILIATION_BACKUP_CONFIRMED = 'true'
    $seed = npm.cmd run seed:golden-demo 2>&1 | ForEach-Object { "$_" } | Out-String
    Write-Output ('seed exit=' + $LASTEXITCODE)
    $rec = node src/scripts/reconcile-database.js 2>&1 | ForEach-Object { "$_" } | Out-String
    $exit = $LASTEXITCODE
    ($rec -split "`r?`n") | Where-Object { $_ -match 'check|ok|violation|discrepan|FAIL|PASS|total' } | Select-Object -First 40 | ForEach-Object { Write-Output $_ }
    Pop-Location
    return
  }
  $args2 = @('--config', 'jest.pg.config.js', '--runInBand', '--forceExit', '--no-colors')
  if (-not $All) { $args2 += $Suite }
  if ($R4) { $env:UV_THREADPOOL_SIZE = '16' }
  $ErrorActionPreference = 'Continue'
  $out = & npx.cmd jest @args2 2>&1 | ForEach-Object { "$_" } | Out-String
  $exit = $LASTEXITCODE
  ($out -split "`r?`n") | Where-Object { $_ -match $Filter } | ForEach-Object { Write-Output $_ }
  Pop-Location
} finally {
  docker rm -f $name 2>$null | Out-Null
  Write-Output "container $name removed; exit=$exit"
}
exit $exit
