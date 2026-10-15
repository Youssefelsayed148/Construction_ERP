# R3.0 evidence runner: local disposable Postgres 16, current migrations,
# benchmark seed + plans, then automatic cleanup. Does not run the PG tests.
$ErrorActionPreference = 'Stop'
$backend = Resolve-Path (Join-Path $PSScriptRoot '..')
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$name = "erp-r3-perf-$stamp"
$rand = { -join ((48..57 + 97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ }) }
$pw = & $rand
$port = Get-Random -Minimum 55000 -Maximum 58000
$env:DB_HOST = '127.0.0.1'; $env:DB_PORT = "$port"; $env:DB_NAME = 'erp_r3_perf_test'
$env:DB_USER = 'erp_r3'; $env:DB_PASSWORD = $pw
$env:APP_ENV = 'test'; $env:NODE_ENV = 'test'; $env:TEST_PG = '1'; $env:JWT_SECRET = & $rand
$exit = 1
$started = $false
try {
  $containerId = docker run -d --rm --pull=never --name $name -p "127.0.0.1:${port}:5432" `
    -e "POSTGRES_PASSWORD=$pw" -e "POSTGRES_USER=$($env:DB_USER)" -e "POSTGRES_DB=$($env:DB_NAME)" postgres:16 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not start local disposable Postgres.' }
  $started = $true
  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    docker exec $name pg_isready -U $env:DB_USER -d $env:DB_NAME 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { Start-Sleep -Seconds 2; $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'R3 disposable Postgres did not become ready.' }
  Push-Location $backend
  $mig = npm.cmd run migrate 2>&1 | ForEach-Object { "$_" } | Out-String
  if ($LASTEXITCODE -ne 0) { Write-Output ($mig.Substring([Math]::Max(0, $mig.Length - 1500))); throw 'R3 baseline migrations failed' }
  Write-Output (($mig -split "`n" | Select-String -Pattern 'all migrations completed' | Select-Object -Last 1) -join '')
  $out = node src/scripts/r3-performance-baseline.js 2>&1 | ForEach-Object { "$_" } | Out-String
  $exit = $LASTEXITCODE
  Write-Output $out
  if ($exit -eq 0) {
    $audit = node src/scripts/r3-fk-index-audit.js --write-plan 2>&1 | ForEach-Object { "$_" } | Out-String
    $exit = $LASTEXITCODE
    Write-Output $audit
  }
  Pop-Location
} finally {
  if ($started) { docker rm -f $name 2>$null | Out-Null }
  Write-Output "container $name removed; exit=$exit"
}
exit $exit
