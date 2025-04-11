"use client";
import * as React from "react";
import { useState } from "react";
import { VaultData } from "@/data/vaults";

interface TabButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
}

interface ManagePositionProps {
  vault: VaultData;
}

const TabButton: React.FC<TabButtonProps> = ({ label, isActive, onClick }) => {
  return (
    <button
      className={`position-button ${isActive ? "position-button-active" : "position-button-inactive"} px-12 max-md:px-5`}
      onClick={onClick}
    >
      {label}
    </button>
  );
};

const ManagePosition: React.FC<ManagePositionProps> = ({ vault }) => {
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState<string>('');

  const handleMaxClick = () => {
    // Set to available balance (this would be dynamic in a real app)
    if (activeTab === 'deposit') {
      setAmount('1.45'); // Available balance
    } else {
      setAmount(vault.userDeposit.amount.toString()); // Current position
    }
  };

  return (
    <section className="card flex flex-col pb-6 border border-secondary h-full">
      <h2 className="header-title text-2xl">Manage LP</h2>

      <div className="flex gap-2 mt-6 font-semibold text-center whitespace-nowrap">
        <TabButton
          label="Deposit"
          isActive={activeTab === 'deposit'}
          onClick={() => setActiveTab('deposit')}
        />
        <TabButton
          label="Withdraw"
          isActive={activeTab === 'withdraw'}
          onClick={() => setActiveTab('withdraw')}
        />
      </div>

      <label className="text-label mt-6">Amount</label>
      <div className="flex gap-5 justify-between px-4 py-3 mt-2 bg-mainBackground rounded-lg">
        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="input-field bg-transparent p-0 my-auto"
        />
        <button
          className="text-center text-primary"
          onClick={handleMaxClick}
        >
          MAX
        </button>
      </div>

      <div className="flex gap-5 justify-between mt-6 text-sm">
        <div className="text-label">
          <div>Wallet Balance</div>
          <div className="mt-2">Current LP</div>
        </div>
        <div className="flex flex-col text-value">
          <div className="self-start">1.45 {vault.symbol}</div>
          <div className="mt-2">{vault.userDeposit.amount} {vault.symbol}</div>
        </div>
      </div>

      <button className="btn-action mt-6">
        {activeTab === 'deposit' ? `Deposit ${vault.symbol}` : `Withdraw ${vault.symbol}`}
      </button>
    </section>
  );
};

export default ManagePosition;