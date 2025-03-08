"use client";
import React, { useState } from "react";
import AssetSelector from "./AssetSelector";
import TradingViewWidget from "./TradingViewWidget";
import { tradingPairs, TradingPair } from "@/data/mocks/tradingPairs";

type TimeFrame = "1H" | "4H" | "1D";

const ChartContainer: React.FC = () => {
  const [activeTimeFrame, setActiveTimeFrame] = useState<TimeFrame>("1H");
  const [selectedPair, setSelectedPair] = useState<TradingPair>(tradingPairs[0]);

  const handleTimeFrameClick = (timeFrame: TimeFrame) => {
    setActiveTimeFrame(timeFrame);
  };

  const handlePairSelect = (pair: TradingPair) => {
    setSelectedPair(pair);
  };

  // Map timeframe to TradingView intervals
  const timeframeToInterval = {
    "1H": "60",
    "4H": "240",
    "1D": "1D"
  };

  // Format symbol for TradingView - remove hyphen
  const formatSymbol = (pair: TradingPair) => {
    return `${pair.baseAsset}${pair.quoteAsset}`;
  };

  return (
    <section className="chart-container">
      <div className="flex gap-4 mb-6 max-sm:flex-wrap">
        <TimeButton
          label="1H"
          isActive={activeTimeFrame === "1H"}
          onClick={() => handleTimeFrameClick("1H")}
        />
        <TimeButton
          label="4H"
          isActive={activeTimeFrame === "4H"}
          onClick={() => handleTimeFrameClick("4H")}
        />
        <TimeButton
          label="1D"
          isActive={activeTimeFrame === "1D"}
          onClick={() => handleTimeFrameClick("1D")}
        />
        <AssetSelector 
          selectedPair={selectedPair} 
          onPairSelect={handlePairSelect}
        />
      </div>
      <div className="bg-mainBackground rounded-lg h-[600px]">
        <TradingViewWidget 
          symbol={formatSymbol(selectedPair)} 
          interval={timeframeToInterval[activeTimeFrame]} 
        />
      </div>
    </section>
  );
};

interface TimeButtonProps {
  label: TimeFrame;
  isActive: boolean;
  onClick: () => void;
}

const TimeButton: React.FC<TimeButtonProps> = ({
  label,
  isActive,
  onClick,
}) => {
  return (
    <button
      className={`time-button ${isActive ? "time-button-active" : "time-button-inactive"}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
};

export default ChartContainer;