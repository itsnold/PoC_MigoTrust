import * as StellarSdk from "@stellar/stellar-sdk";

export const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;
export const RPC_URL =
  import.meta.env.VITE_SOROBAN_RPC ?? "https://soroban-testnet.stellar.org";
export const HORIZON_URL =
  import.meta.env.VITE_HORIZON_URL ?? "https://horizon-testnet.stellar.org";

// Testnet XLM SAC (Stellar Asset Contract) — the contract locks/releases this token.
export const XLM_SAC_ADDRESS =
  import.meta.env.VITE_XLM_SAC ??
  "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

export const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID ?? "";

// v15 SDK: use the `rpc` namespace (the old `SorobanRpc` namespace is gone).
export const server = new StellarSdk.rpc.Server(RPC_URL);
export const horizon = new StellarSdk.Horizon.Server(HORIZON_URL);

export const EXPLORER_BASE = "https://stellar.expert/explorer/testnet";

/** Build a Stellar Expert link for a transaction hash or address. */
export function expertTxUrl(hash: string): string {
  return `${EXPLORER_BASE}/tx/${hash}`;
}
export function expertAddressUrl(address: string): string {
  return `${EXPLORER_BASE}/address/${address}`;
}

/** Fund a testnet account via Friendbot (~10,000 XLM). */
export async function fundTestnetAccount(publicKey: string): Promise<void> {
  const res = await fetch(
    `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`,
  );
  // 400 usually means "account already funded" — not a real failure for our flow.
  if (!res.ok && res.status !== 400) {
    throw new Error("Friendbot funding failed. Try again in a moment.");
  }
}
