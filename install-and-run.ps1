# ContinuityBridge Installation and Startup Script for Windows
# This script installs dependencies and starts all required processes

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "ContinuityBridge Installation" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is installed
Write-Host "Checking Node.js installation..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "Error: Node.js is not installed!" -ForegroundColor Red
    Write-Host "Please install Node.js 18+ from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Install dependencies
Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to install dependencies!" -ForegroundColor Red
    exit 1
}

Write-Host "Dependencies installed successfully!" -ForegroundColor Green

# Set default environment variables if not already set
if (-not $env:QUEUE_BACKEND) {
    $env:QUEUE_BACKEND = "inmemory"
    Write-Host "Using default QUEUE_BACKEND: inmemory" -ForegroundColor Cyan
}

if (-not $env:PORT) {
    $env:PORT = "5000"
}

# Start the application
Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Starting ContinuityBridge" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "API Server:  http://localhost:5000" -ForegroundColor Green
Write-Host "Dashboard:   http://localhost:5173" -ForegroundColor Green
Write-Host "GraphQL:     http://localhost:5000/graphql" -ForegroundColor Green
Write-Host "Queue:       $env:QUEUE_BACKEND (non-persistent)" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press Ctrl+C to stop all processes" -ForegroundColor Yellow
Write-Host ""

# Start the development server (starts both API and client)
npm run dev
