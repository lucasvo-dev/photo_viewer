@echo off
echo Setting up Windows Task Scheduler for workers...

:: Create Cache Worker Task
schtasks /create /tn "Cache Worker" ^
    /tr "D:\xampp\php\php.exe -f D:\xampp\htdocs\worker_cache.php" ^
    /sc minute /mo 1 ^
    /ru "SYSTEM" ^
    /f

:: Create ZIP Worker Task
schtasks /create /tn "ZIP Worker" ^
    /tr "D:\xampp\php\php.exe -f D:\xampp\htdocs\worker_zip.php" ^
    /sc minute /mo 1 ^
    /ru "SYSTEM" ^
    /f

:: Verify tasks were created
echo Verifying tasks...
schtasks /query /tn "Cache Worker"
schtasks /query /tn "ZIP Worker"

echo Workers schedule setup completed. Press any key to exit...
pause >nul
