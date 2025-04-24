"use client";
import React, { useState } from "react";
import AssetSelector from "./AssetSelector";
import LightweightChartWidget from "./LightweightChartWidget";
import TimeFrameSelector from "./TimeFrameSelector";
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

  return (
    <section className="trading-chart">
      <div className="trading-controls w-full max-sm:flex-col max-sm:space-y-2">
        <div className="flex justify-between w-full max-sm:w-full items-center">
          <TimeFrameSelector
            selectedTimeFrame={selectedInterval}
            onTimeFrameChange={handleTimeFrameChange}
          />
          <AssetSelector 
            selectedPair={selectedPair} 
            onPairSelect={handlePairSelect}
          />
        </div>
      </div>
      <div className="relative bg-mainBackground rounded-lg w-full" style={{ height: 'calc(100% - 40px)' }}>
        {/* Live price overlay component */}
        <LivePriceOverlay pair={selectedPair} />
        
        <LightweightChartWidget 
          symbol={formatSymbol(selectedPair)} 
          interval={selectedInterval} 
        />
      </div>
    </section>
  );
};

export default ChartContainer;