$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw "Node.js 22+ is required. Install it from https://nodejs.org" }
$nodeVersion = [version]((node --version) -replace '^v', '')
if ($nodeVersion.Major -lt 22) { throw "Node.js 22+ is required. Install it from https://nodejs.org" }
if (-not (Test-Path "node_modules")) { Write-Host "Installing dependencies..."; npm install }
node server/index.js
