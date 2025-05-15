@echo off
echo Debugging Apache issues...

:: 1. Check Apache installation
echo 1. Checking Apache installation...
if not exist "D:\xampp\apache\bin\httpd.exe" (
    echo ERROR: Apache executable not found
    exit /b 1
)

:: 2. Check error logs
echo 2. Checking Apache error logs...
if exist "D:\xampp\apache\logs\error.log" (
    type "D:\xampp\apache\logs\error.log"
)

:: 3. Test Apache configuration
echo 3. Testing Apache configuration...
"D:\xampp\apache\bin\httpd.exe" -t

:: 4. Check PHP module
echo 4. Checking PHP module...
if not exist "D:\xampp\php\php8apache2_4.dll" (
    echo ERROR: PHP module not found
    exit /b 1
)

:: 5. Check permissions
echo 5. Checking permissions...
icacls "D:\xampp\apache" /T /C /Q
icacls "D:\xampp\htdocs" /T /C /Q

:: 6. Check port 80
echo 6. Checking port 80...
netstat -ano | findstr "80"

:: 7. Check Apache service
echo 7. Checking Apache service...
sc query Apache2.4

:: 8. Check PHP configuration
echo 8. Checking PHP configuration...
"D:\xampp\php\php.exe" -i | findstr "Loaded Configuration File"

:: 9. Try to start Apache manually
echo 9. Trying to start Apache manually...
net stop Apache2.4
net start Apache2.4

:: 10. Check Apache status
echo 10. Checking Apache status...
sc query Apache2.4

:: 11. Final checks
echo 11. Final checks...
netstat -ano | findstr "80"

:: 12. Display error log
echo 12. Displaying Apache error log...
if exist "D:\xampp\apache\logs\error.log" (
    type "D:\xampp\apache\logs\error.log"
)

:: 13. Display PHP error log
echo 13. Displaying PHP error log...
if exist "D:\xampp\php\logs\php_error_log" (
    type "D:\xampp\php\logs\php_error_log"
)

:: Final message
echo Debugging completed.
echo Please check the logs above for any errors.
pause
