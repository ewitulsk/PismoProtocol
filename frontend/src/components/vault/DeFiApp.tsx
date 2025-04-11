"use client";
import React, { useState, useEffect } from "react"; // Import useEffect
import Layout from "../common/Layout";
import Sidebar from "./Sidebar";
import StatsCard from "./StatsCard";
import VaultStats from "./VaultStats";
import ManagePosition from "./ManagePosition";
// Import backend data type
import { VaultData as BackendVaultData } from "@/types";
// Keep mock data imports for StatsCard and ManagePosition for now
import { VaultData as FrontendVaultData, vaultsData as mockVaultsData } from "@/data/vaults";

// Define props for DeFiApp
interface DeFiAppProps {
  initialVaults: BackendVaultData[];
}

const DeFiApp: React.FC<DeFiAppProps> = ({ initialVaults }) => {
  // State to track the active vault's coin_type
  const [activeVaultCoinType, setActiveVaultCoinType] = useState<string | null>(null);

  // Effect to set the initial active vault when data loads
  useEffect(() => {
    if (initialVaults.length > 0 && !activeVaultCoinType) {
      setActiveVaultCoinType(initialVaults[0].coin_type);
    }
  }, [initialVaults, activeVaultCoinType]);

  // Find the active vault data from the backend list based on coin_type
  const activeVault = initialVaults.find(vault => vault.coin_type === activeVaultCoinType);

  // Get mock active vault for components not yet updated
  const mockActiveVault = mockVaultsData[0]; // Or find based on a default mock ID if needed

  // Handler for vault selection from Sidebar
  const handleVaultSelect = (coinType: string) => {
    setActiveVaultCoinType(coinType);
  };

  // Render loading or empty state if no active vault is determined yet
  if (!activeVault) {
    // Optional: Add a loading indicator or message
    // For now, we render the layout but potentially with empty/default states in children
    console.log("Waiting for active vault determination...");
    // You might return a loading spinner here: return <Layout activePage="vault"><LoadingSpinner /></Layout>;
  }

  return (
    <Layout activePage="vault">
      <section className="flex h-[calc(100vh_-_74px)] max-md:flex-col overflow-hidden">
        <Sidebar
          vaults={initialVaults}
          // Pass the currently active coin_type. Handle null case.
          activeVaultId={activeVaultCoinType ?? ""}
          onVaultSelect={handleVaultSelect}
        />
        <article className="flex-1 p-8 overflow-y-auto max-md:p-4">
          <div className="flex flex-col gap-8">
            {/* Top row - Still uses mock data */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8" style={{ minHeight: "450px" }}>
              {/* TVL chart */}
              <div className="lg:col-span-2 h-full">
                <StatsCard
                  vaults={mockVaultsData} // Pass mock data
                  activeVault={mockActiveVault} // Pass mock active vault
                />
              </div>

              {/* Manage position */}
              <div className="lg:col-span-1 h-full">
                <ManagePosition vault={mockActiveVault} /> {/* Pass mock active vault */}
              </div>
            </div>

            {/* Bottom row - Uses the dynamically selected activeVault */}
            <div className="w-full">
              {/* Pass the correctly selected vault (BackendVaultData) or a default/empty state */}
              {activeVault ? (
                <VaultStats vault={activeVault} />
              ) : (
                // Optional: Render placeholder if activeVault is null/undefined
                <div className="card border border-secondary p-4 text-center text-gray-500">Select a vault to see its stats.</div>
              )}
            </div>
          </div>
        </article>
      </section>
    </Layout>
  );
};

export default DeFiApp;