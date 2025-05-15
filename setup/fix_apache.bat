@echo off
echo Fixing Apache configuration...

:: Check Apache installation
echo Checking Apache installation...
if not exist "D:\xampp\apache\bin\httpd.exe" (
    echo ERROR: Apache is not installed at D:\xampp\apache
    exit /b 1
)

:: Check Apache configuration
echo Checking Apache configuration...
set APACHE_CONF=D:\xampp\apache\conf\httpd.conf
if not exist "%APACHE_CONF%" (
    echo ERROR: Apache configuration file not found
    exit /b 1
)

:: Backup configuration
echo Backing up configuration...
if exist "%APACHE_CONF%.backup" del "%APACHE_CONF%.backup"
if exist "%APACHE_CONF%" copy /Y "%APACHE_CONF%" "%APACHE_CONF%.backup"

:: Update configuration
echo Updating configuration...
(
    echo Listen 80
    echo ServerName localhost:80
    echo DocumentRoot "D:\xampp\htdocs"
    echo 
    echo <Directory "D:\xampp\htdocs">
    echo     Options Indexes FollowSymLinks Includes ExecCGI
    echo     AllowOverride All
    echo     Require all granted
    echo </Directory>
    echo 
    echo LoadModule php_module "D:\xampp\php\php8apache2_4.dll"
    echo PHPIniDir "D:\xampp\php"
    echo AddHandler application/x-httpd-php .php
    echo DirectoryIndex index.php index.html
) > "%APACHE_CONF%.tmp"

:: Replace configuration
echo Replacing configuration...
move /Y "%APACHE_CONF%.tmp" "%APACHE_CONF%"

:: Check ports
echo Checking ports...
netstat -ano | findstr "80" > nul
if not errorlevel 1 (
    echo Port 80 is in use
    echo Please stop the process using port 80
    exit /b 1
)

:: Restart Apache
echo Restarting Apache...
net stop Apache2.4
net start Apache2.4

:: Verify Apache
echo Verifying Apache...
netstat -ano | findstr "80" > nul
if errorlevel 1 (
    echo ERROR: Apache failed to start
    exit /b 1
)

:: Final message
echo Apache configuration fixed!
echo Apache is running on port 80
pause
