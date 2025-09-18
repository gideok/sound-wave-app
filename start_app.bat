@echo off
echo Starting Sound Wave App (Both Backend and Frontend)...
echo.
echo Starting Backend Server...
start "Backend Server" cmd /k "cd /d %~dp0backend && call venv\Scripts\activate.bat && python main.py"
echo.
echo Waiting 3 seconds before starting frontend...
timeout /t 3 /nobreak >nul
echo.
echo Starting Frontend Server...
start "Frontend Server" cmd /k "cd /d %~dp0frontend && npm run dev"
echo.
echo Both servers are starting...
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
echo.
pause
