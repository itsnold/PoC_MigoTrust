import { useState, useEffect } from "react";
import { EscrowDashboard } from "./components/EscrowDashboard";
import { CreateEscrow } from "./components/CreateEscrow";
import { EscrowDetail } from "./components/EscrowDetail";
import { WalletBar } from "./components/WalletBar";
import { EscrowDeal, loadDeals, saveDeals } from "./stellar/escrow";
import { useFreighter } from "./stellar/wallet";
import { readMission } from "./stellar/contract";

type View = "dashboard" | "create" | "detail";

export default function App() {
  const [deals, setDeals] = useState<EscrowDeal[]>(() => loadDeals());
  const [view, setView] = useState<View>("dashboard");
  const [selectedDeal, setSelectedDeal] = useState<EscrowDeal | null>(null);
  const wallet = useFreighter();
  const { publicKey } = wallet;

  useEffect(() => {
    let active = true;

    async function syncDeals() {
      // Find all deals that have a missionId and are not terminal
      const activeDeals = deals.filter(
        (d) => d.missionId !== null && !["released", "refunded"].includes(d.status)
      );
      if (activeDeals.length === 0) return;

      let changed = false;
      const updatedDeals = await Promise.all(
        deals.map(async (d) => {
          if (d.missionId !== null && !["released", "refunded"].includes(d.status)) {
            try {
              const mission = await readMission(d.missionId);
              
              let newStatus: EscrowDeal["status"] = d.status;
              if (mission.status === 1) {
                newStatus = "client_confirmed";
              } else if (mission.status === 2) {
                newStatus = "released";
              } else if (mission.status === 3) {
                newStatus = "disputed";
              } else {
                newStatus = "funded";
              }

              const updatedConditions = d.conditions.map((c) => {
                return {
                  ...c,
                  clientMet: mission.clientConfirmed,
                  providerMet: mission.providerConfirmed,
                };
              });

              if (
                newStatus !== d.status ||
                JSON.stringify(updatedConditions) !== JSON.stringify(d.conditions)
              ) {
                changed = true;
                return {
                  ...d,
                  status: newStatus,
                  conditions: updatedConditions,
                  updatedAt: new Date().toISOString(),
                };
              }
            } catch (err) {
              // Ignore simulation or network errors for specific deals
            }
          }
          return d;
        })
      );

      if (active && changed) {
        setDeals(updatedDeals);
        saveDeals(updatedDeals);
      }
    }

    syncDeals();
    const interval = setInterval(syncDeals, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [deals]);

  function handleSelectDeal(deal: EscrowDeal) {
    setSelectedDeal(deal);
    setView("detail");
  }

  function handleCreated(deal: EscrowDeal) {
    const updated = [deal, ...deals];
    setDeals(updated);
    saveDeals(updated);
  }

  function handleUpdateDeal(updated: EscrowDeal) {
    const newDeals = deals.map((d) => (d.id === updated.id ? updated : d));
    setDeals(newDeals);
    saveDeals(newDeals);
    setSelectedDeal(updated);
  }

  return (
    <div className="min-h-screen bg-[#E8E4DA] flex items-center justify-center font-sans py-10">
      <div className="w-[375px] h-[812px] bg-[#08232D] rounded-[34px] shadow-[0_30px_90px_rgba(6,32,43,0.28)] overflow-hidden relative flex flex-col border border-[#D6D0C4]">
        <WalletBar wallet={wallet} />
        {view === "create" ? (
          <CreateEscrow
            clientAddress={publicKey}
            onBack={() => setView("dashboard")}
            onCreated={(deal) => {
              handleCreated(deal);
              setView("dashboard");
            }}
          />
        ) : view === "detail" && selectedDeal ? (
          <EscrowDetail
            deal={deals.find((d) => d.id === selectedDeal.id) ?? selectedDeal}
            connectedAddress={publicKey}
            onBack={() => setView("dashboard")}
            onUpdate={handleUpdateDeal}
          />
        ) : (
          <EscrowDashboard
            deals={deals}
            onSelect={handleSelectDeal}
            onCreate={() => setView("create")}
          />
        )}
      </div>
    </div>
  );
}
