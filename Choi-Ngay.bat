@echo off
chcp 65001 >nul
title Pokemon Showdown Offline - VGC 2026 Reg M-C
cd /d "%~dp0"
echo ==============================================
echo   POKEMON SHOWDOWN OFFLINE - VGC 2026 Reg M-C
echo   Ban moi nhat (co Mega M-C) - Choi voi bot
echo ==============================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Chua cai Node.js! Tai o https://nodejs.org (ban LTS), cai xong mo lai file nay.
  pause
  exit /b 1
)
node start.js
pause
