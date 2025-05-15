@echo off
echo Reinstalling PHP and extensions...

:: Stop Apache and MySQL services
echo Stopping services...
net stop Apache2.4
net stop MySQL

:: Remove existing PHP installation
echo Removing existing PHP installation...
if exist "D:\xampp\php" (
    rmdir /s /q "D:\xampp\php"
)

:: Download and install PHP
echo Downloading PHP...
bitsadmin /transfer "PHPDownload" /priority normal "https://windows.php.net/downloads/releases/php-8.2.12-nts-Win32-vs16-x64.zip" "D:\xampp\php.zip"

:: Extract PHP
echo Extracting PHP...
if exist "D:\xampp\php.zip" (
    powershell -command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory('D:\xampp\php.zip', 'D:\xampp\php')"
    del "D:\xampp\php.zip"
)

:: Copy required DLLs
echo Copying required DLLs...
xcopy /E /I /Y "D:\xampp\php\ext" "D:\xampp\php\ext"

:: Update PHP configuration
echo Updating PHP configuration...
set PHP_INI=D:\xampp\php\php.ini
if exist "%PHP_INI%" (
    copy /Y "%PHP_INI%" "%PHP_INI%.backup"
)

:: Create new php.ini
echo Creating new php.ini...
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
) > "%PHP_INI%"

:: Restart services
echo Restarting services...
net start Apache2.4
net start MySQL

:: Verify installation
echo Verifying installation...
"D:\xampp\php\php.exe" -v
"D:\xampp\php\php.exe" -m | findstr "mysqli"

:: Final message
echo PHP reinstallation completed!
echo Please restart your computer to apply all changes.
pause
