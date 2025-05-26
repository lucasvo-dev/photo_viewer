@echo off
echo Setting up Windows Task Scheduler for workers and cron jobs with Guu prefix...

:: --- Worker Tasks (run every minute) ---

:: Create Cache Worker Task
echo Creating/Updating Guu_Cache Worker task...
schtasks /create /tn "Guu Cache Worker" ^
    /tr "D:\xampp\php\php.exe -f D:\xampp\htdocs\worker_cache.php" ^
    /sc minute /mo 1 ^
    /ru "SYSTEM" ^
    /f

:: Create RAW Cache Worker Task (NEW)
echo Creating/Updating Guu_RAW Cache Worker task...
schtasks /create /tn "Guu RAW Cache Worker" ^
    /tr "D:\xampp\php\php.exe -f D:\xampp\htdocs\worker_jet_cache.php" ^
    /sc minute /mo 1 ^
    /ru "SYSTEM" ^
    /f

:: Create ZIP Worker Task
echo Creating/Updating Guu_ZIP Worker task...
schtasks /create /tn "Guu ZIP Worker" ^
    /tr "D:\xampp\php\php.exe -f D:\xampp\htdocs\worker_zip.php" ^
    /sc minute /mo 1 ^
    /ru "SYSTEM" ^
    /f

:: --- Cron Job Tasks ---

:: Create ZIP Cleanup Cron Task (runs every 5 minutes)
echo Creating/Updating Guu_ZIP Cleanup Cron task...
schtasks /create /tn "Guu ZIP Cleanup Cron" ^
    /tr "D:\xampp\php\php.exe -f D:\xampp\htdocs\cron_zip_cleanup.php" ^
    /sc minute /mo 5 ^
    /ru "SYSTEM" ^
    /f

:: Create Cache Cleanup Cron Task (runs daily at 3:00 AM)
echo Creating/Updating Guu_Cache Cleanup Cron task...
schtasks /create /tn "Guu Cache Cleanup Cron" ^
    /tr "D:\xampp\php\php.exe -f D:\xampp\htdocs\cron_cache_cleanup.php" ^
    /sc daily /st 03:00 ^
    /ru "SYSTEM" ^
    /f

:: Create Log Cleanup Cron Task (runs daily at 3:30 AM)
echo Creating/Updating Guu_Log Cleanup Cron task...
schtasks /create /tn "Guu Log Cleanup Cron" ^
    /tr "D:\xampp\php\php.exe -f D:\xampp\htdocs\cron_log_cleanup.php" ^
    /sc daily /st 03:30 ^
    /ru "SYSTEM" ^
    /f

:: --- Verify tasks were created ---
echo Verifying all Guu_ prefixed tasks...
schtasks /query /tn "Guu Cache Worker"
schtasks /query /tn "Guu RAW Cache Worker"
schtasks /query /tn "Guu ZIP Worker"
schtasks /query /tn "Guu ZIP Cleanup Cron"
schtasks /query /tn "Guu Cache Cleanup Cron"
schtasks /query /tn "Guu Log Cleanup Cron"

echo.
echo === Manual Start Commands (for testing) ===
echo To start workers manually for testing:
echo   php worker_cache.php
echo   php worker_jet_cache.php
echo   php worker_zip.php
echo.
echo To test RAW processing setup:
echo   php test_raw_processing.php
echo.
echo To run cache cleanup manually:
echo   php cron_cache_cleanup.php
echo.
echo All Guu_ prefixed schedule setups completed. Press any key to exit...
pause >nul
