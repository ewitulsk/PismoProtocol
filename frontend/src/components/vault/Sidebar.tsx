"use client";
import React, { useState } from "react";
import VaultItem from "./VaultItem";
// Import backend data type
import { VaultData } from "@/types";

interface SidebarProps {
  vaults: VaultData[]; // Use backend data type
  activeVaultId: string; // Keep for now, but won't match coin_type directly
  onVaultSelect: (vaultId: string) => void; // vaultId will be coin_type
}

// Helper to extract a display name/symbol from coin_type
const getDisplayName = (coinType: string): string => {
  const parts = coinType.split('::');
  return parts[parts.length - 1] || "Unknown"; // Return last part (e.g., BTC, ETH)
};

const Sidebar: React.FC<SidebarProps> = ({ vaults, activeVaultId, onVaultSelect }) => {
  const [searchTerm, setSearchTerm] = useState("");
  // Sort by 'value' (TVL) or 'name' (derived from coin_type)
  const [sortBy, setSortBy] = useState<"name" | "value">("name");

  // Filter and sort vaults based on backend data
  const filteredVaults = vaults
    .filter((vault) => {
      const name = getDisplayName(vault.coin_type).toLowerCase();
      const term = searchTerm.toLowerCase();
      return name.includes(term) || vault.coin_type.toLowerCase().includes(term);
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "value":
          return b.value - a.value; // Sort by USD value
        case "name":
        default:
          // Sort alphabetically by derived name
          return getDisplayName(a.coin_type).localeCompare(getDisplayName(b.coin_type));
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
            {/* Removed APY sort option as it's not in backend data */}
            <button
              className={`${sortBy === "value" ? "font-bold" : "opacity-70"}`}
              onClick={() => setSortBy("value")}
            >
              TVL {/* Displaying TVL but sorting by 'value' */}
            </button>
          </div>
        </div>
      </div>

      {/* Vault list */}
      <div className="flex flex-col gap-2 overflow-y-auto pr-2 flex-grow max-h-[calc(100vh-230px)] max-md:max-h-none max-md:overflow-x-auto max-md:flex-row max-md:pb-4">
        {filteredVaults.length > 0 ? (
          filteredVaults.map((vault) => (
            <VaultItem
              key={vault.coin_type} // Use coin_type as key
              id={vault.coin_type} // Pass coin_type as id
              coin_type={vault.coin_type} // Pass full coin_type
              value={vault.value} // Pass value (TVL)
              // isActive needs adjustment - comparing mock ID to coin_type won't work reliably
              isActive={activeVaultId === vault.coin_type} // Tentative: compare active ID to coin_type
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