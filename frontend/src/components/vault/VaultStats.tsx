"use client";
import React from "react";
// Import the backend VaultData type
import { VaultData } from "@/types"; // Renamed to avoid conflict

// Helper to extract a display name/symbol from coin_type
const getDisplayName = (coinType: string): string => {
  const parts = coinType.split('::');
  return parts[parts.length - 1] || "Unknown"; // Return last part (e.g., BTC, ETH)
};

// Helper to format currency
const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

// Update props interface to strictly expect BackendVaultData
interface VaultStatsProps {
  vault: VaultData;
}

const VaultStats: React.FC<VaultStatsProps> = ({ vault }) => {
  // Derive display values directly from the backend data structure
  const symbol = getDisplayName(vault.coin_type);
  const formattedTVL = formatCurrency(vault.value);
  const formattedUserDeposit = "-"; // Not available in backend data
  const formattedAPY = "-"; // Not available in backend data

  return (
    <section className="card flex justify-between border border-secondary max-md:flex-col max-md:gap-6 max-sm:p-4">
      <div className="flex flex-col gap-2">
        <h3 className="text-label">Vault</h3>
        <div className="flex gap-2 items-center text-2xl font-bold max-sm:text-xl">
          <div className="w-6 h-6 rounded-full bg-zinc-300" />
          {/* Display symbol derived from backend data */}
          <span>{symbol}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-label">Total Value Locked</h3>
        {/* Display TVL derived from backend data */}
        <p className="gap-2 text-2xl font-bold max-sm:text-xl">{formattedTVL}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-label">Your Deposit</h3>
        {/* Display "-" as User Deposit is not available */}
        <p className="gap-2 text-2xl font-bold max-sm:text-xl">{formattedUserDeposit}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-label">Current APY</h3>
        {/* Display "-" as APY is not available */}
        <p className="gap-2 text-2xl font-bold text-secondary max-sm:text-xl">
          {formattedAPY}
        </p>
      </div>
    </section>
  );
};

export default VaultStats;