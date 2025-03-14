"use client";
import React from "react";
import { vaultsData } from "@/data/vaults";

interface VaultItemProps {
  id: string;
  name: string;
  symbol: string;
  isActive: boolean;
  onSelect: (vaultId: string) => void;
}

const VaultItem: React.FC<VaultItemProps> = ({ id, name, symbol, isActive, onSelect }) => {
  const handleClick = () => {
    onSelect(id);
  };

  // Get additional data for this vault
  const vaultData = vaultsData.find(vault => vault.id === id);
  const apy = vaultData ? `${vaultData.apy}%` : "N/A";
  const tvl = vaultData ? new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(vaultData.totalValueLocked.amount) : "N/A";

  return (
    <div 
      className={`flex gap-4 items-center px-4 py-4 rounded-xl cursor-pointer max-md:min-w-[280px] ${
        isActive ? "bg-secondary" : "bg-darkBackground"
      }`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick();
        }
      }}
    >
      <div className="w-8 h-8 rounded-full bg-zinc-300" />
      <div className="flex flex-col flex-grow">
        <div className="flex justify-between items-center">
          <h3
            className={`text-base font-bold ${
              isActive ? "text-black" : "text-white"
            }`}
          >
            {name}
          </h3>
          <span 
            className={`text-xs font-bold ${
              isActive ? "text-black" : "text-secondary"
            }`}
          >
            {apy}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <p
            className={`text-sm font-bold ${
              isActive ? "text-black" : "text-primary"
            }`}
          >
            {symbol}
          </p>
          <span 
            className={`text-xs ${
              isActive ? "text-black" : "text-gray-400"
            }`}
          >
            {tvl}
          </span>
        </div>
      </div>
    </div>
  );
};

export default VaultItem;