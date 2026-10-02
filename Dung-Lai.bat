@echo off
chcp 65001 >nul
title Dung Showdown Offline
cd /d "%~dp0"
echo Dang tat server game + bot + web offline...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1"
echo.
echo Xong! Port 8000/8080 da duoc giai phong.
echo Muon choi lai thi mo Choi-Ngay.bat
pause
