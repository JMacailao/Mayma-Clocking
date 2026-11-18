@echo off
rem Starts the AvilonX ACR122U helper (hands taps to the AvilonX page). Keep the window open.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0acr122u-avilonx.ps1"
pause
