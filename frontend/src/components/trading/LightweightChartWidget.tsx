"use client";
import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  Time,
  CandlestickData,
  LineData,
  ISeriesApi,
  SeriesType
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
  const [priceLineData, setPriceLineData] = useState<LineData[]>([]);
  
  // Use refs to store chart and series objects to prevent recreation
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  // const realTimePriceLineRef = useRef<any>(null);

  // Generate initial sample data
  const generateInitialData = (): CandlestickData<Time>[] => {
    // const now = Math.floor(Date.now() / 1000);
    const data: CandlestickData<Time>[] = [];
    
    // // Create sample data for the last 50 periods based on interval
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

  // Handle price updates without recreating the chart
  const handlePriceUpdate = (update: PriceUpdate) => {
    const price = update.price;
    setLastPrice(price);
    
    console.log(`[LightweightChartWidget] Processing update for ${symbol}: $${price.toFixed(2)}`);

    // Get current time from the update
    const time = Math.floor(new Date(update.timestamp).getTime() / 1000) as Time;

    // Handle OHLC data if available
    if (update.polygon_data && candleSeriesRef.current) {
      const bar = PriceFeedAggregatorService.createBarFromUpdate(update);
      if (bar) {
        const typedBar = {
          ...bar,
          time: bar.time as Time
        };
        candleSeriesRef.current.update(typedBar as CandlestickData<Time>);
        setLastBar(typedBar as CandlestickData<Time>);
      }
    } else if (lastBar && candleSeriesRef.current) {
      // Update the last bar with the new price
      const updatedBar = { ...lastBar };
      
      // Calculate the interval in seconds
      const intervalInSeconds = parseInt(interval) || 60;
      
      // Determine if we should create a new bar based on time difference
      const lastBarTime = typeof lastBar.time === 'number' ? lastBar.time : parseInt(lastBar.time.toString());
      const currentTime = typeof time === 'number' ? time : parseInt(time.toString());
      
      // Check if we've moved to a new interval
      const isNewInterval = Math.floor(currentTime / intervalInSeconds) > Math.floor(lastBarTime / intervalInSeconds);
      
      console.log(`Time check: current=${currentTime}, last=${lastBarTime}, interval=${intervalInSeconds}, isNew=${isNewInterval}`);
      
      if (!isNewInterval) {
        // Update existing bar
        updatedBar.close = price;
        updatedBar.high = Math.max(lastBar.high, price);
        updatedBar.low = Math.min(lastBar.low, price);
        
        candleSeriesRef.current.update(updatedBar);
        setLastBar(updatedBar);
      } else {
        // Create a new bar for the new time interval
        const newBar = {
          time: currentTime as Time,
          open: price,
          high: price,
          low: price,
          close: price
        };
        
        candleSeriesRef.current.update(newBar);
        setLastBar(newBar);
      }
    } else if (candleSeriesRef.current) {
      // Create a new bar from just the price
      const partialBar = PriceFeedAggregatorService.createPartialBar(update);
      const typedBar = {
        ...partialBar,
        time: partialBar.time as Time
      };
      candleSeriesRef.current.update(typedBar as CandlestickData<Time>);
      setLastBar(typedBar as CandlestickData<Time>);
    }
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const handleResize = () => {
      if (chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current?.clientWidth || 600
        });
      }
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
    chartRef.current = chart;

    // Create and style the candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    candleSeriesRef.current = candleSeries;
    
    // Initialize with sample data
    const initialData = generateInitialData();
    setHistoricalData(initialData);
    candleSeries.setData(initialData);

    // Fit content to show all data
    chart.timeScale().fitContent();

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
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
        // realTimePriceLineRef.current = null;
      }
    };
  }, [symbol, interval]); // Removed lastBar from dependencies

  return (
    <div 
      ref={chartContainerRef} 
      className="w-full h-full" 
      style={{ minHeight: '100%', position: 'relative' }}
    />
  );
};

export default LightweightChartWidget;