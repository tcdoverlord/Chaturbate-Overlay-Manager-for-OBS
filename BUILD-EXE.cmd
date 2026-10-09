@echo off
setlocal
cd /d "%~dp0"
title Build Chaturbate 20-Overlay Studio EXE
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required only to build the Windows EXE.
  echo Install Node.js LTS from https://nodejs.org/ and run this again.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js LTS with npm included.
  pause
  exit /b 1
)
echo.
echo =============================================
echo  Chaturbate 20-Overlay Studio - EXE Builder
echo =============================================
echo.
echo This builds a Windows app with a simple desktop UI.
echo The local bridge runs inside the app; no console window is needed.
echo The first build needs internet to download Electron build tools.
echo.
rem Detect incomplete or interrupted npm installs. A folder existing is not enough.
set NEED_INSTALL=0
if not exist node_modules\electron-builder\bin\electron-builder.js set NEED_INSTALL=1
if not exist node_modules\electron\install.js set NEED_INSTALL=1
if "%NEED_INSTALL%"=="0" (
  node -e "require.resolve('defer-to-connect',{paths:['./node_modules/electron/node_modules/@szmarczak/http-timer']})" >nul 2>nul
  if errorlevel 1 set NEED_INSTALL=1
)
if "%NEED_INSTALL%"=="1" (
  echo.
  echo Repairing or installing build tools...
  echo If a previous install was interrupted, this will remove its incomplete node_modules folder.
  if exist node_modules (
    rmdir /s /q node_modules
    if exist node_modules (
      echo.
      echo Could not remove node_modules. Close other terminals or Electron processes using this folder,
      echo then run BUILD-EXE.cmd again. A Windows restart may release a stuck file lock.
      goto failed
    )
  )
  call npm cache verify
  if errorlevel 1 goto failed
  call npm install --no-audit --no-fund --prefer-online
  if errorlevel 1 (
    echo.
    echo Dependency installation failed. Check your internet connection and rerun this builder.
    goto failed
  )
  node -e "require.resolve('defer-to-connect',{paths:['./node_modules/electron/node_modules/@szmarczak/http-timer']})" >nul 2>nul
  if errorlevel 1 (
    echo.
    echo Electron dependencies are still incomplete after npm install.
    echo Close this window, delete node_modules manually, and rerun BUILD-EXE.cmd.
    goto failed
  )
)
echo.
echo Running checks...
node --check desktop\main.js
if errorlevel 1 goto failed
node --check Bridge\server.js
if errorlevel 1 goto failed
node Bridge\tests\integration-smoke.js
if errorlevel 1 goto failed
node Bridge\tests\golden-rule-packs.js
if errorlevel 1 goto failed
if errorlevel 1 goto failed
echo.
echo Building installer and portable EXE...
call npm run dist
if errorlevel 1 goto failed
echo.
echo BUILD SUCCESS!
echo EXE files are in the release folder.
echo Give models the portable EXE or installer from that folder.
pause
exit /b 0
:failed
echo.
echo BUILD FAILED. Read the error above, then try again.
pause
exit /b 1
