"use client";
import React, { useState } from "react";
import VaultItem from "./VaultItem";
import { VaultData } from "@/data/vaults";

interface SidebarProps {
  vaults: VaultData[];
  activeVaultId: string;
  onVaultSelect: (vaultId: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ vaults, activeVaultId, onVaultSelect }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "apy" | "tvl">("name");
  
  // Filter and sort vaults
  const filteredVaults = vaults
    .filter(vault => 
      vault.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      vault.symbol.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case "apy":
          return b.apy - a.apy;
        case "tvl":
          return b.totalValueLocked.amount - a.totalValueLocked.amount;
        case "name":
        default:
          return a.name.localeCompare(b.name);
      }
    });

  return (
    <aside className="p-6 border-r border-solid border-r-secondary w-[280px] bg-mainBackground max-md:w-full max-md:border-b max-md:border-solid max-md:border-b-secondary max-md:border-r-[none] flex flex-col h-full">
      <h2 className="header-title mb-4">Vaults</h2>
      
      {/* Search input */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search vaults..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="input-field py-2 text-sm mb-2"
        />
        
        {/* Sort controls */}
        <div className="flex justify-between text-xs text-primary">
          <span>Sort by:</span>
          <div className="flex gap-2">
            <button 
              className={`${sortBy === "name" ? "font-bold" : "opacity-70"}`}
              onClick={() => setSortBy("name")}
            >
              Name
            </button>
            <button 
              className={`${sortBy === "apy" ? "font-bold" : "opacity-70"}`}
              onClick={() => setSortBy("apy")}
            >
              APY
            </button>
            <button 
              className={`${sortBy === "tvl" ? "font-bold" : "opacity-70"}`}
              onClick={() => setSortBy("tvl")}
            >
              TVL
            </button>
          </div>
        </div>
      </div>
      
      {/* Vault list */}
      <div className="flex flex-col gap-2 overflow-y-auto pr-2 flex-grow max-h-[calc(100vh-230px)] max-md:max-h-none max-md:overflow-x-auto max-md:flex-row max-md:pb-4">
        {filteredVaults.length > 0 ? (
          filteredVaults.map((vault) => (
            <VaultItem
              key={vault.id}
              id={vault.id}
              name={vault.name}
              symbol={vault.symbol}
              isActive={vault.id === activeVaultId}
              onSelect={onVaultSelect}
            />
          ))
        ) : (
          <div className="text-center p-4 text-gray-400">
            No vaults match your search
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;