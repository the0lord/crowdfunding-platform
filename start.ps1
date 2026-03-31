# Start the Crowdfunding Platform (BSC + Polygon Multi-Chain)
# Run this script from the project root directory

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CrowdFund KG - Startup Script" -ForegroundColor Cyan
Write-Host "  BSC Testnet + Polygon Amoy" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$projectPath = $PSScriptRoot
if (-not $projectPath) {
    $projectPath = Get-Location
}

# Check if PostgreSQL is running
Write-Host "[1/4] Checking PostgreSQL..." -ForegroundColor Yellow
$pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
if ($pgService -and $pgService.Status -eq "Running") {
    Write-Host "  PostgreSQL is running" -ForegroundColor Green
} else {
    Write-Host "  WARNING: PostgreSQL may not be running!" -ForegroundColor Red
    Write-Host "  Please start PostgreSQL and create 'crowdfunding' database" -ForegroundColor Red
}

# Check .env file
Write-Host ""
Write-Host "[2/4] Checking backend configuration..." -ForegroundColor Yellow
$envPath = Join-Path $projectPath "backend\.env"
if (Test-Path $envPath) {
    Write-Host "  .env file found" -ForegroundColor Green
} else {
    Write-Host "  Creating .env from template..." -ForegroundColor Yellow
    Copy-Item (Join-Path $projectPath "backend\.env.example") $envPath
    Write-Host "  Please edit backend\.env with your settings" -ForegroundColor Red
}

# Start Backend
Write-Host ""
Write-Host "[3/4] Starting Backend Server..." -ForegroundColor Yellow
$backendPath = Join-Path $projectPath "backend"

Start-Process -FilePath "powershell" -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$backendPath'; Write-Host 'Starting Go Backend...' -ForegroundColor Cyan; go run ./cmd/api"
) -WindowStyle Normal

Write-Host "  Backend starting on http://localhost:8080" -ForegroundColor Green

# Wait for backend to start
Start-Sleep -Seconds 3

# Start Frontend
Write-Host ""
Write-Host "[4/4] Starting Frontend Server..." -ForegroundColor Yellow
$frontendPath = Join-Path $projectPath "frontend"

Start-Process -FilePath "powershell" -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$frontendPath'; Write-Host 'Starting React Frontend...' -ForegroundColor Cyan; npm run dev"
) -WindowStyle Normal

Write-Host "  Frontend starting on http://localhost:3000" -ForegroundColor Green

# Display summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Platform Starting!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Frontend: " -NoNewline; Write-Host "http://localhost:3000" -ForegroundColor Green
Write-Host "  Backend:  " -NoNewline; Write-Host "http://localhost:8080" -ForegroundColor Green
Write-Host "  Admin:    " -NoNewline; Write-Host "http://localhost:3000/admin" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Chains:" -ForegroundColor Cyan
Write-Host "    Campaigns (KGST): BSC Testnet (ChainID 97)"
Write-Host "    Governance:       Polygon Amoy (ChainID 80002)"
Write-Host ""
Write-Host "  Contracts (BSC Testnet):" -ForegroundColor Cyan
Write-Host "    MockKGST:        0x1523a1328E35782eBe096B1d12BBd9d302f3406C"
Write-Host "    CampaignFactory: 0xf867D4B0768558B58Da7e87b73BE3b341adC2053"
Write-Host ""
Write-Host "  To access admin:" -ForegroundColor Yellow
Write-Host "  1. Add your wallet to ADMIN_ADDRESSES in backend\.env"
Write-Host "  2. Restart the backend server"
Write-Host "  3. Connect wallet and go to /admin"
Write-Host ""
Write-Host "  Press any key to exit this window..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
