@echo off
echo Full Setup Process...

:: Check admin privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo This script requires administrator privileges
    echo Please right-click and select "Run as administrator"
    pause
    exit /b 1
)

:: 1. Reinstall PHP
echo 1. Reinstalling PHP...
call D:\xampp\htdocs\setup\reinstall_php.bat

:: 2. Fix Apache
echo 2. Fixing Apache...
call D:\xampp\htdocs\setup\fix_apache.bat

:: 3. Run main setup
echo 3. Running main setup...
call D:\xampp\htdocs\setup\setup_all.bat

:: 4. Verify installation
echo 4. Verifying installation...

:: Check PHP
echo Checking PHP...
"D:\xampp\php\php.exe" -v

:: Check MySQL
echo Checking MySQL...
"D:\xampp\mysql\bin\mysql.exe" -u root -e "SELECT VERSION();"

:: Check database
echo Checking database connection...
"D:\xampp\php\php.exe" -f D:\xampp\htdocs\test\test_db_connection.php

:: Final message
echo Setup completed successfully!
echo Please restart your computer to apply all changes.
echo You can access the application at http://localhost
pause
