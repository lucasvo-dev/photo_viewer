@echo off
:: Start Cache Worker
echo Starting Cache Worker...
start "Cache Worker" "D:\xampp\php\php.exe" -f "D:\xampp\htdocs\worker_cache.php"

:: Start ZIP Worker
echo Starting ZIP Worker...
start "ZIP Worker" "D:\xampp\php\php.exe" -f "D:\xampp\htdocs\worker_zip.php"

:: Wait a moment to ensure workers start
timeout /t 2

:: Check if workers are running
echo Checking if workers are running...
tasklist | findstr "php.exe"

echo Workers started. Press any key to exit...
pause >nul
