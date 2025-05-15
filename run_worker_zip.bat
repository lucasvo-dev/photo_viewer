@echo off
echo === Starting ZIP Worker: %date% %time% === >> logs\worker-debug.log
echo Current Directory Before CD: %CD% >> logs\worker-debug.log
cd /d "%~dp0"
echo Current Directory After CD: %CD% >> logs\worker-debug.log

:: Auto-detect PHP executable path
set PHP_EXE=
if exist "C:\xampp\php\php.exe" (
    set PHP_EXE="C:\xampp\php\php.exe"
    echo Found PHP at: %PHP_EXE% >> logs\worker-debug.log
) else if exist "D:\xampp\php\php.exe" (
    set PHP_EXE="D:\xampp\php\php.exe"
    echo Found PHP at: %PHP_EXE% >> logs\worker-debug.log
)

if not defined PHP_EXE (
    echo ERROR: Could not find php.exe in C:\xampp\php or D:\xampp\php. Please check XAMPP installation path. >> logs\worker-output.log
    echo ERROR: PHP Path detection failed. >> logs\worker-debug.log
    echo PHP Path Detection Exit Code: 1 >> logs\worker-debug.log
    goto :eof
)

echo === Running ZIP Worker: %date% %time% === >> logs\worker-output.log
%PHP_EXE% "%~dp0worker_zip.php" >> logs\worker-output.log 2>&1
echo ZIP Worker Exit Code: %errorlevel% >> logs\worker-debug.log

echo === ZIP Worker Finished: %date% %time% === >> logs\worker-debug.log 