@echo off
echo Checking worker status and logs...

:: Check if workers are still running
echo Checking running workers...
tasklist | findstr "php.exe"

:: Check latest log entries
echo Checking latest log entries...
if exist "D:\xampp\htdocs\logs\worker_zip_error.log" (
    type "D:\xampp\htdocs\logs\worker_zip_error.log" | tail -n 20
) else (
    echo Log file not found
)

echo Press any key to exit...
pause >nul
