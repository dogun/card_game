@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
if "%PORT%"=="" (
  set PORT=8080
)
echo [Prod] Building TypeScript...
npm install
npm run build
echo [Prod] Starting server on ws://localhost:%PORT%
npm start