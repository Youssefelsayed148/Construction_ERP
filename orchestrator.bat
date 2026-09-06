@echo off
cd /d "D:\The Osiris Labs\Construction_ERP"
set DB_PASSWORD=NewStrongPassword123!
echo Starting backend...
start /min "" cmd /c "cd /d D:\The Osiris Labs\Construction_ERP\backend && node server.js > D:\backend_full.log 2>&1"
echo Backend launched. Waiting 10 seconds...
timeout /t 10 /nobreak > nul
echo Running test suite...
node orchestrator.js > D:\test_results.log 2>&1
echo Done. Results in D:\test_results.log
