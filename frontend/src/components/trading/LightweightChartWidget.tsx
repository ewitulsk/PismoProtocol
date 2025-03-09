"use client";
import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  Time,
  CandlestickData,
  LineData
} from 'lightweight-charts';
import { priceFeedAggregatorService, PriceUpdate, PriceFeedBarData, PriceFeedAggregatorService } from '@/utils/priceFeedAggregator';

interface LightweightChartWidgetProps {
  symbol?: string;
  interval?: string;
}

const LightweightChartWidget: React.FC<LightweightChartWidgetProps> = ({
  symbol = 'BTCUSD',
  interval = '60'
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [lastBar, setLastBar] = useState<CandlestickData<Time> | null>(null);
  const [historicalData, setHistoricalData] = useState<CandlestickData<Time>[]>([]);

  // Generate initial sample data
  const generateInitialData = (): CandlestickData<Time>[] => {
    const now = Math.floor(Date.now() / 1000);
    const data: CandlestickData<Time>[] = [];
    
    // Create sample data for the last 50 periods based on interval
    // const periodSeconds = parseInt(interval.replace('S', '')) || 60; // Default to 60s if parsing fails
    
    // // Generate some sample data
    // let basePrice = 30000 + Math.random() * 5000;
    
    // for (let i = 49; i >= 0; i--) {
    //   const timeValue = now - (i * periodSeconds);
    //   const volatility = Math.random() * 100;
    //   const open = basePrice + (Math.random() - 0.5) * volatility;
    //   const close = open + (Math.random() - 0.5) * volatility;
    //   const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    //   const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    //   // Volume is not part of CandlestickData type
      
    //   data.push({
    //     time: timeValue as Time,
    //     open,
    //     high,
    //     low,
    //     close
    //   });
      
    //   basePrice = close;
    // }
    
    return data;
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const handleResize = () => {
      chart.applyOptions({
        width: chartContainerRef.current?.clientWidth || 600
      });
    };

    // Initialize chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 500,
      timeScale: {
        timeVisible: true,
        secondsVisible: interval.includes('S'),
      },
    });

    // Create and style the candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    // Create price line for real-time price
    const priceLine = chart.addLineSeries({
      color: '#2962FF',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    // Initialize with sample data
    const initialData = generateInitialData();
    setHistoricalData(initialData);
    candleSeries.setData(initialData);

    // Fit content to show all data
    chart.timeScale().fitContent();

    // Subscribe to price feed updates
    const handlePriceUpdate = (update: PriceUpdate) => {
      const price = update.price;
      setLastPrice(price);
      
      console.log(`[LightweightChartWidget] Processing update for ${symbol}: $${price.toFixed(2)}`);

      // Update price line with latest price
      const time = Math.floor(new Date(update.timestamp).getTime() / 1000) as Time;
      priceLine.update({ time, value: price } as LineData);

      // Handle OHLC data if available
      if (update.polygon_data) {
        const bar = PriceFeedAggregatorService.createBarFromUpdate(update);
        if (bar) {
          const typedBar = {
            ...bar,
            time: bar.time as Time
          };
          console.log('[LightweightChartWidget] Updating candlestick with new bar:', typedBar);
          candleSeries.update(typedBar as CandlestickData<Time>);
          setLastBar(typedBar as CandlestickData<Time>);
        }
      } else if (lastBar) {
        // Update the last bar with the new price
        const updatedBar = { ...lastBar };
        
        // If time is the same as the last bar, update it
        if (time === lastBar.time) {
          updatedBar.close = price;
          updatedBar.high = Math.max(lastBar.high, price);
          updatedBar.low = Math.min(lastBar.low, price);
        } else {
          // Create a new bar
          updatedBar.time = time;
          updatedBar.open = lastBar.close;
          updatedBar.high = Math.max(price, lastBar.close);
          updatedBar.low = Math.min(price, lastBar.close);
          updatedBar.close = price;
        }
        
        console.log('[LightweightChartWidget] Updating existing bar:', updatedBar);
        candleSeries.update(updatedBar);
        setLastBar(updatedBar);
      } else {
        // Create a new bar from just the price
        const partialBar = PriceFeedAggregatorService.createPartialBar(update);
        const typedBar = {
          ...partialBar,
          time: partialBar.time as Time
        };
        console.log('[LightweightChartWidget] Creating new bar:', typedBar);
        candleSeries.update(typedBar as CandlestickData<Time>);
        setLastBar(typedBar as CandlestickData<Time>);
      }
    };

    // Subscribe to price feed
    console.log("The chart is making the subscription...");
    priceFeedAggregatorService.subscribe(symbol, handlePriceUpdate)
      .catch(err => console.error(`Error subscribing to price feed for ${symbol}:`, err));

    // Handle window resize
    window.addEventListener('resize', handleResize);

    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize);
      priceFeedAggregatorService.unsubscribe(symbol);
      chart.remove();
    };
  }, [symbol, interval, lastBar]);

  return (
    <div 
      ref={chartContainerRef} 
      className="w-full h-full" 
      style={{ minHeight: '100%', position: 'relative' }}
    />
  );
};

export default LightweightChartWidget;