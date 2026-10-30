@echo off
setlocal
title Budol Startup

REM This file should be saved in the root folder beside server.js.
set "PROJECT_DIR=%~dp0"

echo ==========================================
echo         BUDOL WEBSITE STARTUP
echo ==========================================
echo.
echo Project folder: %PROJECT_DIR%
echo.
echo BEFORE CONTINUING:
echo 1. Configure .env with your PostgreSQL DATABASE_URL (Supabase or local PostgreSQL).
echo 2. Keep the service and ngrok windows open while using Budol.
echo 3. If ngrok gives you a new URL, update the PayMongo webhook URL.
echo 4. XAMPP MySQL is no longer used by this PostgreSQL version.
echo.
pause

REM Start all Node.js services under the PostgreSQL-checking supervisor.
start "Budol - App Services" /D "%PROJECT_DIR%" cmd /k "npm start"

REM Expose the main server's webhook proxy so PayMongo can deliver webhooks.
start "Budol - ngrok" cmd /k "ngrok http 3000"

echo.
echo Startup commands have been launched in separate windows.
echo Wait for each service to start without errors.
echo Then open http://localhost:3000 in your browser.
echo.
echo If a window reports that a file cannot be found, check that the
echo corresponding service filename exists in your services folder.
echo.
pause
