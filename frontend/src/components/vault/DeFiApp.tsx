"use client";
import React, { useState } from "react";
import Layout from "../common/Layout";
import Sidebar from "./Sidebar";
import StatsCard from "./StatsCard";
import VaultStats from "./VaultStats";
import ManagePosition from "./ManagePosition";
import { VaultData, vaultsData } from "@/data/vaults";

const DeFiApp: React.FC = () => {
  // State to track the active vault
  const [activeVaultId, setActiveVaultId] = useState<string>(vaultsData[0].id);
  
  // Get the active vault data
  const activeVault = vaultsData.find(vault => vault.id === activeVaultId) || vaultsData[0];
  
  // Handler for vault selection
  const handleVaultSelect = (vaultId: string) => {
    setActiveVaultId(vaultId);
  };

  return (
    <Layout activePage="vault">
      <section className="flex h-[calc(100vh_-_74px)] max-md:flex-col overflow-hidden">
        <Sidebar 
          vaults={vaultsData} 
          activeVaultId={activeVaultId} 
          onVaultSelect={handleVaultSelect} 
        />
        <article className="flex-1 p-8 overflow-y-auto max-md:p-4">
          <div className="flex flex-col gap-8">
            {/* Top row - TVL chart and Manage Position side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8" style={{ minHeight: "450px" }}>
              {/* TVL chart */}
              <div className="lg:col-span-2 h-full">
                <StatsCard 
                  vaults={vaultsData} 
                  activeVault={activeVault} 
                />
              </div>
              
              {/* Manage position */}
              <div className="lg:col-span-1 h-full">
                <ManagePosition vault={activeVault} />
              </div>
            </div>
            
            {/* Bottom row - Vault stats full width */}
            <div className="w-full">
              <VaultStats vault={activeVault} />
            </div>
          </div>
        </article>
      </section>
    </Layout>
  );
};

export default DeFiApp;