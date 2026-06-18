import { useState } from "react";
import { ArrowLeft, Plus, Trash2, Shield, Loader2, CheckCircle2, ExternalLink, AlertCircle } from "lucide-react";
import {
  EscrowDeal,
  EscrowCondition,
  isValidPublicKey,
} from "../stellar/escrow";
import { hashTerms, buildOpenXDR, contractConfigured } from "../stellar/contract";
import { signAndSubmit } from "../stellar/submit";
import { expertTxUrl } from "../stellar/sdk";

interface Props {
  clientAddress: string | null;
  onBack: () => void;
  onCreated: (deal: EscrowDeal) => void;
}

interface FormState {
  title: string;
  description: string;
  amountXLM: string;
  providerPublicKey: string;
  conditions: { id: string; description: string }[];
}

type Step = "form" | "review" | "funding" | "done" | "error";

export function CreateEscrow({ clientAddress, onBack, onCreated }: Props) {
  const [step, setStep] = useState<Step>("form");
  const [form, setForm] = useState<FormState>({
    title: "",
    description: "",
    amountXLM: "",
    providerPublicKey: "",
    conditions: [{ id: "c1", description: "" }],
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [createdDeal, setCreatedDeal] = useState<EscrowDeal | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  function addCondition() {
    setForm((f) => ({
      ...f,
      conditions: [...f.conditions, { id: `c${Date.now()}`, description: "" }],
    }));
  }

  function removeCondition(id: string) {
    setForm((f) => ({ ...f, conditions: f.conditions.filter((c) => c.id !== id) }));
  }

  function updateCondition(id: string, description: string) {
    setForm((f) => ({
      ...f,
      conditions: f.conditions.map((c) => (c.id === id ? { ...c, description } : c)),
    }));
  }

  function validate(): boolean {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.title.trim()) e.title = "Title is required";
    if (!form.amountXLM || isNaN(Number(form.amountXLM)) || Number(form.amountXLM) <= 0)
      e.amountXLM = "Enter a valid XLM amount";
    if (!clientAddress) e.title = "Connect your Freighter wallet first" as any;
    if (!isValidPublicKey(form.providerPublicKey)) e.providerPublicKey = "Invalid Stellar public key";
    if (form.conditions.some((c) => !c.description.trim()))
      e.conditions = "Each milestone needs one clear, verifiable release term" as any;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleReview() {
    if (!contractConfigured()) {
      setErrorMsg("Contract not deployed. Run scripts/deploy.ps1 and set VITE_CONTRACT_ID.");
      setStep("error");
      return;
    }
    if (validate()) setStep("review");
  }

  async function handleFund() {
    if (!clientAddress) return;
    setStep("funding");
    setErrorMsg("");

    try {
      const conditionsText = form.conditions.map((c) => c.description);
      const termsHash = await hashTerms(form.title, form.description, conditionsText);

      const { xdr, missionId } = await buildOpenXDR(
        clientAddress,
        form.providerPublicKey,
        Number(form.amountXLM),
        termsHash,
      );

      const txHash = await signAndSubmit(xdr, clientAddress);

      const now = new Date().toISOString();
      const deal: EscrowDeal = {
        id: `esc-${Date.now().toString(36).toUpperCase()}`,
        missionId,
        title: form.title,
        description: form.description,
        amountXLM: Number(form.amountXLM),
        clientPublicKey: clientAddress,
        providerPublicKey: form.providerPublicKey,
        conditions: form.conditions.map((c) => ({
          id: c.id,
          description: c.description,
          providerMet: false,
          clientMet: false,
        })),
        status: "funded",
        createdAt: now,
        updatedAt: now,
        txHash,
        network: "testnet",
      };
      setCreatedDeal(deal);
      setStep("done");
      onCreated(deal);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to create escrow on-chain");
      setStep("error");
    }
  }

  return (
    <>
      <header className="px-5 py-4 flex items-center justify-between z-10">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center text-white"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <img src="/migo-logo.png" alt="MIGO" className="h-6 w-6 object-contain bg-white rounded-lg p-0.5" />
          <span className="text-white font-semibold text-sm">New Escrow</span>
        </div>
        <div className="w-9" />
      </header>

      <div className="px-5 pb-2">
        <div className="flex items-center gap-2 mb-4 justify-center">
          {(["form", "review", "funding", "done"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  step === s
                    ? "bg-[#7AE2CF] text-[#06202B]"
                    : ["form", "review", "funding", "done"].indexOf(step) > i
                    ? "bg-[#7AE2CF]/20 text-[#7AE2CF]"
                    : "bg-white/5 text-white/40"
                }`}
              >
                {i + 1}
              </div>
              {i < 3 && <div className="w-6 h-px bg-white/10" />}
            </div>
          ))}

        </div>
      </div>

      <div className="flex-1 bg-[#F7F5EF] rounded-t-[28px] px-5 pt-5 pb-20 overflow-y-auto shadow-[0_-18px_45px_rgba(0,0,0,0.16)]">
        {step === "form" && (
          <div className="space-y-6">
            <div>
                <h1 className="text-xl font-bold text-[#06202B] mb-1">Mission Details</h1>
              <p className="text-xs text-[#51646A]">
                Define clear escrow terms. Funds release only after client and contractor both confirm every milestone.
              </p>
            </div>

            {!clientAddress && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2 text-xs text-amber-800">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Connect your Freighter wallet (Test Net) to create an escrow.
              </div>
            )}

            <Field label="MISSION TITLE" error={errors.title}>
              <input
                className="w-full bg-white border border-[#DED8CC] rounded-xl px-4 py-3 text-sm text-[#06202B] focus:outline-none focus:border-[#07A7A0] focus:ring-1 focus:ring-[#07A7A0]/20 transition-all placeholder:text-[#51646A]/70"
                placeholder="e.g. Airport pickup — Manama"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </Field>

            <Field label="DESCRIPTION">
              <textarea
                className="w-full bg-white border border-[#DED8CC] rounded-xl px-4 py-3 text-sm text-[#06202B] focus:outline-none focus:border-[#07A7A0] focus:ring-1 focus:ring-[#07A7A0]/20 transition-all placeholder:text-[#51646A]/70 resize-none h-20"
                placeholder="What errand or service is being escrowed?"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </Field>

            <Field label="ESCROW AMOUNT (XLM)" error={errors.amountXLM}>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className="w-full bg-white border border-[#DED8CC] rounded-xl px-4 py-3 text-sm text-[#06202B] focus:outline-none focus:border-[#07A7A0] focus:ring-1 focus:ring-[#07A7A0]/20 transition-all placeholder:text-[#51646A]/70 pr-16"
                  placeholder="1500"
                  value={form.amountXLM}
                  onChange={(e) => setForm((f) => ({ ...f, amountXLM: e.target.value }))}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#51646A]/70">XLM</span>
              </div>
            </Field>

            <div className="bg-white border border-[#DED8CC] rounded-xl p-3 text-xs text-[#51646A]">
              <span className="font-bold">Client:</span> {clientAddress ? `${clientAddress.slice(0, 8)}...${clientAddress.slice(-4)}` : "Connect wallet first"}
            </div>

            <Field label="CONTRACTOR STELLAR ADDRESS" error={errors.providerPublicKey}>
              <input
                className="w-full bg-white border border-[#DED8CC] rounded-xl px-4 py-3 text-[10px] text-[#06202B] focus:outline-none focus:border-[#07A7A0] focus:ring-1 focus:ring-[#07A7A0]/20 transition-all placeholder:text-[#51646A]/70 font-mono"
                placeholder="G... (56 characters)"
                value={form.providerPublicKey}
                onChange={(e) => setForm((f) => ({ ...f, providerPublicKey: e.target.value.trim() }))}
              />
            </Field>

            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-[10px] font-bold text-[#51646A]/70 uppercase tracking-wider">
                  RELEASE MILESTONES
                </label>
                <button
                  onClick={addCondition}
                  className="flex items-center gap-1.5 text-[10px] font-bold text-[#077A7D] bg-[#E8F7F3] px-2 py-1 rounded-lg hover:bg-[#DDF7F0] transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add term
                </button>
              </div>
              {(errors as any).conditions && (
                <p className="text-xs text-red-500 mb-2">{(errors as any).conditions}</p>
              )}
              <div className="space-y-3">
                {form.conditions.map((cond, i) => (
                  <div key={cond.id} className="flex gap-2 items-start bg-white p-3 rounded-xl border border-[#DED8CC]">
                    <span className="text-xs font-bold text-[#51646A]/70 mt-2.5 w-4 shrink-0">{i + 1}.</span>
                    <input
                      className="flex-1 bg-transparent text-sm text-[#06202B] focus:outline-none placeholder:text-[#51646A]/70 mt-2"
                      placeholder="Condition description..."
                      value={cond.description}
                      onChange={(e) => updateCondition(cond.id, e.target.value)}
                    />
                    {form.conditions.length > 1 && (
                      <button
                        onClick={() => removeCondition(cond.id)}
                        className="mt-2 w-6 h-6 rounded-full flex items-center justify-center text-[#51646A]/70 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleReview}
              disabled={!clientAddress}
              className="w-full bg-[#06202B] text-white font-bold py-4 rounded-xl shadow-[0_12px_28px_rgba(6,32,43,0.16)] hover:bg-[#103642] transition-all mt-4 disabled:opacity-50"
            >
              Review Contract
            </button>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-bold text-[#06202B] mb-1">Review & Confirm</h1>
              <p className="text-xs text-[#51646A]">
                You will sign a Soroban transaction that locks {Number(form.amountXLM)} XLM into the MIGO escrow contract on testnet.
              </p>
            </div>

            <div className="bg-white border border-[#DED8CC] rounded-2xl p-5 space-y-4 shadow-[0_8px_24px_rgba(6,32,43,0.05)]">
              <ReviewRow label="TITLE" value={form.title} />
              <ReviewRow label="AMOUNT" value={`${Number(form.amountXLM).toLocaleString()} XLM`} />
              <ReviewRow label="CLIENT (YOU)" value={clientAddress ?? ""} mono />
              <ReviewRow label="CONTRACTOR" value={form.providerPublicKey} mono />
              <div>
                <span className="text-[10px] font-bold text-[#51646A]/70 uppercase tracking-wider block mb-2">CONDITIONS</span>
                <ol className="space-y-2">
                  {form.conditions.map((c, i) => (
                    <li key={c.id} className="text-sm text-[#06202B] flex gap-3">
                      <span className="text-[#51646A]/70 font-bold shrink-0">{i + 1}.</span>
                      {c.description}
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="bg-[#EDF4F7] border border-[#C9D8DE] rounded-xl p-3.5 flex gap-3 items-start text-xs text-[#294A56] leading-relaxed shadow-sm">
              <div className="w-8 h-8 rounded-lg bg-[#077A7D]/10 flex items-center justify-center shrink-0 text-[#077A7D] mt-0.5">
                <Shield className="w-4 h-4" />
              </div>
              <div className="flex-1">
                The terms will be hashed (SHA-256) and recorded on-chain. The XLM is locked in the Soroban
                escrow contract until both you and the contractor confirm every milestone.
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setStep("form")}
                className="flex-1 border border-[#DED8CC] text-[#51646A] font-bold py-4 rounded-xl hover:bg-white transition-colors"
              >
                Edit
              </button>
              <button
                onClick={handleFund}
                className="flex-[2] bg-[#06202B] text-white font-bold py-4 rounded-xl shadow-[0_12px_28px_rgba(6,32,43,0.16)] hover:bg-[#103642] transition-all"
              >
                Sign & Lock XLM
              </button>
            </div>
          </div>
        )}

        {step === "funding" && (
          <div className="flex flex-col items-center justify-center py-32 gap-6">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-[#06202B] mb-2">Submitting to Stellar</div>
              <div className="text-sm text-[#51646A]">
                Locking {form.amountXLM} XLM in the escrow contract on Testnet...
              </div>
            </div>
            <div className="w-48 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-primary animate-pulse rounded-full" style={{ width: "60%" }} />
            </div>
          </div>
        )}

        {step === "done" && createdDeal && (
          <div className="flex flex-col items-center justify-center py-20 gap-6 text-center">
            <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            </div>
            <div>
              <div className="text-lg font-bold text-[#06202B] mb-1">Escrow Created On-Chain</div>
              <div className="text-sm text-[#51646A]">Funds are now locked in the MIGO escrow contract on Stellar Testnet</div>
            </div>
            <div className="w-full bg-white border border-[#DED8CC] rounded-2xl p-5 text-left space-y-4">
              <ReviewRow label="MISSION" value={createdDeal.title} />
              <ReviewRow label="AMOUNT LOCKED" value={`${createdDeal.amountXLM.toLocaleString()} XLM`} />
              {createdDeal.txHash && (
                <div>
                  <span className="text-[10px] font-bold text-[#51646A]/70 uppercase tracking-wider block mb-1">TX HASH</span>
                  <a
                    href={expertTxUrl(createdDeal.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    <span className="font-mono">{createdDeal.txHash.slice(0, 16)}...{createdDeal.txHash.slice(-8)}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
            <button
              onClick={onBack}
              className="w-full bg-[#06202B] text-white font-bold py-4 rounded-xl shadow-[0_12px_28px_rgba(6,32,43,0.16)] hover:bg-[#103642] transition-all mt-4"
            >
              View Dashboard
            </button>
          </div>
        )}

        {step === "error" && (
          <div className="flex flex-col items-center justify-center py-32 gap-6 text-center">
            <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center">
              <AlertCircle className="w-10 h-10 text-red-500" />
            </div>
            <div>
              <div className="text-lg font-bold text-[#06202B] mb-1">Transaction Failed</div>
              <div className="text-sm text-[#51646A] break-all">{errorMsg}</div>
            </div>
            <button
              onClick={() => setStep("form")}
              className="w-full bg-[#06202B] text-white font-bold py-4 rounded-xl hover:bg-[#103642] transition-all"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-[#51646A]/70 uppercase tracking-wider mb-2">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
    </div>
  );
}

function ReviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="text-[10px] font-bold text-[#51646A]/70 uppercase tracking-wider block mb-1">{label}</span>
      <span className={`text-sm text-[#06202B] font-medium break-all ${mono ? "text-[10px] font-mono bg-white px-2 py-1 rounded" : ""}`}>{value}</span>
    </div>
  );
}
