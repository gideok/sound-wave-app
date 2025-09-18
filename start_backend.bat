@echo off
echo Starting Sound Wave App Backend Server...
cd /d "%~dp0backend"
call venv\Scripts\activate.bat
python main.py
pause
