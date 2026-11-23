@echo off
rem Double-click this file to start Sky Brawl and open it in your browser.
rem (Works even when PowerShell blocks "npm start".)
cd /d "%~dp0"
if not exist node_modules (
  echo Installing packages, first time only...
  call npm.cmd install
)
rem Open the game in your browser 2 seconds from now, once the server is up.
start "" /min cmd /c "timeout /t 2 >/dev/null & start http://localhost:3000"
echo Sky Brawl is running at http://localhost:3000
echo Close this window to stop the server.
node server\index.js
pause
