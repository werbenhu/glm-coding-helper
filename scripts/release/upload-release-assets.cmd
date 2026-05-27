@echo off
chcp 65001 >nul
cd /d "%~dp0..\.."
echo Upload GLM Coding Helper release assets
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\release\upload_release_assets.ps1"
pause
