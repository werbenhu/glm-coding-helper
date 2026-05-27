@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo GLM Coding Helper one-click start
echo Missing backend environment will be installed automatically.
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\one_click_start.ps1" -Target auto -Port 8888
pause
