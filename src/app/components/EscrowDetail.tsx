import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Shield,
  ExternalLink,
  Loader2,
  Lock,
  Unlock,
  Clock,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import {
  EscrowDeal,
  getStatusLabel,
  bothConfirmed,
} from "../stellar/escrow";
import {
  readMission,
  buildConfirmXDR,
  buildReleaseXDR,
  buildDisputeXDR,
  xlmToStroops,
  STATUS_FUNDED,
  STATUS_READY,
  STATUS_RELEASED,
  STATUS_DISPUTED,
  type OnChainMission,
} from "../stellar/contract";
import { signAndSubmit } from "../stellar/submit";
import { expertTxUrl } from "../stellar/sdk";

interface Props {
  deal: EscrowDeal;
  connectedAddress: string | null;
  onBack: () => void;
  onUpdate: (deal: EscrowDeal) => void;
}

type Role = "client" | "provider" | "none";

function truncate(str: string, front = 8, back = 6): string {
  return str.length > front + back + 3 ? str.slice(0, front) + "..." + str.slice(-back) : str;
}

export function EscrowDetail({ deal, connectedAddress, onBack, onUpdate }: Props) {
  const [onChain, setOnChain] = useState<OnChainMission | null>(null);
  const [reading, setReading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [showTiers, setShowTiers] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const role: Role = connectedAddress
    ? connectedAddress === deal.clientPublicKey
      ? "client"
      : connectedAddress === deal.providerPublicKey
      ? "provider"
      : "none"
    : "none";

  const isTerminal = ["released", "refunded", "disputed"].includes(deal.status);

  const refreshOnChain = useCallback(async () => {
    let missionId = deal.missionId;
    if (missionId === null) {
      const expectedAmount = xlmToStroops(deal.amountXLM);
      for (let id = 1; id <= 25; id++) {
        try {
          const candidate = await readMission(id);
          if (
            candidate.client === deal.clientPublicKey &&
            candidate.provider === deal.providerPublicKey &&
            candidate.amountStroops === expectedAmount
          ) {
            missionId = id;
            onUpdate({ ...deal, missionId: id, updatedAt: new Date().toISOString() });
            break;
          }
        } catch {
          // Continue scanning; mission ids may be sparse after failed attempts.
        }
      }
    }
    if (missionId === null) return;
    setReading(true);
    setError("");
    try {
      const mission = await readMission(missionId);
      setOnChain(mission);
      const newStatus = mapOnChainStatus(mission.status);
      if (newStatus !== deal.status) {
        onUpdate({ ...deal, status: newStatus, updatedAt: new Date().toISOString() });
      }
    } catch (e: unknown) {
      // Contract might not have this mission yet — silently ignore
    } finally {
      setReading(false);
    }
  }, [deal, onUpdate]);

  useEffect(() => {
    refreshOnChain();
  }, [refreshOnChain]);

  async function handleConfirm() {
    if (!connectedAddress || role === "none") return;
    if (deal.missionId === null) {
      setError("This local mission was created before mission ids were saved. Delete it and create a new escrow mission.");
      return;
    }
    setConfirming(true);
    setError("");
    setSuccessMsg("");
    try {
      const xdr = await buildConfirmXDR(connectedAddress, deal.missionId);
      const txHash = await signAndSubmit(xdr, connectedAddress);
      setSuccessMsg("Confirmation recorded on-chain!");
      onUpdate({ ...deal, confirmTxHash: txHash, updatedAt: new Date().toISOString() });
      await refreshOnChain();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Confirmation failed");
    } finally {
      setConfirming(false);
    }
  }

  async function handleRelease() {
    if (!connectedAddress) return;
    if (deal.missionId === null) {
      setError("This local mission was created before mission ids were saved. Delete it and create a new escrow mission.");
      return;
    }
    setReleasing(true);
    setError("");
    setSuccessMsg("");
    try {
      const xdr = await buildReleaseXDR(connectedAddress, deal.missionId);
      const txHash = await signAndSubmit(xdr, connectedAddress);
      setSuccessMsg("Funds released to contractor on-chain!");
      onUpdate({
        ...deal,
        status: "released",
        releaseTxHash: txHash,
        updatedAt: new Date().toISOString(),
      });
      await refreshOnChain();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Release failed");
    } finally {
      setReleasing(false);
    }
  }

  async function handleDispute() {
    if (!connectedAddress || role === "none") return;
    if (deal.missionId === null) {
      setError("This local mission was created before mission ids were saved. Delete it and create a new escrow mission.");
      return;
    }
    setDisputing(true);
    setError("");
    setSuccessMsg("");
    try {
      const xdr = await buildDisputeXDR(connectedAddress, deal.missionId);
      const txHash = await signAndSubmit(xdr, connectedAddress);
      setSuccessMsg("Dispute raised on-chain. Funds are frozen.");
      onUpdate({
        ...deal,
        status: "disputed",
        disputeTxHash: txHash,
        updatedAt: new Date().toISOString(),
      });
      await refreshOnChain();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Dispute failed");
    } finally {
      setDisputing(false);
    }
  }

  // Derive display state from on-chain data if available
  const clientConfirmed = onChain?.clientConfirmed ?? deal.conditions.every((c) => c.clientMet);
  const providerConfirmed = onChain?.providerConfirmed ?? deal.conditions.every((c) => c.providerMet);
  const allMet = clientConfirmed && providerConfirmed;
  const isReleased = onChain?.status === STATUS_RELEASED || deal.status === "released";
  const isDisputed = onChain?.status === STATUS_DISPUTED || deal.status === "disputed";
  const isFrozen = isReleased || isDisputed;

  const met = (clientConfirmed ? 1 : 0) + (providerConfirmed ? 1 : 0);
  const total = 2;
  const progressPercent = (met / total) * 100;

  return (
    <>
      {/* Header */}
      <header className="px-5 py-4 flex items-center justify-between z-10 relative">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center text-white"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-white font-semibold truncate max-w-[200px] text-sm">{deal.title || "Mission Escrow"}</span>
        <button className="w-9 h-9 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center text-[#7AE2CF]">
          <Shield className="w-4 h-4" />
        </button>
      </header>

      <div className="px-5 pt-2 pb-5 relative z-10">
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.18)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#7AE2CF] font-bold">Escrow Status</div>
              <div className="text-white font-bold text-lg mt-1">{getStatusLabel(deal.status)}</div>
              <div className="text-white/50 text-xs mt-1">{met} of {total} confirmations recorded</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/45 font-bold">Amount</div>
              <div className="text-white font-bold text-xl mt-1">{deal.amountXLM.toLocaleString()} <span className="text-xs text-white/55">XLM</span></div>
            </div>
          </div>
          <div className="mt-4 h-2 bg-black/18 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${progressPercent}%`, background: isDisputed ? "#D85A30" : "#7AE2CF" }} />
          </div>
        </div>
      </div>

      {/* Scrollable Properties */}
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-6 bg-[#F7F5EF] rounded-t-[28px] shadow-[0_-18px_45px_rgba(6,32,43,0.16)]">
        {reading && (
          <div className="flex items-center justify-center gap-2 text-xs text-[#51646A] mb-3">
            <Loader2 className="w-3 h-3 animate-spin" /> Reading on-chain state...
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2 text-xs text-red-700 mb-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="break-all">{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-2 text-xs text-emerald-700 mb-3">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Account info */}
        <div className="space-y-3 mb-4">
          {[
            { icon: <Shield className="w-4 h-4 text-[#077A7D]" />, label: "Escrow Contract", value: deal.missionId !== null ? `Mission #${deal.missionId}` : "Pending" },
            { icon: <div className="w-4 h-4 rounded-full bg-[#E6F8F5] flex items-center justify-center text-[8px] text-[#077A7D]">C</div>, label: "Client", value: truncate(deal.clientPublicKey) },
            { icon: <div className="w-4 h-4 rounded-full bg-[#E8F7F3] flex items-center justify-center text-[8px] text-[#077A7D]">P</div>, label: "Contractor", value: truncate(deal.providerPublicKey) },
            { icon: isDisputed ? <AlertTriangle className="w-4 h-4 text-[#D85A30]" /> : <Clock className="w-4 h-4 text-[#077A7D]" />, label: "Status", value: getStatusLabel(deal.status) },
          ].map((item, idx) => (
            <div key={idx} className="flex items-center justify-between py-1 border-b border-[#DED8CC] pb-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center border border-[#E2DDD2]">
                  {item.icon}
                </div>
                <span className="text-sm text-[#51646A]">{item.label}</span>
              </div>
              <span className="text-sm font-bold text-[#06202B] font-mono">{item.value}</span>
            </div>
          ))}
        </div>

        {/* Tx hashes */}
        {deal.txHash && (
          <TxRow label="OPEN TX" hash={deal.txHash} network="testnet" />
        )}
        {deal.confirmTxHash && (
          <TxRow label="CONFIRM TX" hash={deal.confirmTxHash} network="testnet" />
        )}
        {deal.releaseTxHash && (
          <TxRow label="RELEASE TX" hash={deal.releaseTxHash} network="testnet" />
        )}
        {deal.disputeTxHash && (
          <TxRow label="DISPUTE TX" hash={deal.disputeTxHash} network="testnet" />
        )}

        {/* Terms */}
        <div className="mt-4">
          <button
            onClick={() => setShowTiers(!showTiers)}
            className="w-full rounded-2xl bg-white border border-[#DED8CC] px-4 py-3 text-left flex items-center justify-between shadow-[0_8px_24px_rgba(6,32,43,0.05)]"
          >
            <span>
                    <span className="block text-[10px] uppercase tracking-[0.18em] text-[#077A7D] font-extrabold">Mission terms</span>
              <span className="block text-xs text-[#06202B] mt-0.5">{deal.conditions.length} milestone(s), hashed on-chain</span>
            </span>
            <span className="text-[#077A7D] text-lg">{showTiers ? "−" : "›"}</span>
          </button>
        </div>

        {showTiers && (
          <div className="mt-4 space-y-3">
            <h3 className="text-sm font-bold text-[#06202B]">Terms checklist</h3>
            {deal.conditions.map((cond, i) => (
              <div
                key={cond.id}
                className="w-full text-left bg-white border border-[#DED8CC] rounded-2xl p-4 shadow-[0_8px_24px_rgba(6,32,43,0.04)]"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 w-7 h-7 rounded-full border border-[#B9CFC5] text-[#51646A] flex items-center justify-center shrink-0 font-mono text-[11px]">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-[#51646A] font-bold">Milestone {i + 1}</span>
                    <div className="text-sm leading-5 text-[#06202B] mt-1">{cond.description}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Confirmation status */}
        <div className="mt-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <PartyStatus label="Client" met={clientConfirmed} isYou={role === "client"} />
            <PartyStatus label="Contractor" met={providerConfirmed} isYou={role === "provider"} />
          </div>

          {/* Action buttons */}
          {!isFrozen && (
            <div className="mt-4 space-y-3">
              {role === "none" && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 text-center">
                  Connect the {deal.status === "funded" ? "client or contractor" : "contractor"} wallet to interact with this escrow.
                </div>
              )}

              {role !== "none" && !allMet && (
                <button
                  onClick={handleConfirm}
                  disabled={confirming || (role === "client" && clientConfirmed) || (role === "provider" && providerConfirmed)}
                  className="w-full bg-[#06202B] text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-[#103642] transition-all shadow-[0_12px_28px_rgba(6,32,43,0.16)] disabled:opacity-50"
                >
                  {confirming ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  {confirming ? "Signing..." : (role === "client" && clientConfirmed) || (role === "provider" && providerConfirmed) ? "Confirmed" : `Confirm as ${role}`}
                </button>
              )}

              {allMet && !isReleased && (
                <button
                  onClick={handleRelease}
                  disabled={releasing}
                  className="w-full bg-[#06202B] text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-[#103642] transition-all shadow-[0_12px_28px_rgba(6,32,43,0.16)]"
                >
                  {releasing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Unlock className="w-5 h-5" />}
                  {releasing ? "Releasing..." : "Release Funds"}
                </button>
              )}

              {!allMet && !isDisputed && (
                <button
                  onClick={handleDispute}
                  disabled={disputing || role === "none"}
                  className="w-full border border-[#D85A30]/30 text-[#D85A30] py-3 rounded-xl text-sm font-semibold hover:bg-[#D85A30]/10 transition-colors disabled:opacity-50"
                >
                  {disputing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Raise Dispute"}
                </button>
              )}
            </div>
          )}

          {isReleased && (
            <div className="bg-[#EBFBF8] border border-[#A7E9DD] rounded-xl p-3 flex items-center gap-3 shadow-sm">
              <div className="w-8 h-8 rounded-lg bg-[#077A7D]/10 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4.5 h-4.5 text-[#077A7D]" />
              </div>
              <div className="text-xs font-bold text-[#077A7D] leading-snug">
                Funds released to contractor on-chain.
              </div>
            </div>
          )}

          {isDisputed && (
            <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 flex items-center gap-3 shadow-sm">
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4.5 h-4.5 text-rose-600" />
              </div>
              <div className="text-xs font-bold text-rose-800 leading-snug">
                Funds frozen — dispute raised on-chain.
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function mapOnChainStatus(status: number): EscrowDeal["status"] {
  switch (status) {
    case STATUS_READY: return "client_confirmed";
    case STATUS_RELEASED: return "released";
    case STATUS_DISPUTED: return "disputed";
    default: return "funded";
  }
}

function PartyStatus({ label, met, isYou }: { label: string; met: boolean; isYou: boolean }) {
  return (
    <div className={`rounded-xl border p-3.5 shadow-sm transition-all ${met ? "border-[#A7E9DD] bg-[#EBFBF8]" : "border-[#DED8CC] bg-white"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-bold ${met ? "text-[#077A7D]" : "text-[#51646A]"}`}>
          {label}{isYou && " (you)"}
        </span>
        {met ? (
          <CheckCircle2 className="w-4 h-4 text-[#077A7D] shrink-0" />
        ) : (
          <div className="w-3.5 h-3.5 rounded-full border border-[#B9CFC5] shrink-0" />
        )}
      </div>
      <div className={`text-[10px] mt-2 font-semibold ${met ? "text-[#077A7D]/85" : "text-[#51646A]/75"}`}>
        {met ? "Confirmed on-chain" : "Pending confirmation"}
      </div>
    </div>
  );
}

function TxRow({ label, hash, network }: { label: string; hash: string; network: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-[#DED8CC]">
      <span className="text-[10px] text-[#51646A] tracking-widest font-bold">{label}</span>
      <a
        href={expertTxUrl(hash)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
      >
        <span className="font-mono">{hash.slice(0, 12)}...{hash.slice(-8)}</span>
        <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}
