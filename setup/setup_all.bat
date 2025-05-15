@echo off
echo Starting setup process...

:: 1. Check if XAMPP is installed
if not exist "D:\xampp\mysql\bin\mysql.exe" (
    echo ERROR: XAMPP is not installed at D:\xampp
    exit /b 1
)

:: 2. Create required directories
mkdir D:\xampp\htdocs\logs 2>nul
mkdir D:\xampp\htdocs\tmp 2>nul
mkdir D:\xampp\htdocs\uploads 2>nul
mkdir D:\xampp\htdocs\cache 2>nul
mkdir D:\xampp\htdocs\database\backup 2>nul

:: 3. Import database structure
echo Importing database structure...
"D:\xampp\mysql\bin\mysql.exe" -u root < D:\xampp\htdocs\database\recreate_database.sql

:: 4. Install MySQL driver for PHP
echo Installing MySQL driver...
"D:\xampp\php\php.exe" -m | findstr "mysqli" > nul
if errorlevel 1 (
    echo ERROR: MySQL driver is not installed
    echo Please install the MySQL driver for PHP
    exit /b 1
)

:: 5. Import data from SQLite
echo Importing data from SQLite...
"D:\xampp\php\php.exe" D:\xampp\htdocs\database\import_from_sqlite.php

:: 6. Test database connection
echo Testing database connection...
"D:\xampp\php\php.exe" D:\xampp\htdocs\test\test_db_connection.php

:: 7. Create Apache configuration
echo Creating Apache configuration...
copy /Y D:\xampp\htdocs\config\apache.conf D:\xampp\apache\conf\extra\httpd-vhosts.conf

:: 8. Create PHP configuration
echo Creating PHP configuration...
copy /Y D:\xampp\htdocs\config\php.ini D:\xampp\php\php.ini

:: 9. Create backup of database
echo Creating database backup...
"D:\xampp\mysql\bin\mysqldump.exe" -u root photo_gallery > D:\xampp\htdocs\database\backup\photo_gallery_backup.sql

:: 10. Verify setup
echo Verifying setup...
if exist D:\xampp\htdocs\logs\database.log (
    type D:\xampp\htdocs\logs\database.log
)

:: 11. Cleanup temporary files
echo Cleaning up...
del /Q D:\xampp\htdocs\database\import_from_sqlite.php

:: 12. Final message
echo Setup completed!
echo Please check the logs for any errors.
echo You can access the application at http://localhost

pause
