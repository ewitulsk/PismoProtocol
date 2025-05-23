"use client";
import React, { useState } from "react";
import AssetSelector, { SelectableMarketAsset } from "./AssetSelector";
import LightweightChartWidget from "./LightweightChartWidget";
import TimeFrameSelector from "./TimeFrameSelector";

// Define props for ChartContainer
interface ChartContainerProps {
  selectedAsset: SelectableMarketAsset | null; // Can be null initially
  availableAssets: SelectableMarketAsset[];
  onAssetSelect: (asset: SelectableMarketAsset) => void;
  // TODO: Consider passing live price here if LivePriceOverlay is removed/reintegrated
}

const ChartContainer: React.FC<ChartContainerProps> = ({ 
  selectedAsset, 
  availableAssets, 
  onAssetSelect 
}) => {
  // State for timeframe selector - restored
  const [selectedInterval, setSelectedInterval] = useState<string>("10"); // Default to 10s (or your previous default)

  const handleTimeFrameChange = (interval: string) => {
    setSelectedInterval(interval);
  };

  return (
    <section className="trading-chart">
      <div className="trading-controls w-full max-sm:flex-col max-sm:space-y-2">
        <div className="flex justify-between w-full max-sm:w-full items-center">
          <TimeFrameSelector
            selectedTimeFrame={selectedInterval}
            onTimeFrameChange={handleTimeFrameChange}
          />
          {selectedAsset && availableAssets.length > 0 ? (
          <AssetSelector
            selectedAsset={selectedAsset}
            availableAssets={availableAssets}
            onAssetSelect={onAssetSelect}
          /> ) : (
              // Placeholder if no assets/selection, to maintain layout balance
              <div className="min-w-[120px]">&nbsp;</div> 
            )}
        </div>
      </div>
      <div className="relative bg-mainBackground rounded-lg w-full" style={{ height: 'calc(100% - 40px)' }}>
        
        
        {selectedAsset ? (
          <LightweightChartWidget 
            priceFeedId={selectedAsset.priceFeedId} 
            interval={selectedInterval} // Pass the selected interval
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-primary">Please select an asset to view the chart.</p>
          </div>
        )}
      </div>
    </section>
  );
};

export default ChartContainer;