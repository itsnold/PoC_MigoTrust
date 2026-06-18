import { ArrowRight, BriefcaseBusiness, Clock, Shield, TrendingUp } from "lucide-react";
import { EscrowDeal, getStatusLabel } from "../stellar/escrow";
import { expertTxUrl } from "../stellar/sdk";

interface Props {
  deals: EscrowDeal[];
  onSelect: (deal: EscrowDeal) => void;
  onCreate: () => void;
}

function conditionsProgress(deal: EscrowDeal): number {
  const total = deal.conditions.length * 2;
  const met = deal.conditions.reduce(
    (acc, c) => acc + (c.providerMet ? 1 : 0) + (c.clientMet ? 1 : 0),
    0
  );
  return total === 0 ? 0 : Math.round((met / total) * 100);
}

export function EscrowDashboard({ deals, onSelect, onCreate }: Props) {
  const totalLocked = deals
    .filter((d) => !["released", "refunded"].includes(d.status))
    .reduce((acc, d) => acc + d.amountXLM, 0);

  return (
    <>
      <header className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-white flex items-center justify-center shadow-sm border border-[#DED8CC]/60">
              <img src="/migo-logo.png" alt="Migo Logo" className="w-6 h-6 object-contain" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#7AE2CF] font-bold">MIGO Protect</div>
              <h1 className="text-base font-bold text-white tracking-tight truncate">Escrow Console</h1>
            </div>
          </div>
          <div className="h-9 w-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
            <Shield className="w-4 h-4 text-[#7AE2CF]" />
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.05] p-4 shadow-md">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/50 font-bold">Locked in Escrow</div>
              <div className="mt-1.5 flex items-baseline gap-1.5 text-white">
                <span className="text-2xl font-bold tracking-tight font-mono">{totalLocked.toLocaleString()}</span>
                <span className="text-xs font-semibold text-white/60 font-mono">XLM</span>
              </div>
              <div className="mt-1 text-[10px] text-white/40">Wallet balance is shown above.</div>
            </div>
            <div className="rounded bg-[#7AE2CF]/10 border border-[#7AE2CF]/25 px-2 py-0.5 text-[#7AE2CF] flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider">
              <TrendingUp className="w-3 h-3" /> Secured
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg bg-black/15 border border-white/5 px-3 py-2">
              <div className="text-[10px] uppercase font-bold text-white/40 tracking-wider">Missions</div>
              <div className="text-white font-bold mt-0.5 text-sm font-mono">{deals.length}</div>
            </div>
            <div className="rounded-lg bg-black/15 border border-white/5 px-3 py-2">
              <div className="text-[10px] uppercase font-bold text-white/40 tracking-wider">Network</div>
              <div className="text-white font-bold mt-0.5 text-sm">Testnet</div>
            </div>
          </div>
        </div>
      </header>

      <div className="px-5 pb-4 pt-1 flex items-center gap-2.5">
        <button
          onClick={onCreate}
          className="flex-1 bg-[#7AE2CF] text-[#06202B] font-bold px-4 py-3 rounded-lg text-sm hover:bg-[#9BEADC] active:bg-[#6CD0BD] transition-colors shadow-sm cursor-pointer"
        >
          Post a Mission
        </button>
        <button className="w-11 h-11 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-[#7AE2CF] rounded-lg flex items-center justify-center cursor-pointer">
          <BriefcaseBusiness className="w-4 h-4" />
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 bg-[#F7F5EF] rounded-t-[28px] px-5 pt-5 pb-20 overflow-y-auto shadow-[0_-18px_45px_rgba(0,0,0,0.16)]">
        {/* Deals list */}
        {deals.length === 0 ? (
          <div className="text-center py-20 text-[#51646A]/70 text-sm">
            <img src="/migo-logo.png" alt="Migo Logo" className="w-10 h-10 mx-auto mb-3 opacity-25 grayscale object-contain" />
            No missions yet. Post a mission to lock testnet XLM in escrow.
          </div>
        ) : (
          <div className="space-y-3">
            {deals.map((deal) => {
              const progress = conditionsProgress(deal);
              return (
                <button
                  key={deal.id}
                  onClick={() => onSelect(deal)}
                  className="w-full bg-white border border-[#DED8CC] rounded-2xl p-4 shadow-[0_8px_24px_rgba(6,32,43,0.06)] text-left hover:border-[#B9CFC5] transition-all group"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-base font-bold text-[#06202B] mb-1 leading-5">{deal.title || "Education funds"}</h3>
                      <div className="text-xl font-bold text-[#06202B] flex items-baseline gap-1">
                        {deal.amountXLM.toLocaleString()}
                        <span className="text-xs text-[#51646A]/70">XLM</span>
                      </div>
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-[#F3F0E8] flex items-center justify-center">
                      <ArrowRight className="w-4 h-4 text-[#51646A]/60 group-hover:text-[#06202B] transition-colors" />
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-3.5 h-3.5 text-[#51646A]/60" />
                      <span className="text-xs font-semibold text-[#51646A]">
                        Status <span className="text-[#06202B]">{getStatusLabel(deal.status)}</span>
                      </span>
                    </div>
                    <div className="h-2 bg-[#ECE7DC] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#07A7A0] rounded-full"
                        style={{ width: `${Math.max(15, progress)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-[#F7F5EF] rounded-xl p-3 flex items-center gap-3 border border-[#E2DDD2]">
                      <div className="w-8 h-8 rounded-lg bg-white border border-[#E2DDD2] flex items-center justify-center">
                        <img src="/migo-logo.png" alt="" className="h-5 w-5 object-contain" />
                      </div>
                      <div>
                        <div className="text-[10px] text-[#51646A] font-medium">Escrow Fee</div>
                        <div className="text-sm font-bold text-[#06202B]">Protected</div>
                      </div>
                    </div>
                    {deal.txHash && (
                      <a
                        href={expertTxUrl(deal.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 bg-[#F7F5EF] rounded-xl p-3 flex items-center gap-3 border border-[#E2DDD2] hover:border-[#07A7A0]/40 transition-colors"
                      >
                        <div className="w-8 h-8 rounded bg-[#E8F7F3] flex items-center justify-center text-[#077A7D]">
                          <Shield className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-[10px] text-[#51646A] font-medium">On-chain</div>
                          <div className="text-sm font-bold text-[#06202B]">View tx</div>
                        </div>
                      </a>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
