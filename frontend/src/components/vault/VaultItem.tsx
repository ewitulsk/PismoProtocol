"use client";
import React, { useState, useEffect } from "react";

// Define props based on backend data passed from Sidebar
interface VaultItemProps {
  id: string; // This will be the coin_type
  coin_type: string;
  value: number;
  isActive: boolean;
  onSelect: (vaultId: string) => void;
}

// Helper to extract a symbol from coin_type
const getSymbol = (coinType: string): string => {
  const parts = coinType.split('::');
  return parts[parts.length - 1] || "Unknown"; // Return last part (e.g., BTC, ETH)
};

// Helper to format currency (simplified)
const formatCompactCurrency = (value: number): string => {
  // Allow up to 2 decimal places for compact notation
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    minimumFractionDigits: 0, // Keep minimum 0
    maximumFractionDigits: 2  // Allow up to 2 decimals
  }).format(value);
};

const VaultItem: React.FC<VaultItemProps> = ({ id, coin_type, value, isActive, onSelect }) => {
  // State to hold the client-side formatted value
  const [formattedTvl, setFormattedTvl] = useState<string | null>(null);

  useEffect(() => {
    // Format the value only on the client after mount
    setFormattedTvl(formatCompactCurrency(value));
  }, [value]); // Re-run if the value prop changes

  const handleClick = () => {
    onSelect(id); // Pass coin_type (as id) back up
  };

  // Derive display name and symbol from coin_type
  const symbol = getSymbol(coin_type);

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
        if (e.key === "Enter" || e.key === " ") {
          handleClick();
        }
      }}
    >
      {/* Placeholder Icon */}
      <div className="w-8 h-8 rounded-full bg-zinc-300" />
      <div className="flex flex-col flex-grow">
        <div className="flex justify-between items-center">
          {/* Display derived name */}
          <h3
            className={`text-base font-bold ${
              isActive ? "text-black" : "text-white"
            }`}
          >
            {symbol}
          </h3>
        </div>
        <div className="flex flex-col items-start">
          {/* Display derived symbol */}
          <p
            className={`text-sm font-bold ${
              isActive ? "text-black" : "text-primary"
            }`}
          >
          </p>
          {/* Display formatted value (TVL) - Render only when formattedTvl is ready */}
          <span
            className={`text-xs ${
              isActive ? "text-black" : "text-gray-400"
            }`}
          >
            TVL:&nbsp;&nbsp;{formattedTvl} {/* Render the state variable */}
          </span>
        </div>
      </div>
    </div>
  );
};

export default VaultItem;