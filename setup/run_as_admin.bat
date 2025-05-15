@echo off
echo Running setup with administrator privileges...

:: Check if running as admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo This script requires administrator privileges
    echo Please right-click and select "Run as administrator"
    pause
    exit /b 1
)

:: Update PHP configuration
call D:\xampp\htdocs\setup\update_php_config.bat

:: Run main setup
call D:\xampp\htdocs\setup\setup_all.bat

:: Final message
echo Setup completed successfully!
echo Please restart your computer to apply all changes.
pause
