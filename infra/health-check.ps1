# Script per verificare lo stato dei servizi
# Usage: .\health-check.ps1

Write-Host "`n🔍 Checking services health..." -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

# Verifica stato container
$containers = @("calciopred-postgres", "calciopred-redis", "calciopred-api", "calciopred-frontend")

foreach ($container in $containers) {
    $status = docker inspect --format='{{.State.Health.Status}}' $container 2>$null
    
    if ($LASTEXITCODE -eq 0) {
        if ($status -eq "healthy") {
            Write-Host "✅ $container : HEALTHY" -ForegroundColor Green
        } elseif ($status -eq "starting") {
            Write-Host "🔄 $container : STARTING" -ForegroundColor Yellow
        } else {
            Write-Host "❌ $container : UNHEALTHY" -ForegroundColor Red
        }
    } else {
        Write-Host "⚠️  $container : NOT RUNNING" -ForegroundColor Red
    }
}

Write-Host "`n================================" -ForegroundColor Cyan

# Test endpoints
Write-Host "`n🌐 Testing endpoints...`n" -ForegroundColor Cyan

# API Health
try {
    $apiResponse = Invoke-WebRequest -Uri "http://localhost:3001/health" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✅ API Health: $($apiResponse.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "❌ API Health: FAILED" -ForegroundColor Red
}

# Frontend
try {
    $frontendResponse = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✅ Frontend: $($frontendResponse.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "❌ Frontend: FAILED" -ForegroundColor Red
}

Write-Host ""
