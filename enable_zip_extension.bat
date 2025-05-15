@echo off
echo Enabling Zip extension in php.ini...

:: Backup current php.ini
if exist "D:\xampp\php\php.ini.backup" del "D:\xampp\php\php.ini.backup"
if exist "D:\xampp\php\php.ini" copy /Y "D:\xampp\php\php.ini" "D:\xampp\php\php.ini.backup"

:: Enable zip extension
powershell -Command "(Get-Content 'D:\xampp\php\php.ini') -replace ';extension=zip', 'extension=zip' | Set-Content 'D:\xampp\php\php.ini'"

:: Restart Apache and MySQL services
echo Restarting Apache and MySQL services...
net stop Apache2.4
net stop MySQL
net start MySQL
net start Apache2.4

:: Wait for services to start
timeout /t 5

:: Verify zip extension is loaded
echo Checking if zip extension is loaded...
"D:\xampp\php\php.exe" -m | find "zip"

if errorlevel 1 (
    echo ERROR: Zip extension could not be loaded. Please check php.ini.
    pause
    exit /b 1
)

echo Zip extension enabled successfully!
echo Please restart your PHP scripts.
pause
