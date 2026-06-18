import * as StellarSdk from "@stellar/stellar-sdk";
import { server, NETWORK_PASSPHRASE } from "./sdk";

/** Submit a Freighter-signed XDR. Returns the transaction hash. */
export async function submitSignedXDR(signedXdr: string): Promise<string> {
  const tx = StellarSdk.TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const res = await server.sendTransaction(tx as StellarSdk.Transaction);
  if (res.status === "ERROR") {
    throw new Error(`Submit rejected: ${JSON.stringify(res.errorResult ?? res)}`);
  }
  return res.hash;
}

/**
 * Poll until the transaction reaches finality.
 * `sendTransaction` returning PENDING is NOT success — you must poll.
 */
export async function pollTransaction(hash: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const res = await server.getTransaction(hash);
    if (res.status !== "NOT_FOUND") {
      if (res.status === "SUCCESS") return;
      throw new Error(`Transaction ${res.status}`);
    }
  }
  throw new Error("Transaction timed out after 60s");
}

/**
 * Sign an unsigned XDR with Freighter, submit it, and poll to finality.
 * Returns the transaction hash.
 */
export async function signAndSubmit(
  xdr: string,
  address: string,
): Promise<string> {
  const freighter = await import("@stellar/freighter-api");
  const signed = await freighter.signTransaction(xdr, {
    networkPassphrase: NETWORK_PASSPHRASE,
    address,
  });
  if (signed.error) {
    throw new Error(
      typeof signed.error === "string" ? signed.error : "Signing was rejected",
    );
  }
  const hash = await submitSignedXDR(signed.signedTxXdr);
  await pollTransaction(hash);
  return hash;
}
