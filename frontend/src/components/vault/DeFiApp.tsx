"use client";
import React, { useState, useEffect } from "react";
import Layout from "../common/Layout";
import Sidebar from "./Sidebar";
import StatsCard from "./StatsCard";
import VaultStats from "./VaultStats";
import ManageLP from "./ManageLP";
import { VaultData as BackendVaultData } from "@/types";

const DeFiApp: React.FC = () => {
  // State for vaults and loading
  const [vaults, setVaults] = useState<BackendVaultData[]>([]);
  const [loading, setLoading] = useState(true);

  // Track if the initial load is complete
  const [initialLoad, setInitialLoad] = useState(true);

  // State to track the active vault's coin_type
  const [activeVaultCoinType, setActiveVaultCoinType] = useState<string | null>(null);

  // Fetch vault data on mount and every 5 seconds
  useEffect(() => {
    let isMounted = true;
    async function fetchVaultData() {
      setLoading(true);
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://172.24.219.19:5000/';
        const response = await fetch(`${backendUrl}/api/calculateTotalValueLocked`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
          next: { revalidate: 30 }
        });
        if (!response.ok) {
          if (isMounted) setVaults([]);
        } else {
          const data = await response.json();
          if (isMounted) setVaults(data.vaults || []);
        }
      } catch (error) {
        if (isMounted) setVaults([]);
      }
      if (isMounted) setLoading(false);
      if (isMounted && initialLoad) setInitialLoad(false);
    }

    fetchVaultData();
    const interval = setInterval(fetchVaultData, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Set initial active vault when vaults load
  useEffect(() => {
    if (vaults.length > 0 && !activeVaultCoinType) {
      setActiveVaultCoinType(vaults[0].coin_type);
    }
  }, [vaults]);

  // Find the active vault data from the backend list based on coin_type
  const activeVault = vaults.find(vault => vault.coin_type === activeVaultCoinType);

  // Handler for vault selection from Sidebar
  const handleVaultSelect = (coinType: string) => {
    setActiveVaultCoinType(coinType);
  };

  // Render loading or empty state if needed
  if (loading && initialLoad) {
    return (
      <Layout activePage="vault">
        <div className="flex items-center justify-center h-full">Loading vaults...</div>
      </Layout>
    );
  }

  return (
    <Layout activePage="vault">
      <section className="flex h-[calc(100vh_-_74px)] max-md:flex-col overflow-hidden">
        <Sidebar
          vaults={vaults}
          activeVaultId={activeVaultCoinType ?? ""}
          onVaultSelect={handleVaultSelect}
        />
        <article className="flex-1 p-8 overflow-y-auto max-md:p-4">
          <div className="flex flex-col gap-8">
            {/* Top row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8" style={{ minHeight: "450px" }}>
              {/* TVL chart - Now uses real data */}
              <div className="lg:col-span-2 h-full">
                <StatsCard
                  activeVault={activeVault}
                />
              </div>
              {/* Manage position */}
              <div className="lg:col-span-1 h-full">
                {activeVault ? (
                  <ManageLP vault={activeVault} />
                ) : (
                  <div className="card flex flex-col pb-6 border border-secondary h-full items-center justify-center text-gray-500">
                    {vaults.length > 0 ? "Select a vault to manage LP." : "Loading vaults..."}
                  </div>
                )}
              </div>
            </div>
            {/* Bottom row */}
            <div className="w-full">
              {activeVault ? (
                <VaultStats vault={activeVault} />
              ) : (
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