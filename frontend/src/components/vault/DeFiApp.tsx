"use client";
import React, { useState, useEffect } from "react"; // Import useEffect
import Layout from "../common/Layout";
import Sidebar from "./Sidebar";
import StatsCard from "./StatsCard";
import VaultStats from "./VaultStats";
import ManageLP from "./ManageLP";
// Import backend data type
import { VaultData as BackendVaultData } from "@/types";
// Keep mock data imports for StatsCard for now
import { vaultsData as mockVaultsData } from "@/data/vaults";

// Define props for DeFiApp
interface DeFiAppProps {
  initialVaults: BackendVaultData[];
}

const DeFiApp: React.FC<DeFiAppProps> = ({ initialVaults }) => {
  // State to track the active vault's coin_type
  const [activeVaultCoinType, setActiveVaultCoinType] = useState<string | null>(null);
  console.log("DeFiApp rendering. Initial Vaults:", initialVaults); // Log initial data

  // Effect to set the initial active vault when data loads
  useEffect(() => {
    // This effect now runs when initialVaults changes (typically once when data arrives)
    console.log("DeFiApp useEffect running (depends on initialVaults). Initial Vaults:", initialVaults, "Current activeVaultCoinType:", activeVaultCoinType); // Log effect trigger
    // Only set the initial active vault if initialVaults has data AND activeVaultCoinType hasn't been set yet
    if (initialVaults.length > 0 && !activeVaultCoinType) {
      console.log("Setting initial active vault:", initialVaults[0].coin_type); // Log setting initial state
      setActiveVaultCoinType(initialVaults[0].coin_type);
    }
    // Dependency array only includes initialVaults.
    // The effect runs when initialVaults is populated or changes.
    // The 'if' condition prevents resetting the active vault if the user has already selected one.
  }, [initialVaults]);

  // Find the active vault data from the backend list based on coin_type
  const activeVault = initialVaults.find(vault => vault.coin_type === activeVaultCoinType);
  console.log("DeFiApp determined activeVault:", activeVault); // Log the found active vault

  // Get mock active vault for StatsCard component (until it's updated)
  const mockActiveVaultForStats = mockVaultsData[0]; // Or find based on a default mock ID if needed

  // Handler for vault selection from Sidebar
  const handleVaultSelect = (coinType: string) => {
    setActiveVaultCoinType(coinType);
  };

  // Render loading or empty state if no active vault is determined yet
  if (!activeVault && initialVaults.length > 0) { // Check if initial vaults exist but active one isn't found yet
    console.log("Waiting for active vault determination or selection...");
    // Optionally return a loading state here if preferred
  } else if (initialVaults.length === 0) {
    console.log("No initial vaults provided.");
    // Optionally return a message indicating no vaults are available
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
            {/* Top row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8" style={{ minHeight: "450px" }}>
              {/* TVL chart - Still uses mock data */}
              <div className="lg:col-span-2 h-full">
                <StatsCard
                  vaults={mockVaultsData} // Pass mock data
                  activeVault={mockActiveVaultForStats} // Pass mock active vault
                />
              </div>

              {/* Manage position */}
              <div className="lg:col-span-1 h-full">
                {activeVault ? (
                  <ManageLP vault={activeVault} />
                ) : (
                  // Optional: Render placeholder or disabled state if no vault selected
                  <div className="card flex flex-col pb-6 border border-secondary h-full items-center justify-center text-gray-500">
                    {initialVaults.length > 0 ? "Select a vault to manage LP." : "Loading vaults..."}
                  </div>
                )}
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