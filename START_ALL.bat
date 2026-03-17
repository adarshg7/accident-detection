@echo off
echo Starting Accident Detection System...

start "Backend" cmd /k "cd /d D:\New folder\New folder\backend && node src/server.js"

timeout /t 3

start "Gov Frontend" cmd /k "cd /d D:\New folder\New folder\frontend-gov && npm start"

start "User Frontend" cmd /k "cd /d D:\New folder\New folder\frontend-user && set PORT=3001 && npm start"

echo All services started!
echo Backend  → http://localhost:5000
echo Gov      → http://localhost:3000
echo User     → http://localhost:3001
pause