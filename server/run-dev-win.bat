@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
echo [Dev] Installing deps if needed...
npm install
echo [Dev] Starting ts-node-dev server on ws://localhost:8080
npm run dev