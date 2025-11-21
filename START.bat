@echo off
echo ========================================
echo  Alyx Income Manager
echo ========================================
echo.
echo Starting local server...
echo Opening browser at http://localhost:8000
echo.
echo Keep this window open while using the app.
echo Press Ctrl+C to stop the server when done.
echo.
echo ========================================
timeout /t 2 /nobreak >nul
start http://localhost:8000
python -m http.server 8000
