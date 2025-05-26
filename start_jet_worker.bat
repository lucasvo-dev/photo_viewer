@echo off
echo Starting Jet Cache Worker...
echo This worker will process RAW image cache jobs in the background.
echo.
echo To stop the worker, press Ctrl+C
echo.

cd /d "%~dp0"
php worker_jet_cache.php

echo.
echo Jet Cache Worker stopped.
pause 