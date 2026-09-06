Set-Location "D:\The Osiris Labs\Construction_ERP\backend"
$env:DB_PASSWORD = ""
npm run dev 2>&1 | Out-File -FilePath "D:\The Osiris Labs\Construction_ERP\backend\win_backend.log" -Append
