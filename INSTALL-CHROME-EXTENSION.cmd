@echo off
start "" "chrome://extensions"
echo.
echo In Chrome:
echo 1. Enable Developer mode.
echo 2. Click Load unpacked.
echo 3. Select this folder:
echo    %~dp0Bridge\extension
echo.
pause
