$env:DB_PASSWORD = "NewStrongPassword123!"
Set-Location "D:\The Osiris Labs\Construction_ERP\backend"
$proc = Start-Process -FilePath "node" -ArgumentList "server.js" -WindowStyle Minimized -PassThru
Write-Host "Backend PID: $($proc.Id)"
