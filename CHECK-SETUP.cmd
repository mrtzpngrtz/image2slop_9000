@echo off
setlocal
cd /d "%~dp0"
set "STUDIO_PYTHON=python"
if exist "%~dp0.venv\Scripts\python.exe" set "STUDIO_PYTHON=%~dp0.venv\Scripts\python.exe"
"%STUDIO_PYTHON%" "%~dp0scripts\pipeline.py" doctor
set "PIPELINE_RESULT=%ERRORLEVEL%"
pause
exit /b %PIPELINE_RESULT%
