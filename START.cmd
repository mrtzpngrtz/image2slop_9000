@echo off
setlocal
cd /d "%~dp0"
set "STUDIO_PYTHON=python"
if exist "%~dp0.venv\Scripts\python.exe" set "STUDIO_PYTHON=%~dp0.venv\Scripts\python.exe"
"%STUDIO_PYTHON%" "%~dp0scripts\pipeline.py" all %*
set "PIPELINE_RESULT=%ERRORLEVEL%"
echo.
if not "%PIPELINE_RESULT%"=="0" echo The pipeline stopped. Read the message above and the run's logs folder.
pause
exit /b %PIPELINE_RESULT%
