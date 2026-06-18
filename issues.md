# Issue Title

Team #[number] - MIGO Protect

# Issue Body

## Project Name
**MIGO Protect**

## Description
**MIGO Protect is a Stellar-powered escrow product for local-service missions.** It lets a client lock XLM in a Soroban smart contract and releases payment only after both the client and contractor confirm that the work is complete.

> **Context - what is MIGO?**
> MIGO is a concept for a local-services marketplace where users can post and accept everyday missions - errands, repairs, cleaning, tutoring, delivery, and similar small jobs common in the Philippines. The full MIGO vision includes finding workers, messaging, profiles, and ratings. **MIGO Protect** is the payment-protection layer: it ensures that money is safely escrowed before work starts and only released when both sides are satisfied. We built this piece first because it is where Stellar adds the most concrete value - trustless custody, two-party authorization, and on-chain settlement. MIGO Protect works as a complete standalone product today and is designed to plug into the full MIGO experience as it grows.

## Track
**Track 2 - Financial Inclusion & Everyday Payments**

## Problem It Solves
Local service work in the Philippines often happens informally: errands, cleaning, repairs, tutoring, delivery, and other small jobs are commonly arranged through chat or word of mouth. This creates a trust gap:

- Clients can pay upfront and risk being ghosted.
- Contractors can complete work and risk not getting paid.
- Traditional escrow is too slow, expensive, or inaccessible for small everyday jobs.

MIGO Protect solves this by adding lightweight, on-chain payment protection to small local-service missions. The client locks funds before work starts, both parties confirm completion, and the contractor gets paid through the contract.

## How Is It Using Stellar?
Stellar is core to the product, not an add-on. The app depends on Stellar for custody, authorization, settlement, and verifiable transaction history.

**Stellar components used:**

- **Soroban smart contract:** Stores mission state and enforces the escrow flow: `open`, `confirm`, `release`, `dispute`, and `get_mission`.
- **Native XLM via Stellar Asset Contract:** The escrow contract locks and releases native XLM through the testnet XLM SAC.
- **Freighter wallet:** Used for wallet connection, user identity, and transaction signing.
- **Soroban RPC:** Used for transaction simulation, assembly, submission, and finality polling.
- **Horizon:** Used to read wallet XLM balances.
- **Friendbot:** Used to fund testnet accounts for demo/testing.
- **Stellar Expert:** Used for transaction verification links.

**On-chain behavior:**

- The client signs an `open` transaction that locks XLM in escrow.
- Mission terms are hashed with SHA-256 and recorded on-chain.
- Client and contractor each sign a `confirm` transaction.
- Funds can only be released after both parties confirm.
- Either party can raise a dispute, which freezes funds in the MVP.

## Relationship to the MIGO Concept
MIGO Protect is not a fragment of a larger app - it is a complete, working product on its own. It handles the full escrow lifecycle: create, fund, confirm, release, and dispute.

It is also the first module of the broader MIGO local-services vision. The full MIGO concept covers posting missions, finding contractors, messaging, and reputation. MIGO Protect is the trust and settlement rail underneath all of that - the part where on-chain escrow genuinely matters and where Stellar provides unique value that a traditional database cannot.

We scoped this hackathon submission to MIGO Protect specifically because it is the strongest Stellar-native piece: custody, two-party authorization, hashed terms, and final settlement all happen on-chain.

## GitHub Repository
https://github.com/itsnold/PoC_MigoTrust

## Network & Deployment
- **Network:** Stellar testnet
- **Live app URL:** Runs locally - see README
- **MIGO Protect escrow contract:** `CBXOZIHVLSSF44YENTINIJZNL64X7U4GONYCSYZFBTVMRGYEES6LD7FV`
- **Native XLM SAC testnet contract:** `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`
- **Soroban RPC:** `https://soroban-testnet.stellar.org`
- **Horizon:** `https://horizon-testnet.stellar.org`
- **Explorer:** `https://stellar.expert/explorer/testnet`

## Demo Flow
1. Connect Freighter on Stellar testnet.
2. Fund the account through Friendbot if needed.
3. Post a mission with title, amount, contractor address, and release milestones.
4. Sign the Soroban transaction to lock XLM in escrow.
5. Switch to the contractor wallet and confirm completion.
6. Switch back to the client wallet and confirm completion.
7. Release funds to the contractor.
8. View transaction hashes on Stellar Expert.

## Team
- Bag-ao, Shekainah - @sbcxty
- Castro, AJ Krystle - @cajkrystle
- Enerio, Makin Luis - @mduenolowes
- Pungyan, Joseph James - @itspongs
- Ramos, Shane Rose - @shanerosearamos
- Segundo, Reynold Angelo - @itsnold
- Tangaro, Klent Carzwend - @yan2xme

## Novelty Note
MIGO Protect is not a generic wallet or payment demo. It applies Stellar to a specific everyday trust problem: small local-service jobs where both sides need protection but traditional escrow is impractical.

The project is intentionally scoped around the strongest Stellar-native part of the idea: escrow custody, two-party authorization, on-chain state, and final settlement.

## Anything Else
The MVP supports the complete core flow: connect wallet, fund with Friendbot, post a mission, sign and lock XLM, contractor confirmation, client confirmation, release, dispute, and Stellar Expert transaction links.

Known limitation: disputes freeze funds, but on-chain adjudication is not included in the MVP. Future versions could add mediator roles, reputation data, milestone-based partial releases, or integration directly into the full MIGO marketplace app.
