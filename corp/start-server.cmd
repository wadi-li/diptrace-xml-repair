@echo off
cd /d "%~dp0"
powershell -NoProfile -STA -File "%~dp0dt-xml-repair-server.ps1"
if errorlevel 1 pause
