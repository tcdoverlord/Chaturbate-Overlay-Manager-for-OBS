@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js 20 or newer, then rerun this file.
  pause
  exit /b 1
)
node --version
node server.js
pause
