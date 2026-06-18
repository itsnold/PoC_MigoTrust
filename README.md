# MIGO Protect

Trust-based escrow for local-service missions on Stellar testnet.

## Problem

In the Philippines, millions of people hire local help every day — errands,
repairs, cleaning, tutoring, delivery — through informal arrangements with no
payment protection. A client pays upfront and risks the contractor ghosting; or
the contractor delivers first and risks the client refusing to pay. There is no
trusted intermediary for small jobs (₱300–₱2,500) because traditional escrow is
too expensive and slow.

MIGO Protect solves this by locking testnet XLM in a Soroban smart contract
until both the client and the contractor confirm the work is done. The escrow
terms (milestones, amounts, parties) are hashed and recorded on-chain, giving
both parties a verifiable, tamper-proof record without any middleman.

## How It Works

1. **Connect wallet** — the client connects Freighter on Stellar Test Net.
2. **Fund via Friendbot** — if the account has no XLM, one click funds it.
3. **Post a mission** — the client enters a title, description, XLM amount,
   the contractor's Stellar address, and release milestones (terms).
4. **Sign & lock** — the client signs a Soroban transaction that:
   - Hashes the mission terms (SHA-256) and stores the hash on-chain.
   - Transfers the XLM from the client into the escrow contract.
5. **Both confirm** — the contractor switches to their Freighter account and
   signs a `confirm` transaction. The client does the same.
6. **Release** — once both parties have confirmed, anyone can call `release`
   and the contract pays the XLM to the contractor.
7. **Dispute** — either party can raise a dispute at any time, freezing the
   funds (no on-chain adjudication in the MVP).

Every step produces a real testnet transaction hash with a Stellar Expert link.

## How It Uses Stellar

Stellar is **core** to MIGO Protect — the product cannot function without it:

- **Freighter wallet** — user authentication and transaction signing via the
  browser extension (SEP-30 style, Freighter v6 API).
- **Soroban smart contract** — the escrow logic (open, confirm, release,
  dispute) runs entirely on-chain. The contract stores mission state, enforces
  two-party signoff, and self-authorizes the fund release.
- **Stellar Asset Contract (SAC)** — the escrow locks native XLM via the testnet
  XLM SAC (`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`). The
  contract calls `token.transfer()` to pull funds in on `open` and push funds
  out on `release`.
- **`require_auth()`** — the contract uses Soroban's built-in authorization to
  enforce that only the client can open, only the parties can confirm/dispute,
  and the contract itself authorizes the release transfer.
- **Friendbot** — testnet account funding for demo purposes.
- **Horizon** — balance reads (XLM balance display).
- **Soroban RPC** — transaction simulation, submission, and finality polling.

Why Stellar and not something else: Soroban's synchronous execution model and
built-in authorization make two-party escrow simple and secure. Sub-cent
transaction fees make small-job escrow economically viable. The SAC bridge lets
the contract handle native XLM without a separate token contract.

## Track

Track 2 — Financial Inclusion & Everyday Payments

## Tech Stack

- **Framework:** React 18 + Vite 6 + TypeScript + Tailwind CSS v4
- **Stellar SDK:** @stellar/stellar-sdk v15 (rpc namespace)
- **Wallet:** @stellar/freighter-api v6
- **Smart Contract:** Soroban (Rust, soroban-sdk v22)
- **Network:** Stellar testnet

## Setup & Run

### Prerequisites

- **Node.js 20+** and **pnpm**
- **Freighter** browser extension — create a wallet, switch to **Test Net**
- **Rust** + **Stellar CLI** (only needed to deploy the contract):
  ```powershell
  winget install --id Rustlang.Rustup -e --accept-source-agreements --accept-package-agreements
  winget install --id Stellar.StellarCLI -e --accept-source-agreements --accept-package-agreements
  rustup target add wasm32v1-none
  ```

### 1. Deploy the contract (one-time)

```bash
# from the repo root
.\scripts\deploy.ps1          # Windows
# or: ./scripts/deploy.sh     # macOS/Linux
```

This creates+funds a testnet identity, builds the Rust contract, deploys it,
calls `init` with the testnet XLM SAC address, and writes `VITE_CONTRACT_ID`
into `.env.local`.

### 2. Run the frontend

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173, then:

1. **Connect Freighter** (make sure it's on Test Net).
2. **Fund with Friendbot** if your balance is 0.
3. **Post a Mission** — enter a title, XLM amount, contractor address, terms.
4. **Sign & Lock** — approve the transaction in Freighter.
5. **Switch to the contractor's Freighter account** and confirm.
6. **Switch back to client** and confirm.
7. **Release** — click release to pay the contractor on-chain.
8. Click any tx hash to view it on **Stellar Expert**.

### Contract unit tests

```bash
cargo test
```

## Network Details

- **Network:** testnet
- **Soroban RPC:** `https://soroban-testnet.stellar.org`
- **Horizon:** `https://horizon-testnet.stellar.org`
- **Friendbot:** `https://friendbot.stellar.org`
- **Network passphrase:** `Test SDF Network ; September 2015`
- **XLM SAC (testnet):** `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`
- **Contract ID:** set by `deploy.ps1` → check `.env.local` after deploy
- **Explorer:** `https://stellar.expert/explorer/testnet`

## Contract Functions

| Function | Purpose |
|---|---|
| `init(token)` | Set the escrow token (testnet XLM SAC). Once only. |
| `open(client, provider, amount, terms_hash) → u64` | Lock XLM from client into contract; returns mission id. |
| `confirm(id, by)` | A party confirms the mission is complete. |
| `release(id)` | Pays the contractor once both confirmed. Anyone can call. |
| `dispute(id, by)` | Freezes funds. Either party can call. |
| `get_mission(id) → Mission` | Read-only: fetch mission state. |

## Project Structure

```
.
├── contracts/migo-escrow/    # Rust Soroban escrow contract
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs            # contract logic
│       └── test.rs           # unit tests (9 tests, all passing)
├── scripts/
│   ├── deploy.ps1            # Windows deploy script
│   └── deploy.sh             # macOS/Linux deploy script
├── src/app/
│   ├── App.tsx               # root component + wallet bar
│   ├── stellar/
│   │   ├── sdk.ts            # RPC/Horizon config, Friendbot, Expert links
│   │   ├── wallet.ts         # useFreighter hook
│   │   ├── balances.ts       # Horizon balance reads
│   │   ├── contract.ts       # Soroban contract calls (build/simulate/assemble)
│   │   ├── submit.ts         # sign + submit + poll to finality
│   │   └── escrow.ts         # UI data model + localStorage metadata
│   └── components/
│       ├── WalletBar.tsx     # connect/fund/balance bar
│       ├── EscrowDashboard.tsx
│       ├── CreateEscrow.tsx
│       └── EscrowDetail.tsx
├── Cargo.toml                # Rust workspace
├── package.json              # Vite + React + Stellar SDK
└── .env.example              # copy to .env.local
```

## Team

- Bag-ao, Shekainah — @sbcxty
- Castro, AJ Krystle — @cajkrystle
- Enerio, Makin Luis — @mduenolowes
- Pungyan, Joseph James — @itspongs
- Ramos, Shane Rose — @shanerosearamos
- Segundo, Reynold Angelo — @itsnold
- Tangaro, Klent Carzwend — @yan2xme

## License

MIT
