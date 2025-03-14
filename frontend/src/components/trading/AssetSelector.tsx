"use client";
import React, { useState, useRef, useEffect } from "react";
import { tradingPairs, TradingPair } from "@/data/mocks/tradingPairs";

interface AssetSelectorProps {
  selectedPair: TradingPair;
  onPairSelect: (pair: TradingPair) => void;
}

const AssetSelector: React.FC<AssetSelectorProps> = ({
  selectedPair,
  onPairSelect,
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

  const handlePairSelect = (pair: TradingPair) => {
    onPairSelect(pair);
    setIsOpen(false);
  };

  const filteredPairs = searchTerm
    ? tradingPairs.filter(
        (pair) =>
          pair.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          pair.baseAsset.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : tradingPairs;

  return (
    <div className="relative ml-auto" ref={dropdownRef}>
      <button
        onClick={toggleDropdown}
        className="btn-primary flex items-center justify-between min-w-[120px] max-sm:w-full max-sm:text-center"
      >
        <span>{selectedPair.displayName}</span>
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
        <div className="absolute right-0 z-10 mt-2 rounded-xl shadow-lg w-64 bg-darkBackground border border-mainBackground">
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
            {filteredPairs.length > 0 ? (
              filteredPairs.map((pair) => (
                <button
                  key={pair.id}
                  onClick={() => handlePairSelect(pair)}
                  className={`w-full text-left px-4 py-2 text-sm flex items-center hover:bg-mainBackground ${
                    selectedPair.id === pair.id ? "bg-mainBackground" : ""
                  }`}
                >
                  <span className="flex-1 text-white">{pair.displayName}</span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      pair.change24h >= 0
                        ? "bg-opacity-20 bg-green-500 text-green-400"
                        : "bg-opacity-20 bg-red-500 text-red-400"
                    }`}
                  >
                    {pair.change24h >= 0 ? "+" : ""}
                    {pair.change24h.toFixed(2)}%
                  </span>
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