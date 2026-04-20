@echo off
setlocal

cd /d "%~dp0"
echo Starting Bankroll Log server on http://127.0.0.1:3000
call npm start

echo.
echo Bankroll Log server stopped.
pause
