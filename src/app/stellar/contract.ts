import * as StellarSdk from "@stellar/stellar-sdk";
import {
  server,
  NETWORK_PASSPHRASE,
  CONTRACT_ID,
  XLM_SAC_ADDRESS,
} from "./sdk";

// A real, funded testnet account used ONLY as the source for read-only
// simulations. Nothing is signed or submitted for reads, so any existing
// funded testnet account works — we reuse the Circle USDC issuer.
const READ_SOURCE = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

export function contractConfigured(): boolean {
  return Boolean(CONTRACT_ID);
}

/** Convert XLM (human-readable) to stroops (i128). 1 XLM = 10^7 stroops. */
export function xlmToStroops(xlm: number): bigint {
  return BigInt(Math.round(xlm * 10_000_000));
}

/** Convert stroops back to XLM (human-readable). */
export function stroopsToXlm(stroops: bigint | number): number {
  return Number(BigInt(stroops)) / 10_000_000;
}

/** Hash mission terms (title + description + conditions) via SHA-256 → 32 bytes. */
export async function hashTerms(
  title: string,
  description: string,
  conditions: string[],
): Promise<Uint8Array> {
  const text = JSON.stringify({ title, description, conditions });
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hashBuffer);
}

export interface OnChainMission {
  id: number;
  client: string;
  provider: string;
  amountStroops: bigint;
  clientConfirmed: boolean;
  providerConfirmed: boolean;
  status: number; // 0=Funded, 1=Ready, 2=Released, 3=Disputed
  createdAt: number;
}

export const STATUS_FUNDED = 0;
export const STATUS_READY = 1;
export const STATUS_RELEASED = 2;
export const STATUS_DISPUTED = 3;

/** Read get_mission(id) via simulation — no wallet or signature required. */
export async function readMission(id: number): Promise<OnChainMission> {
  const contract = new StellarSdk.Contract(CONTRACT_ID);
  const source = new StellarSdk.Account(READ_SOURCE, "0");

  const tx = new StellarSdk.TransactionBuilder(source, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call("get_mission", StellarSdk.nativeToScVal(BigInt(id), { type: "u64" })),
    )
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (!StellarSdk.rpc.Api.isSimulationSuccess(sim) || !sim.result) {
    throw new Error("Could not read mission. Is the contract deployed and the id valid?");
  }

  const raw = StellarSdk.scValToNative(sim.result.retval) as {
    id: bigint;
    client: string;
    provider: string;
    amount: bigint;
    terms_hash: Uint8Array;
    client_confirmed: boolean;
    provider_confirmed: boolean;
    status: number;
    created_at: bigint;
  };

  return {
    id: Number(raw.id),
    client: raw.client,
    provider: raw.provider,
    amountStroops: raw.amount,
    clientConfirmed: raw.client_confirmed,
    providerConfirmed: raw.provider_confirmed,
    status: raw.status,
    createdAt: Number(raw.created_at),
  };
}

/** Build + simulate + assemble an `open` invocation. Returns XDR + predicted mission id. */
export async function buildOpenXDR(
  client: string,
  provider: string,
  amountXlm: number,
  termsHash: Uint8Array,
): Promise<{ xdr: string; missionId: number }> {
  const contract = new StellarSdk.Contract(CONTRACT_ID);
  const account = await server.getAccount(client);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        "open",
        StellarSdk.Address.fromString(client).toScVal(),
        StellarSdk.Address.fromString(provider).toScVal(),
        StellarSdk.nativeToScVal(xlmToStroops(amountXlm), { type: "i128" }),
        StellarSdk.nativeToScVal(termsHash, { type: "bytes" }),
      ),
    )
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (!StellarSdk.rpc.Api.isSimulationSuccess(sim)) {
    throw new Error("Simulation failed — the open call would not succeed.");
  }

  if (!sim.result) {
    throw new Error("Simulation did not return a mission id.");
  }

  const missionId = StellarSdk.scValToNative(sim.result.retval);
  if (typeof missionId !== "bigint") {
    throw new Error("Simulation returned an invalid mission id.");
  }

  return {
    xdr: StellarSdk.rpc.assembleTransaction(tx, sim).build().toXDR(),
    missionId: Number(missionId),
  };
}

/** Build + simulate + assemble a `confirm` invocation. */
export async function buildConfirmXDR(
  signer: string,
  missionId: number,
): Promise<string> {
  const contract = new StellarSdk.Contract(CONTRACT_ID);
  const account = await server.getAccount(signer);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        "confirm",
        StellarSdk.nativeToScVal(BigInt(missionId), { type: "u64" }),
        StellarSdk.Address.fromString(signer).toScVal(),
      ),
    )
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (!StellarSdk.rpc.Api.isSimulationSuccess(sim)) {
    throw new Error("Simulation failed — the confirm call would not succeed.");
  }

  return StellarSdk.rpc.assembleTransaction(tx, sim).build().toXDR();
}

/** Build + simulate + assemble a `release` invocation. */
export async function buildReleaseXDR(
  caller: string,
  missionId: number,
): Promise<string> {
  const contract = new StellarSdk.Contract(CONTRACT_ID);
  const account = await server.getAccount(caller);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        "release",
        StellarSdk.nativeToScVal(BigInt(missionId), { type: "u64" }),
      ),
    )
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (!StellarSdk.rpc.Api.isSimulationSuccess(sim)) {
    throw new Error("Simulation failed — the release call would not succeed.");
  }

  return StellarSdk.rpc.assembleTransaction(tx, sim).build().toXDR();
}

/** Build + simulate + assemble a `dispute` invocation. */
export async function buildDisputeXDR(
  signer: string,
  missionId: number,
): Promise<string> {
  const contract = new StellarSdk.Contract(CONTRACT_ID);
  const account = await server.getAccount(signer);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        "dispute",
        StellarSdk.nativeToScVal(BigInt(missionId), { type: "u64" }),
        StellarSdk.Address.fromString(signer).toScVal(),
      ),
    )
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (!StellarSdk.rpc.Api.isSimulationSuccess(sim)) {
    throw new Error("Simulation failed — the dispute call would not succeed.");
  }

  return StellarSdk.rpc.assembleTransaction(tx, sim).build().toXDR();
}

/** Read the `open` return value (mission id) from a simulation result. */
export function extractMissionIdFromSim(sim: StellarSdk.rpc.Api.SimulateTransactionResponse): number | null {
  if (!StellarSdk.rpc.Api.isSimulationSuccess(sim) || !sim.result) return null;
  const val = StellarSdk.scValToNative(sim.result.retval);
  return typeof val === "bigint" ? Number(val) : null;
}

export { XLM_SAC_ADDRESS };
