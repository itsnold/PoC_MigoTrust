import { horizon } from "./sdk";

export interface Balances {
  xlm: string;
  funded: boolean;
}

export async function fetchBalances(publicKey: string): Promise<Balances> {
  try {
    const account = await horizon.loadAccount(publicKey);
    let xlm = "0";
    for (const b of account.balances) {
      if (b.asset_type === "native") {
        xlm = parseFloat(b.balance).toFixed(2);
      }
    }
    return { xlm, funded: true };
  } catch (e: unknown) {
    // 404 = account does not exist yet (not funded).
    const status = (e as { response?: { status?: number } })?.response?.status;
    if (status === 404 || (e as { name?: string })?.name === "NotFoundError") {
      return { xlm: "0", funded: false };
    }
    throw e;
  }
}
