"use client";
import React, { useState } from "react";
import AssetSelector from "./AssetSelector";
import TradingViewWidget from "./TradingViewWidget";
import TimeFrameSelector, { timeframes } from "./TimeFrameSelector";
import LivePriceOverlay from "./LivePriceOverlay";
import { tradingPairs, TradingPair } from "@/data/mocks/tradingPairs";

const ChartContainer: React.FC = () => {
  // Default to 1H timeframe, also support second-based intervals "1S", "10S", "30S"
  const [selectedInterval, setSelectedInterval] = useState<string>("60");
  const [selectedPair, setSelectedPair] = useState<TradingPair>(tradingPairs[0]);

  const handleTimeFrameChange = (interval: string) => {
    setSelectedInterval(interval);
  };

  const handlePairSelect = (pair: TradingPair) => {
    setSelectedPair(pair);
  };

  // Format symbol for TradingView - remove hyphen
  const formatSymbol = (pair: TradingPair) => {
    return `${pair.baseAsset}${pair.quoteAsset}`;
  };
  
  // Get current price with formatting
  const getFormattedPrice = (price: number) => {
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  return (
    <section className="trading-chart">
      <div className="trading-controls">
        <TimeFrameSelector
          selectedTimeFrame={selectedInterval}
          onTimeFrameChange={handleTimeFrameChange}
        />
        <AssetSelector 
          selectedPair={selectedPair} 
          onPairSelect={handlePairSelect}
        />
      </div>
      <div className="relative bg-mainBackground rounded-lg w-full" style={{ height: 'calc(100% - 40px)' }}>
        {/* Live price overlay component */}
        <LivePriceOverlay pair={selectedPair} />
        
        <TradingViewWidget 
          symbol={formatSymbol(selectedPair)} 
          interval={selectedInterval} 
        />
      </div>
    </section>
  );
};

export default ChartContainer;