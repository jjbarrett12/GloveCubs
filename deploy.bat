@echo off
cd /d "%~dp0"
echo.
echo  Glovecubs - Quick Deploy
echo  -----------------------
git add -A
if errorlevel 1 ( echo Git add failed. & pause & exit /b 1 )
git status --short
echo.
set MSG=Deploy: %date% %time%
git commit -m "%MSG%" 2>nul
echo.
git push origin HEAD
if errorlevel 1 ( echo Push failed. Check remote / auth and try again. )
echo.
pause
