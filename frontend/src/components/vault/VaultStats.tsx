"use client";
import React from "react";
import { VaultData } from "@/data/vaults";

interface VaultStatsProps {
  vault: VaultData;
}

const VaultStats: React.FC<VaultStatsProps> = ({ vault }) => {
  // Format currencies
  const formattedTVL = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(vault.totalValueLocked.amount);

  const formattedUserDeposit = `${vault.userDeposit.amount} ${vault.userDeposit.currency}`;
  const formattedAPY = `${vault.apy}%`;

  return (
    <section className="card flex justify-between border border-secondary max-md:flex-col max-md:gap-6 max-sm:p-4">
      <div className="flex flex-col gap-2">
        <h3 className="text-label">Vault</h3>
        <div className="flex gap-2 items-center text-2xl font-bold max-sm:text-xl">
          <div className="w-6 h-6 rounded-full bg-zinc-300" />
          <span>{vault.symbol}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-label">Total Value Locked</h3>
        <p className="gap-2 text-2xl font-bold max-sm:text-xl">{formattedTVL}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-label">Your Deposit</h3>
        <p className="gap-2 text-2xl font-bold max-sm:text-xl">{formattedUserDeposit}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-label">Current APY</h3>
        <p className="gap-2 text-2xl font-bold text-secondary max-sm:text-xl">
          {formattedAPY}
        </p>
      </div>
    </section>
  );
};

export default VaultStats;