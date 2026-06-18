import * as StellarSdk from "@stellar/stellar-sdk";

export type EscrowStatus =
  | "pending_funding"
  | "funded"
  | "provider_confirmed"
  | "client_confirmed"
  | "released"
  | "disputed"
  | "refunded";

export interface EscrowCondition {
  id: string;
  description: string;
  providerMet: boolean;
  clientMet: boolean;
}

export interface EscrowDeal {
  id: string;
  missionId: number | null;
  title: string;
  description: string;
  amountXLM: number;
  clientPublicKey: string;
  providerPublicKey: string;
  conditions: EscrowCondition[];
  status: EscrowStatus;
  createdAt: string;
  updatedAt: string;
  txHash?: string;
  releaseTxHash?: string;
  confirmTxHash?: string;
  disputeTxHash?: string;
  network: "testnet";
}

// Validate a Stellar public key
export function isValidPublicKey(key: string): boolean {
  try {
    StellarSdk.StrKey.decodeEd25519PublicKey(key);
    return true;
  } catch {
    return false;
  }
}

export function getStatusLabel(status: EscrowStatus): string {
  const labels: Record<EscrowStatus, string> = {
    pending_funding: "Pending Funding",
    funded: "Funded",
    provider_confirmed: "Contractor Confirmed",
    client_confirmed: "Client Confirmed",
    released: "Released",
    disputed: "Disputed",
    refunded: "Refunded",
  };
  return labels[status];
}

export function getStatusColor(status: EscrowStatus): string {
  const colors: Record<EscrowStatus, string> = {
    pending_funding: "text-yellow-400 bg-yellow-400/10",
    funded: "text-blue-400 bg-blue-400/10",
    provider_confirmed: "text-purple-400 bg-purple-400/10",
    client_confirmed: "text-purple-400 bg-purple-400/10",
    released: "text-emerald-400 bg-emerald-400/10",
    disputed: "text-red-400 bg-red-400/10",
    refunded: "text-orange-400 bg-orange-400/10",
  };
  return colors[status];
}

export function bothConfirmed(deal: EscrowDeal): boolean {
  return deal.conditions.every((c) => c.providerMet && c.clientMet);
}

const STORAGE_KEY = "migo_escrow_deals";

export function loadDeals(): EscrowDeal[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveDeals(deals: EscrowDeal[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(deals));
}
