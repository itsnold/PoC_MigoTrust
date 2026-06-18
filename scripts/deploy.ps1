# MIGO Protect - deploy the escrow contract to Stellar testnet.
# Usage: .\scripts\deploy.ps1
#
# Creates+funds a testnet identity (if needed), builds the Rust contract,
# deploys it, calls init with the testnet XLM SAC address, and writes
# VITE_CONTRACT_ID into .env.local so the frontend picks it up on restart.

param(
    [string]$Identity = "migo-deployer",
    [string]$Network  = "testnet"
)

$ErrorActionPreference = "Stop"

# Resolve repo root from script location (scripts/ -> parent)
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $RepoRoot

Write-Host "`n=== MIGO Protect - Testnet Deploy ===`n" -ForegroundColor Cyan
Write-Host "Repo root: $RepoRoot" -ForegroundColor Gray

# 1. Ensure a testnet identity exists + is funded
Write-Host "[1/5] Checking identity '$Identity'..." -ForegroundColor Yellow
$idExists = stellar keys ls 2>&1 | Select-String $Identity
if (-not $idExists) {
    Write-Host "  Creating + funding new identity..." -ForegroundColor Gray
    & stellar --quiet keys generate $Identity --network $Network --fund
    if ($LASTEXITCODE -ne 0) {
        throw "Key generation failed with exit code $LASTEXITCODE."
    }
} else {
    Write-Host "  Identity exists. Ensuring it is funded..." -ForegroundColor Gray
    & stellar --quiet keys fund $Identity --network $Network
    if ($LASTEXITCODE -ne 0) {
        throw "Key funding failed with exit code $LASTEXITCODE."
    }
}

# 2. Build the contract
Write-Host "`n[2/5] Building contract..." -ForegroundColor Yellow
stellar contract build
$wasmPath = Join-Path $RepoRoot "target\wasm32v1-none\release\migo_escrow.wasm"
if (-not (Test-Path $wasmPath)) {
    throw "WASM not found at $wasmPath. Build may have failed."
}
Write-Host "  Built: $wasmPath" -ForegroundColor Gray

# 3. Deploy to testnet
Write-Host "`n[3/5] Deploying to $Network..." -ForegroundColor Yellow
$deployOutput = & stellar --quiet contract deploy `
    --wasm $wasmPath `
    --source $Identity `
    --network $Network

if ($LASTEXITCODE -ne 0) {
    throw "Contract deploy failed with exit code $LASTEXITCODE."
}

# The deploy output is the contract ID (starts with C)
$contractId = ($deployOutput | Select-String "^C[A-Z0-9]{55}$").Matches.Value
if (-not $contractId) {
    $contractId = ($deployOutput -join "`n" | Select-String "C[A-Z0-9]{55}").Matches.Value
}
if (-not $contractId) {
    Write-Host "Deploy output:" -ForegroundColor Red
    Write-Host $deployOutput
    throw "Could not extract contract ID from deploy output."
}
Write-Host "  Contract ID: $contractId" -ForegroundColor Green

# 4. Initialize - set the escrow token to testnet XLM SAC
Write-Host "`n[4/5] Initializing contract (setting XLM SAC as escrow token)..." -ForegroundColor Yellow
$XLM_SAC = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
& stellar --quiet contract invoke `
    --id $contractId `
    --source $Identity `
    --network $Network `
    -- `
    init `
    --token $XLM_SAC

if ($LASTEXITCODE -ne 0) {
    throw "Contract init failed with exit code $LASTEXITCODE."
}

Write-Host "  Contract initialized." -ForegroundColor Green

# 5. Write contract ID into .env.local
Write-Host "`n[5/5] Writing .env.local..." -ForegroundColor Yellow
$envFile = Join-Path $RepoRoot ".env.local"
$envContent = @"
# MIGO Protect - Stellar testnet config
VITE_CONTRACT_ID=$contractId
VITE_SOROBAN_RPC=https://soroban-testnet.stellar.org
VITE_HORIZON_URL=https://horizon-testnet.stellar.org
VITE_XLM_SAC=$XLM_SAC
"@

Set-Content -Path $envFile -Value $envContent -Encoding UTF8
Write-Host "  Written to $envFile" -ForegroundColor Green

Write-Host "`n=== Deploy complete! ===`n" -ForegroundColor Cyan
Write-Host "Contract ID: $contractId" -ForegroundColor Green
Write-Host "Restart pnpm dev to pick up the new contract ID." -ForegroundColor White
