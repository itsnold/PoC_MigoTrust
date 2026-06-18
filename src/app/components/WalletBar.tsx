import { useState, useEffect, useCallback } from "react";
import { Wallet, Zap, RefreshCw, ExternalLink } from "lucide-react";
import type { WalletState } from "../stellar/wallet";
import { fetchBalances, type Balances } from "../stellar/balances";
import { fundTestnetAccount, expertAddressUrl } from "../stellar/sdk";

export function WalletBar({ wallet }: { wallet: WalletState }) {
  const { publicKey, connecting, error, connect, disconnect } = wallet;
  const [balances, setBalances] = useState<Balances | null>(null);
  const [funding, setFunding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refreshBalances = useCallback(async (isSilent = false) => {
    if (!publicKey) return;
    if (!isSilent) setRefreshing(true);
    try {
      const b = await fetchBalances(publicKey);
      setBalances(b);
    } catch {
      // ignore — will retry on next refresh
    } finally {
      if (!isSilent) setRefreshing(false);
    }
  }, [publicKey]);

  useEffect(() => {
    if (!publicKey) return;
    refreshBalances();
    const interval = setInterval(() => {
      refreshBalances(true);
    }, 4000);
    return () => clearInterval(interval);
  }, [publicKey, refreshBalances]);

  async function handleFund() {
    if (!publicKey) return;
    setFunding(true);
    try {
      await fundTestnetAccount(publicKey);
      await refreshBalances();
    } catch {
      // Friendbot can be slow — ignore for demo
    } finally {
      setFunding(false);
    }
  }

  if (!publicKey) {
    return (
      <div className="px-5 py-3 bg-[#08232D] border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white/60 text-xs">
            <Wallet className="w-3.5 h-3.5" />
            <span>No wallet connected</span>
          </div>
          <button
            onClick={connect}
            disabled={connecting}
            className="flex items-center gap-1.5 bg-[#7AE2CF] text-[#06202B] font-semibold px-3 py-1.5 rounded-lg text-xs hover:bg-[#9BEADC] transition-colors disabled:opacity-50"
          >
            <Wallet className="w-3 h-3" />
            {connecting ? "Connecting..." : "Connect Freighter"}
          </button>
        </div>
        {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div className="px-5 py-3 bg-[#08232D] border-b border-white/10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-white/80 text-xs font-mono">
            <Wallet className="w-3.5 h-3.5 text-primary" />
            <a
              href={expertAddressUrl(publicKey)}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors flex items-center gap-0.5"
            >
              {publicKey.slice(0, 6)}...{publicKey.slice(-4)}
              <ExternalLink className="w-2.5 h-2.5 opacity-50" />
            </a>
          </div>
          {balances && (
            <span className="text-xs text-white/60">
              {balances.xlm} XLM
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {balances && !balances.funded && (
            <button
              onClick={handleFund}
              disabled={funding}
              className="flex items-center gap-1 bg-amber-500/15 text-amber-200 font-semibold px-2.5 py-1 rounded-md text-[10px] hover:bg-amber-500/25 transition-colors disabled:opacity-50"
            >
              <Zap className="w-2.5 h-2.5" />
              {funding ? "Funding..." : "Fund via Friendbot"}
            </button>
          )}
          <button
            onClick={refreshBalances}
            disabled={refreshing}
            className="text-white/40 hover:text-white/70 transition-colors p-1"
            title="Refresh balance"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={disconnect}
            className="text-white/40 hover:text-red-400 text-[10px] font-medium transition-colors"
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}
