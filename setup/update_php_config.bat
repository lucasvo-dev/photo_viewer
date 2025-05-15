@echo off
echo Updating PHP configuration...

:: Backup current php.ini
set PHP_INI=D:\xampp\php\php.ini
set BACKUP=%PHP_INI%.backup

if exist "%BACKUP%" del "%BACKUP%"
if exist "%PHP_INI%" copy /Y "%PHP_INI%" "%BACKUP%"

:: Create new php.ini with all required settings
echo Creating new php.ini with required settings...

:: Copy base configuration
copy /Y "%PHP_INI%" "%PHP_INI%.tmp"

:: Add extensions configuration
type D:\xampp\htdocs\config\php_extensions.ini >> "%PHP_INI%.tmp"

:: Move new configuration to php.ini
move /Y "%PHP_INI%.tmp" "%PHP_INI%"

:: Verify extensions
echo Verifying extensions...
D:\xampp\php\php.exe -m | findstr "mysqli" > nul
if errorlevel 1 (
    echo ERROR: MySQL extensions not found
    exit /b 1
)

:: Restart Apache to apply changes
echo Restarting Apache to apply changes...
net stop Apache2.4
net start Apache2.4

:: Verify changes
echo Verifying PHP configuration...
D:\xampp\php\php.exe -i | findstr "Loaded Configuration File" > nul
if errorlevel 1 (
    echo ERROR: Failed to load PHP configuration
    exit /b 1
)

:: Final message
echo PHP configuration updated successfully!
echo Extensions loaded:
D:\xampp\php\php.exe -m | findstr "mysqli pdo_mysql mysqlnd"
pause
