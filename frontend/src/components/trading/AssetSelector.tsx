"use client";
import React, { useState, useRef, useEffect } from "react";
// Removed: import { tradingPairs, TradingPair } from "@/data/mocks/tradingPairs";

// Define the new interface for selectable market assets
export interface SelectableMarketAsset {
  id: string; // This will be the priceFeedId
  displayName: string; // e.g., "BTC/USD"
  baseAsset: string; // e.g., "BTC" for filtering
  priceFeedId: string; // Hex string of price_feed_id_bytes
  marketIndex: number; // Index in the `supported_positions` vector
  change24h?: number; // Optional: for display consistency with existing UI
  decimals?: number; // Optional: number of decimals for this asset
}

interface AssetSelectorProps {
  selectedAsset: SelectableMarketAsset;
  onAssetSelect: (asset: SelectableMarketAsset) => void;
  availableAssets: SelectableMarketAsset[]; // New prop for dynamic assets
}

const AssetSelector: React.FC<AssetSelectorProps> = ({
  selectedAsset,
  onAssetSelect,
  availableAssets, // Use the new prop
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setSearchTerm("");
    }
  };

  const handleAssetSelectInternal = (asset: SelectableMarketAsset) => {
    onAssetSelect(asset);
    setIsOpen(false);
  };

  const filteredAssets = searchTerm
    ? availableAssets.filter(
        (asset) =>
          asset.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          asset.baseAsset.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : availableAssets;

  return (
    <div className="relative ml-auto" ref={dropdownRef}>
      <button
        onClick={toggleDropdown}
        className="btn-primary flex items-center justify-between min-w-[120px] max-sm:max-w-[150px] max-sm:text-sm"
      >
        <span>{selectedAsset.displayName}</span>
        <svg
          className={`w-4 h-4 ml-2 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-10 mt-2 rounded-xl shadow-lg w-64 max-sm:w-56 max-sm:right-0 bg-darkBackground border border-mainBackground">
          <div className="p-2">
            <input
              type="text"
              placeholder="Search assets..."
              className="input-field text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {filteredAssets.length > 0 ? (
              filteredAssets.map((asset) => (
                <button
                  key={asset.id} // Use asset.id (which is priceFeedId)
                  onClick={() => handleAssetSelectInternal(asset)}
                  className={`w-full text-left px-4 py-2 text-sm flex items-center hover:bg-mainBackground ${
                    selectedAsset.id === asset.id ? "bg-mainBackground" : "" // Compare by id
                  }`}
                >
                  <span className="flex-1 text-white">{asset.displayName}</span>
                  {asset.change24h !== undefined && ( // Conditionally render if change24h is available
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        asset.change24h >= 0
                          ? "bg-opacity-20 bg-green-500 text-green-400"
                          : "bg-opacity-20 bg-red-500 text-red-400"
                      }`}
                    >
                      {asset.change24h >= 0 ? "+" : ""}
                      {asset.change24h.toFixed(2)}%
                    </span>
                  )}
                </button>
              ))
            ) : (
              <div className="px-4 py-2 text-sm text-primary">
                No assets found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetSelector;