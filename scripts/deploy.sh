# MIGO Protect — deploy the escrow contract to Stellar testnet.
# Usage: ./scripts/deploy.sh
#
# Creates+funds a testnet identity (if needed), builds the Rust contract,
# deploys it, calls init with the testnet XLM SAC address, and writes
# VITE_CONTRACT_ID into .env.local so the frontend picks it up on restart.

set -e

IDENTITY="${1:-migo-deployer}"
NETWORK="testnet"
XLM_SAC="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

echo ""
echo "=== MIGO Protect — Testnet Deploy ==="
echo ""

# 1. Ensure a testnet identity exists + is funded
echo "[1/5] Checking identity '$IDENTITY'..."
if ! stellar keys ls 2>/dev/null | grep -q "$IDENTITY"; then
    echo "  Creating + funding new identity..."
    stellar --quiet keys generate "$IDENTITY" --network "$NETWORK" --fund
else
    echo "  Identity exists. Ensuring it's funded..."
    stellar --quiet keys fund "$IDENTITY" --network "$NETWORK" || true
fi

# 2. Build the contract
echo ""
echo "[2/5] Building contract..."
stellar contract build
WASM_PATH="target/wasm32v1-none/release/migo_escrow.wasm"
if [ ! -f "$WASM_PATH" ]; then
    echo "WASM not found at $WASM_PATH. Build may have failed."
    exit 1
fi
echo "  Built: $WASM_PATH"

# 3. Deploy to testnet
echo ""
echo "[3/5] Deploying to $NETWORK..."
CONTRACT_ID=$(stellar --quiet contract deploy \
    --wasm "$WASM_PATH" \
    --source "$IDENTITY" \
    --network "$NETWORK" 2>&1 | grep -oE 'C[A-Z0-9]{55}' | head -1)

if [ -z "$CONTRACT_ID" ]; then
    echo "Could not extract contract ID from deploy output."
    exit 1
fi
echo "  Contract ID: $CONTRACT_ID"

# 4. Initialize
echo ""
echo "[4/5] Initializing contract (setting XLM SAC as escrow token)..."
stellar --quiet contract invoke \
    --id "$CONTRACT_ID" \
    --source "$IDENTITY" \
    --network "$NETWORK" \
    -- \
    init \
    --token "$XLM_SAC"
echo "  Contract initialized."

# 5. Write contract ID into .env.local
echo ""
echo "[5/5] Writing .env.local..."
cat > .env.local << EOF
# MIGO Protect — Stellar testnet config
VITE_CONTRACT_ID=$CONTRACT_ID
VITE_SOROBAN_RPC=https://soroban-testnet.stellar.org
VITE_HORIZON_URL=https://horizon-testnet.stellar.org
VITE_XLM_SAC=$XLM_SAC
EOF
echo "  Written to .env.local"

echo ""
echo "=== Deploy complete! ==="
echo "Contract ID: $CONTRACT_ID"
echo "Restart 'pnpm dev' to pick up the new contract ID."
echo ""
