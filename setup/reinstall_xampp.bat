@echo off
echo Reinstalling XAMPP components...

:: 1. Stop services
echo 1. Stopping services...
net stop Apache2.4
net stop MySQL

:: 2. Backup existing installation
echo 2. Creating backup...
if not exist "D:\xampp_backup" mkdir "D:\xampp_backup"
xcopy /E /I /Y "D:\xampp" "D:\xampp_backup"

:: 3. Remove existing installation
echo 3. Removing existing installation...
if exist "D:\xampp" (
    rmdir /s /q "D:\xampp"
)

:: 4. Download XAMPP
echo 4. Downloading XAMPP...
bitsadmin /transfer "XAMPPDownload" /priority normal "https://sourceforge.net/projects/xampp/files/XAMPP%20Windows/8.2.12/xampp-windows-x64-8.2.12-0-VS16-installer.exe/download" "D:\xampp_installer.exe"

:: 5. Run installer
echo 5. Running XAMPP installer...
start /wait "" "D:\xampp_installer.exe" /S

:: 6. Configure Apache
echo 6. Configuring Apache...
set APACHE_CONF=D:\xampp\apache\conf\httpd.conf
if exist "%APACHE_CONF%.backup" del "%APACHE_CONF%.backup"
if exist "%APACHE_CONF%" copy /Y "%APACHE_CONF%" "%APACHE_CONF%.backup"

:: Update Apache configuration
echo Updating Apache configuration...
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
move /Y "%APACHE_CONF%.tmp" "%APACHE_CONF%"

:: 7. Configure PHP
echo 7. Configuring PHP...
set PHP_INI=D:\xampp\php\php.ini
if exist "%PHP_INI%.backup" del "%PHP_INI%.backup"
if exist "%PHP_INI%" copy /Y "%PHP_INI%" "%PHP_INI%.backup"

:: Update PHP configuration
echo Updating PHP configuration...
(
    echo [PHP]
    echo extension_dir="D:\xampp\php\ext"
    echo extension=mysqli
    echo extension=pdo_mysql
    echo extension=mysqlnd
    echo extension=openssl
    echo extension=gd
    echo extension=fileinfo
    echo extension=exif
    echo extension=mbstring
    echo extension=zip
    echo extension=curl
    echo extension=imagick
    echo extension=bz2
    echo date.timezone=Asia/Ho_Chi_Minh
    echo memory_limit=4096M
    echo max_execution_time=300
    echo upload_max_filesize=1024M
    echo post_max_size=1024M
) > "%PHP_INI%.tmp"

:: Replace configuration
move /Y "%PHP_INI%.tmp" "%PHP_INI%"

:: 8. Start services
echo 8. Starting services...
net start Apache2.4
net start MySQL

:: 9. Verify installation
echo 9. Verifying installation...

:: Check Apache
echo Checking Apache...
netstat -ano | findstr "80"

:: Check MySQL
echo Checking MySQL...
"D:\xampp\mysql\bin\mysql.exe" -u root -e "SELECT VERSION();"

:: Check PHP
echo Checking PHP...
"D:\xampp\php\php.exe" -v

:: Final message
echo XAMPP reinstallation completed!
echo Please check the logs above for any errors.
echo You can access the application at http://localhost
pause
