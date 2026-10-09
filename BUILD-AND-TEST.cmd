@echo off
setlocal
cd /d "%~dp0Bridge"
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js 20 or newer is required.
  pause
  exit /b 1
)
rem Ensure root runtime dependencies (including adm-zip for pack import/export) exist before starting the bridge.
if not exist node_modules\adm-zip\package.json (
  echo Installing application dependencies required by the bridge...
  cd /d "%~dp0"
  call npm install --no-audit --no-fund --prefer-online
  if errorlevel 1 goto failed
  cd /d "%~dp0Bridge"
)
echo Checking JavaScript syntax...
node --check server.js
if errorlevel 1 goto failed
node --check ..\desktop\main.js
if errorlevel 1 goto failed
node --check extension\worker.js
if errorlevel 1 goto failed
node --check extension\content.js
if errorlevel 1 goto failed
node --check extension\popup.js
if errorlevel 1 goto failed
echo.
echo PASS: JavaScript syntax checks completed.
echo.
echo Running bridge integration smoke test...
cd /d "%~dp0Bridge"
node tests\integration-smoke.js
if errorlevel 1 goto failed
node tests\golden-rule-packs.js
if errorlevel 1 goto failed
if errorlevel 1 goto failed
echo.
echo Running overlay-lab smoke test...
cd /d "%~dp0Overlay-Lab"
node tests\smoke-test.js
if errorlevel 1 goto failed
echo.
echo PASS: available local checks completed.
echo NOTE: Local tests do not prove live Chaturbate browser tip detection or real OBS rendering.
pause
exit /b 0
:failed
echo.
echo FAIL: Review the error above.
pause
exit /b 1
