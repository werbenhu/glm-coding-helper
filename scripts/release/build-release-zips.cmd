@echo off
chcp 65001 >nul
cd /d "%~dp0..\.."
echo Building release zip packages...
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\release\build_release_zips.ps1"
pause
