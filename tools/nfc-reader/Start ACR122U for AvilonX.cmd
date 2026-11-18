@echo off
rem Starts the AvilonX ACR122U helper (sends taps to AvilonX). Keep the window open.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0acr122u-avilonx.ps1"
pause
