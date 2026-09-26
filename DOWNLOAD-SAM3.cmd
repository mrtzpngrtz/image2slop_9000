@echo off
setlocal
cd /d "%~dp0"
"%~dp0tools\sam3-env\Scripts\python.exe" "%~dp0scripts\sam3_masks.py" download
set "SAM3_RESULT=%ERRORLEVEL%"
pause
exit /b %SAM3_RESULT%
