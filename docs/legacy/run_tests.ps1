$ErrorActionPreference = "Stop"
Set-Location "D:\The Osiris Labs\Construction_ERP\backend"
$env:DB_PASSWORD = "NewStrongPassword123!"

# Start the server in background
$job = Start-Job -ScriptBlock {
    Set-Location "D:\The Osiris Labs\Construction_ERP\backend"
    $env:DB_PASSWORD = "NewStrongPassword123!"
    node server.js 2>&1
}

# Wait for server to start
Start-Sleep -Seconds 8
Write-Host "Server should be running..."

# Test health endpoint
try {
    $response = Invoke-RestMethod -Uri "http://localhost:5000/api/health" -Method Get
    Write-Host "Health check: $($response | ConvertTo-Json)"
} catch {
    Write-Host "Health check FAILED: $_"
    Receive-Job -Job $job
    Stop-Job -Job $job
    exit 1
}

# Test login
try {
    $body = @{ email = "admin@osirislabs.com"; password = "admin123" } | ConvertTo-Json
    $login = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/login" -Method Post -Body $body -ContentType "application/json"
    Write-Host "Login: $($login | ConvertTo-Json)"
    $token = $login.data.token
    Write-Host "Token obtained: $token"
} catch {
    Write-Host "Login FAILED: $_"
    Receive-Job -Job $job
    Stop-Job -Job $job
    exit 1
}

# Stop the server
Stop-Job -Job $job
Write-Host "Tests completed"
