@echo off
setlocal
cd /d %~dp0
where node >nul 2>&1 || (echo Node.js 22+ is required. Install it from https://nodejs.org & exit /b 1)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)" || (echo Node.js 22+ is required. Install it from https://nodejs.org & exit /b 1)
if not exist node_modules (
  echo Installing dependencies...
  call npm install || exit /b 1
)
node server\index.js
