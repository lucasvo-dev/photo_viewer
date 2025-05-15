@echo off
echo Installing MySQL driver...

:: Enable MySQL extension in php.ini
set PHP_INI=D:\xampp\php\php.ini
set EXT_DIR=D:\xampp\php\ext

:: Backup current php.ini
if exist "%PHP_INI%.backup" del "%PHP_INI%.backup"
if exist "%PHP_INI%" copy /Y "%PHP_INI%" "%PHP_INI%.backup"

:: Enable MySQL extensions
echo Enabling MySQL extensions...
if exist "%PHP_INI%" (
    echo extension=mysqli > "%PHP_INI%"
    echo extension=pdo_mysql >> "%PHP_INI%"
    echo extension=mysqlnd >> "%PHP_INI%"
)

:: Copy MySQL DLLs if needed
if not exist "%EXT_DIR%\php_mysqli.dll" (
    echo Copying MySQL DLLs...
    copy /Y "%EXT_DIR%\php_mysqli.dll" "%EXT_DIR%" 2>nul
    copy /Y "%EXT_DIR%\php_pdo_mysql.dll" "%EXT_DIR%" 2>nul
    copy /Y "%EXT_DIR%\php_mysqlnd.dll" "%EXT_DIR%" 2>nul
)

:: Restart Apache to apply changes
echo Restarting Apache...
net stop Apache2.4
net start Apache2.4

:: Verify installation
echo Verifying installation...
"D:\xampp\php\php.exe" -m | findstr "mysqli" > nul
if errorlevel 1 (
    echo ERROR: Failed to install MySQL driver
    exit /b 1
) else (
    echo MySQL driver installed successfully!
)

pause
