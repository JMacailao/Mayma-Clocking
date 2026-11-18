@echo off
rem Starts the ACR122U keyboard helper (types tags into the window in front).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0acr122u-keyboard.ps1"
pause
