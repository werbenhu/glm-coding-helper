@echo off
chcp 65001 >nul
cd /d "%~dp0..\.."
echo Building GLM Coding Helper portable CPU package...
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\release\build_portable.ps1"
pause
