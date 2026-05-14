# ============================================
# SIMULACRUM - Script de Inicio
# Inicia Backend + Frontend juntos
# ============================================

Write-Host ""
Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host "                                                           " -ForegroundColor Cyan
Write-Host "   SIMULACRUM TRADING SYSTEM                               " -ForegroundColor Cyan
Write-Host "                                                           " -ForegroundColor Cyan
Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host ""

# Matar procesos previos si existen
Write-Host "Cerrando procesos previos..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path

# Iniciar Backend
Write-Host ""
Write-Host "Iniciando Backend (puerto 3001)..." -ForegroundColor Green
$backendPath = Join-Path $scriptPath "backend"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; node src/server.js"

Start-Sleep -Seconds 3

# Iniciar Frontend
Write-Host "Iniciando Frontend (puerto 5173)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$scriptPath'; npm run dev"

Start-Sleep -Seconds 5

Write-Host ""
Write-Host "===========================================================" -ForegroundColor Green
Write-Host "                                                           " -ForegroundColor Green
Write-Host "   SISTEMA INICIADO                                        " -ForegroundColor Green
Write-Host "                                                           " -ForegroundColor Green
Write-Host "   Backend:  http://localhost:3001                         " -ForegroundColor Green
Write-Host "   Frontend: http://localhost:5173                         " -ForegroundColor Green
Write-Host "                                                           " -ForegroundColor Green
Write-Host "===========================================================" -ForegroundColor Green
Write-Host ""

# Abrir navegador
Start-Process "http://localhost:5173"
