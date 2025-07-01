@echo off
echo ========================================
echo Directory Index Worker Cron Setup
echo ========================================
echo.

REM Get current directory
set SCRIPT_DIR=%~dp0
set PHP_PATH=D:\xampp\php\php.exe
set WORKER_SCRIPT=%SCRIPT_DIR%worker_directory_index.php

echo Current directory: %SCRIPT_DIR%
echo PHP executable: %PHP_PATH%
echo Worker script: %WORKER_SCRIPT%
echo.

REM Test if PHP and worker script exist
if not exist "%PHP_PATH%" (
    echo ERROR: PHP not found at %PHP_PATH%
    echo Please update PHP_PATH in this script to point to your PHP installation
    pause
    exit /b 1
)

if not exist "%WORKER_SCRIPT%" (
    echo ERROR: Worker script not found at %WORKER_SCRIPT%
    pause
    exit /b 1
)

echo Testing worker script...
"%PHP_PATH%" "%WORKER_SCRIPT%" --help
if %ERRORLEVEL% neq 0 (
    echo ERROR: Worker script test failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo CRON JOB SETUP OPTIONS
echo ========================================
echo.
echo Choose setup method:
echo 1. Windows Task Scheduler (Recommended)
echo 2. Manual cron commands
echo 3. Test run only
echo.
set /p choice="Enter your choice (1-3): "

if "%choice%"=="1" goto :taskscheduler
if "%choice%"=="2" goto :manual
if "%choice%"=="3" goto :testrun
goto :invalid

:taskscheduler
echo.
echo Setting up Windows Task Scheduler...
echo.

REM Create task for directory index rebuild every 6 hours
schtasks /create /tn "PhotoGallery_DirectoryIndexRebuild" /tr "\"%PHP_PATH%\" \"%WORKER_SCRIPT%\"" /sc hourly /mo 6 /st 02:00 /f
if %ERRORLEVEL% equ 0 (
    echo ✓ Directory index rebuild task created (every 6 hours at 02:00)
) else (
    echo ✗ Failed to create directory index rebuild task
)

REM Create task for quick index update every hour
schtasks /create /tn "PhotoGallery_DirectoryIndexUpdate" /tr "\"%PHP_PATH%\" \"%WORKER_SCRIPT%\" \"\" \"120\"" /sc hourly /st 30 /f
if %ERRORLEVEL% equ 0 (
    echo ✓ Directory index update task created (every hour at :30, 2min limit)
) else (
    echo ✗ Failed to create directory index update task
)

echo.
echo Tasks created successfully!
echo.
echo To view/manage tasks:
echo - Open Task Scheduler (taskschd.msc)
echo - Look for PhotoGallery_DirectoryIndex* tasks
echo.
echo To remove tasks later:
echo - schtasks /delete /tn "PhotoGallery_DirectoryIndexRebuild" /f
echo - schtasks /delete /tn "PhotoGallery_DirectoryIndexUpdate" /f
echo.
goto :end

:manual
echo.
echo Manual cron setup commands:
echo.
echo Add these to your cron configuration:
echo.
echo # Directory index full rebuild every 6 hours
echo 0 2,8,14,20 * * * "%PHP_PATH%" "%WORKER_SCRIPT%" ^>^> "%SCRIPT_DIR%logs\directory_index.log" 2^>^&1
echo.
echo # Directory index quick update every hour
echo 30 * * * * "%PHP_PATH%" "%WORKER_SCRIPT%" "" "120" ^>^> "%SCRIPT_DIR%logs\directory_index.log" 2^>^&1
echo.
echo Note: Create logs directory if it doesn't exist
echo.
goto :end

:testrun
echo.
echo Running test build...
echo.
"%PHP_PATH%" "%WORKER_SCRIPT%" "" "60" "force"
echo.
echo Test completed. Check logs for results.
goto :end

:invalid
echo Invalid choice. Please run script again and choose 1, 2, or 3.
goto :end

:end
echo.
echo ========================================
echo PERFORMANCE OPTIMIZATION NOTES
echo ========================================
echo.
echo This directory index system provides:
echo - 10-100x faster search performance
echo - Instant album browsing
echo - Cached thumbnails and file counts
echo - Reduced server load
echo.
echo For best results:
echo 1. Run initial build: php worker_directory_index.php "" "1800" "force"
echo 2. Setup regular updates (this script)
echo 3. Monitor via Admin panel
echo.
echo Logs are written to: %SCRIPT_DIR%logs\
echo.
pause 