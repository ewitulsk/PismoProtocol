"use client";
import React, { useState, useEffect, useRef } from "react";
import { TradingPair } from "@/data/mocks/tradingPairs";
import { pythPriceFeedService } from "@/utils/pythPriceFeed";

interface LivePriceOverlayProps {
  pair: TradingPair;
}

const LivePriceOverlay: React.FC<LivePriceOverlayProps> = ({ pair }) => {
  const [price, setPrice] = useState<number | null>(null);
  const [priceChangeDirection, setPriceChangeDirection] = useState<'up' | 'down' | 'neutral'>('neutral');
  const previousPriceRef = useRef<number | null>(null);
  const symbol = `${pair.baseAsset}${pair.quoteAsset}`; // Format like "BTCUSD"
  
  // Format price for display with proper decimal places
  const getFormattedPrice = (priceValue: number | null): string => {
    if (priceValue === null) return "$0.00";
    
    return priceValue.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // Get price color based on direction
  const getPriceColor = (): string => {
    switch (priceChangeDirection) {
      case 'up':
        return 'text-green-400';
      case 'down':
        return 'text-red-400';
      default:
        return 'text-white';
    }
  };
  
  useEffect(() => {
    // This effect runs when the selected trading pair changes
    let isSubscribed = true;
    
    // Function to handle price updates from Pyth
    const handlePythUpdate = (newPrice: number, confidence: number) => {
      if (!isSubscribed) return;
      
      // Update price change direction
      if (previousPriceRef.current !== null) {
        if (newPrice > previousPriceRef.current) {
          setPriceChangeDirection('up');
        } else if (newPrice < previousPriceRef.current) {
          setPriceChangeDirection('down');
        }
      }
      
      // Update state and ref
      setPrice(newPrice);
      previousPriceRef.current = newPrice;
      
      // Reset price change direction after a short delay
      setTimeout(() => {
        if (isSubscribed) {
          setPriceChangeDirection('neutral');
        }
      }, 1000);
    };
    
    const initializePriceFeed = async () => {
      try {
        // Get the latest price from Pyth
        const initialPrice = await pythPriceFeedService.getLatestPrice(symbol);
        if (initialPrice && isSubscribed) {
          setPrice(initialPrice.price);
          previousPriceRef.current = initialPrice.price;
        }
        
        // Subscribe to Pyth updates
        if (isSubscribed) {
          await pythPriceFeedService.subscribe(symbol, handlePythUpdate);
        }
      } catch (error) {
        console.error(`[LivePriceOverlay] Error initializing Pyth price feed for ${symbol}:`, error);
      }
    };
    
    // Start the price feed
    initializePriceFeed();
    
    // Cleanup function
    return () => {
      isSubscribed = false;
      
      // Unsubscribe from Pyth
      pythPriceFeedService.unsubscribe(symbol)
        .catch(error => console.error(`Error unsubscribing from Pyth ${symbol}:`, error));
    };
  }, [symbol]);
  
  return (
    <div className="live-price-overlay">
      <span className="font-bold">{pair.baseAsset}/{pair.quoteAsset}</span>
      <span className={`text-lg font-mono ${getPriceColor()}`}>
        {getFormattedPrice(price)}
      </span>
    </div>
  );
};

export default LivePriceOverlay;