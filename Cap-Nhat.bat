@echo off
chcp 65001 >nul
title Cap nhat Showdown Offline - VGC 2026 Reg M-C
cd /d "%~dp0"
echo ==============================================
echo   CAP NHAT BAN OFFLINE THEO SMOGON MOI NHAT
echo   (can mang - tat Choi-Ngay.bat truoc khi chay)
echo ==============================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Chua cai Node.js! Tai o https://nodejs.org (ban LTS).
  pause
  exit /b 1
)
where git >nul 2>nul
if errorlevel 1 (
  echo [LOI] Chua cai Git! Tai o https://git-scm.com roi chay lai.
  pause
  exit /b 1
)
node update.js
pause
