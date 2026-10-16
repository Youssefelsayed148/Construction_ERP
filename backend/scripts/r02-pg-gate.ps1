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
  [switch]$R4MultiInstance,
  [switch]$R4Resilience,
  [switch]$R4MigrationUpgrade,
  [switch]$NoForceExit,
  [string]$Filter = '^(FAIL|PASS) |Test Suites:|Tests:|^\s+R2 (mutation registry|fixture error|no audit row|rollback leak)|^\s+● .*›'
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$Suite = @($Suite | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
if (-not $All -and -not $Reconcile -and -not $R4Baseline -and -not $R4PasswordAfter -and -not $R4MultiInstance -and -not $R4Resilience -and -not $R4MigrationUpgrade -and $Suite.Count -eq 0) { throw 'Pass -Suite <path>, -All, -Reconcile, -R4Baseline, -R4PasswordAfter, -R4MultiInstance, -R4Resilience or -R4MigrationUpgrade.' }
$backend = Resolve-Path (Join-Path $PSScriptRoot '..')
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$name = if ($R4Baseline) { "erp-r04-baseline-$stamp" } elseif ($R4PasswordAfter) { "erp-r04-password-after-$stamp" } elseif ($R4MultiInstance) { "erp-r04-multi-$stamp" } elseif ($R4Resilience) { "erp-r04-resilience-$stamp" } elseif ($R4MigrationUpgrade) { "erp-r04-migration-upgrade-$stamp" } elseif ($R4) { "erp-r04-gate-$stamp" } else { "erp-r02-gate-$stamp" }
$rand = { -join ((48..57 + 97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ }) }
$pw = & $rand
$port = Get-Random -Minimum 55000 -Maximum 58000
$env:DB_HOST = '127.0.0.1'; $env:DB_PORT = "$port"; $env:DB_NAME = if ($R4Baseline) { 'erp_r04_baseline' } elseif ($R4PasswordAfter) { 'erp_r04_password_after' } elseif ($R4MultiInstance) { 'erp_r04_multi' } elseif ($R4Resilience) { 'erp_r04_resilience' } elseif ($R4MigrationUpgrade) { 'erp_r04_migration_upgrade' } elseif ($R4) { 'erp_r04_test' } else { 'erp_r02_test' }
$env:DB_USER = if ($R4Baseline -or $R4PasswordAfter -or $R4MultiInstance -or $R4Resilience -or $R4MigrationUpgrade -or $R4) { 'erp_r04' } else { 'erp_r02' }; $env:DB_PASSWORD = $pw
$env:JWT_SECRET = & $rand; $env:WEBHOOK_ENCRYPTION_KEY = & $rand; $env:TEST_PG = '1'; $env:NODE_ENV = 'test'; $env:APP_ENV = 'test'
# Keep the shared disposable-database auth counters from rate-limiting unrelated
# suites in the full Jest run. Rate-limit behavior has dedicated tests.
$env:AUTH_RATE_LIMIT_PER_15_MIN = '1000'; $env:V1_RATE_LIMIT_PER_MIN = '100000'
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
  if ($R4MigrationUpgrade) {
    $out = node src/scripts/r4-migration-upgrade.js 2>&1 | ForEach-Object { "$_" } | Out-String
    $exit = $LASTEXITCODE
    ($out -split "`r?`n") | Where-Object { $_ -match 'migration upgrade (PASS|FAIL)|Error:' } | ForEach-Object { Write-Output $_ }
    Pop-Location
    return
  }
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
  if ($R4MultiInstance) {
    $env:UV_THREADPOOL_SIZE = '16'
    $out = node src/scripts/r4-capacity-baseline.js --multi-instance-proof 2>&1 | ForEach-Object { "$($_)" -replace 'password=[^ ]+', 'password=[redacted]' } | Out-String
    $exit = $LASTEXITCODE
    ($out -split "`r?`n") | Where-Object { $_ -match 'migrations:|two_process_rate_limit|two_process_sweep|two_server_retention|failed|Error|removed' } | ForEach-Object { Write-Output $_ }
    Pop-Location
    return
  }
  if ($R4Resilience) {
    $env:UV_THREADPOOL_SIZE = '16'
    $out = node src/scripts/r4-capacity-baseline.js --resilience-proof 2>&1 | ForEach-Object { "$($_)" -replace 'password=[^ ]+', 'password=[redacted]' } | Out-String
    $exit = $LASTEXITCODE
    ($out -split "`r?`n") | Where-Object { $_ -match 'migrations:|sigterm_drain|login_load|failed|Error|removed' } | ForEach-Object { Write-Output $_ }
    Pop-Location
    return
  }
  if ($Reconcile) {
    # Fresh seeded throwaway database -> golden reconciliation (read-only checks). Prints summary lines only.
    $env:APP_ENV = 'test'
    $guard = node src/scripts/seed-golden-demo.js 2>&1 | ForEach-Object { "$_" } | Out-String
    if ($LASTEXITCODE -eq 0 -or $guard -notmatch 'APP_ENV must be exactly staging') {
      throw 'Golden seed refused-target guard proof failed.'
    }
    Write-Output 'golden guard: non-staging APP_ENV refused'
    $env:APP_ENV = 'staging'
    $env:RECONCILIATION_BACKUP_CONFIRMED = 'true'
    $seed = npm.cmd run seed:golden-demo 2>&1 | ForEach-Object { "$_" } | Out-String
    if ($LASTEXITCODE -ne 0) { Write-Output 'golden seed: FAIL'; throw 'golden seed failed' }
    ($seed -split "`r?`n") | Where-Object { $_ -match 'Seeded .* units, 1 BOQ, .* m3 recipe demand' } | ForEach-Object { Write-Output $_ }
    Write-Output ('seed exit=' + $LASTEXITCODE)
    $rec = node src/scripts/reconcile-database.js 2>&1 | ForEach-Object { "$_" } | Out-String
    $exit = $LASTEXITCODE
    ($rec -split "`r?`n") | Where-Object { $_ -match 'check|ok|violation|discrepan|FAIL|PASS|total' } | Select-Object -First 40 | ForEach-Object { Write-Output $_ }
    Pop-Location
    return
  }
  $args2 = @('--config', 'jest.pg.config.js', '--runInBand', '--no-colors')
  if (-not $NoForceExit) { $args2 += '--forceExit' }
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
