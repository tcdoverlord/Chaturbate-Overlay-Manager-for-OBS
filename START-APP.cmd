@echo off
setlocal
cd /d "%~dp0"
if exist "Chaturbate 20-Overlay Studio.exe" (
  start "" "Chaturbate 20-Overlay Studio.exe"
  exit /b 0
)
if exist "release\win-unpacked\Chaturbate 20-Overlay Studio.exe" (
  start "" "release\win-unpacked\Chaturbate 20-Overlay Studio.exe"
  exit /b 0
)
if not exist node_modules\electron\dist\electron.exe (
  echo The desktop EXE has not been built yet.
  echo Run BUILD-EXE.cmd first, then launch the portable EXE from release.
  pause
  exit /b 1
)
call npm start
