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
import { 
  priceFeedAggregatorService, 
  PriceUpdate, 
  PolygonCandleUpdate,
  OHLCBarUpdate,
  PriceFeedBarData, 
  PriceFeedAggregatorService 
} from '../../utils/priceFeedAggregator';

interface LightweightChartWidgetProps {
  symbol?: string;
  interval?: string;
}

const LightweightChartWidget: React.FC<LightweightChartWidgetProps> = ({
  symbol = 'BTCUSD',
  interval = '60' // Default to 1-minute interval (60 seconds)
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [lastBar, setLastBar] = useState<CandlestickData<Time> | null>(null);
  const [historicalData, setHistoricalData] = useState<CandlestickData<Time>[]>([]);
  const [priceLineData, setPriceLineData] = useState<LineData[]>([]);
  const [ohlcInterval, setOhlcInterval] = useState<string>('1m'); // Default to 1m
  
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

  // Handle polygon candle updates directly
  const handlePolygonCandleUpdate = (update: PolygonCandleUpdate) => {
    if (!candleSeriesRef.current) return;
    
    try {
      console.log(`[LightweightChartWidget] Processing Polygon candle for ${symbol}`, update);
      
      // Create a bar from the Polygon candle data
      const bar = PriceFeedAggregatorService.createBarFromPolygonCandle(update);
      
      // Convert to the format expected by the chart
      const typedBar = {
        ...bar,
        time: bar.time as Time
      };
      
      // Log the bar we're going to add
      console.log(`[LightweightChartWidget] Polygon bar created:`, 
                  JSON.stringify({
                    time: typedBar.time, 
                    open: typedBar.open, 
                    high: typedBar.high, 
                    low: typedBar.low, 
                    close: typedBar.close
                  })
      );
      
      // Update the chart - for Polygon updates, we always apply them as they're 
      // already filtered by subscription
      candleSeriesRef.current.update(typedBar as CandlestickData<Time>);
      setLastBar(typedBar as CandlestickData<Time>);
      
      // Update the last price if available
      if (typeof update.close === 'number') {
        setLastPrice(update.close);
      }
    } catch (error) {
      console.error('[LightweightChartWidget] Error handling Polygon candle update:', error);
    }
  };
  
  // Handle OHLC bar updates directly
  const handleOHLCBarUpdate = (update: OHLCBarUpdate) => {
    if (!candleSeriesRef.current) {
      console.warn("[LightweightChartWidget] Candle series ref is null, can't update chart");
      return;
    }
    
    try {
      // Safely check confirmed status with optional chaining
      const confirmationStatus = update?.confirmed ? 'confirmed' : 'update';
      console.log(`[LightweightChartWidget] Processing OHLC ${confirmationStatus} for ${symbol}, interval: ${interval}`, update);
      
      // Create a bar from the OHLC bar data
      const bar = PriceFeedAggregatorService.createBarFromOHLCUpdate(update);
      console.log(`[LightweightChartWidget] Converted to bar format:`, bar);
      
      // Convert to the format expected by the chart
      const typedBar = {
        ...bar,
        time: bar.time as Time
      };
      
      // Log before updating
      console.log(`[LightweightChartWidget] Updating chart with bar:`, 
                  JSON.stringify({
                    time: typedBar.time, 
                    open: typedBar.open, 
                    high: typedBar.high, 
                    low: typedBar.low, 
                    close: typedBar.close
                  })
      );
      
      // Update the chart - only update for the interval we're currently displaying
      // Normalize intervals for more robust comparison
      const updateOHLCInterval = update.interval?.toLowerCase();
      const currentOHLCInterval = ohlcInterval.toLowerCase();
      
      // Check if this update matches our interval with special handling for 1m/60s
      const isMatch = updateOHLCInterval === currentOHLCInterval || 
                     (updateOHLCInterval === '1m' && currentOHLCInterval === '60s') ||
                     (updateOHLCInterval === '60s' && currentOHLCInterval === '1m');
      
      if (isMatch) {
        console.log(`[LightweightChartWidget] Updating chart with matching interval: ${updateOHLCInterval} matches ${currentOHLCInterval}`);
        candleSeriesRef.current.update(typedBar as CandlestickData<Time>);
        setLastBar(typedBar as CandlestickData<Time>);
      } else {
        console.log(`[LightweightChartWidget] Skipping update for non-matching interval: got ${updateOHLCInterval}, expected ${currentOHLCInterval}`);
      }
      
      // Update the last price if available
      if (typeof update.close === 'number') {
        setLastPrice(update.close);
      }
    } catch (error) {
      console.error('[LightweightChartWidget] Error handling OHLC bar update:', error);
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

    // Initialize chart with optimizations for the selected interval
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
        secondsVisible: parseInt(interval) < 300, // Show seconds for intervals less than 5 minutes
        borderColor: 'rgba(197, 203, 206, 0.8)',
        tickMarkFormatter: (time: any) => {
          const date = new Date(time * 1000);
          const hours = date.getHours().toString().padStart(2, '0');
          const minutes = date.getMinutes().toString().padStart(2, '0');
          
          // For 1-minute chart, use HH:MM format
          if (interval === '60') {
            return `${hours}:${minutes}`;
          }
          
          // For other intervals, include date if needed
          return `${hours}:${minutes}`;
        },
      },
      crosshair: {
        // Improve crosshair visibility
        mode: 1, // CrosshairMode.Normal
        vertLine: {
          color: 'rgba(224, 227, 235, 0.4)',
          width: 1,
          style: 1, // LineStyle.Dashed
          visible: true,
          labelVisible: true,
        },
        horzLine: {
          color: 'rgba(224, 227, 235, 0.4)',
          width: 1,
          style: 1, // LineStyle.Dashed
          visible: true,
          labelVisible: true,
        },
      },
    });
    chartRef.current = chart;

    // Create and style the candlestick series, optimized for the selected interval
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      // Optimize visual appearance based on interval
      priceFormat: {
        type: 'price',
        precision: 2,  // Number of decimal places
        minMove: 0.01, // Minimum price movement
      },
      // Show more price labels for 1-minute charts
      priceLineVisible: true,
      lastValueVisible: true,
      priceLineWidth: 1,
      priceLineColor: '#4682B4',
      priceLineStyle: 1, // LineStyle.Dashed
    });
    candleSeriesRef.current = candleSeries;
    
    // Initialize with sample data
    const initialData = generateInitialData();
    setHistoricalData(initialData);
    candleSeries.setData(initialData);

    // Configure time scale for optimal viewing
    if (interval === '60') {
      // For 1-minute charts, show more recent data with some visible history
      chart.timeScale().applyOptions({
        rightOffset: 5,  // Space on the right side of the chart
        barSpacing: 6,   // Space between bars (adjust based on screen size)
        minBarSpacing: 4, // Minimum space between bars
        fixLeftEdge: true, // Don't allow scrolling too far into the past
        lockVisibleTimeRangeOnResize: true, // Keep the visible time range on resize
        rightBarStaysOnScroll: true, // Keep the latest bar visible
        visible: true,
      });
    } else {
      // For other intervals, fit all content
      chart.timeScale().fitContent();
    }

    // Subscribe to OHLC bars (from Pyth network) and/or Polygon candles based on availability
    console.log(`The chart is subscribing to OHLC bars for ${symbol}, interval: ${interval}...`);
    
    // Map lightweight-chart interval (in seconds) to OHLC service interval format
    let ohlcInterval: string;
    
    switch (interval) {
      case '60':    // 1 minute
        ohlcInterval = '1m';
        break;
      case '300':   // 5 minutes
        ohlcInterval = '5m';
        break;
      case '900':   // 15 minutes
        ohlcInterval = '15m';
        break;
      case '1800':  // 30 minutes
        ohlcInterval = '30m';
        break;
      case '3600':  // 1 hour
        ohlcInterval = '1h';
        break;
      case '14400': // 4 hours
        ohlcInterval = '4h';
        break;
      case '86400': // 1 day
        ohlcInterval = '1d';
        break;
      default:
        // Default to 1-minute interval if unknown
        console.warn(`Unknown interval: ${interval}, defaulting to 1-minute`);
        ohlcInterval = '1m';
    }
                         
    console.log(`LightweightChartWidget: Using symbol=${symbol} with interval=${ohlcInterval} (from ${interval} seconds)`);
                         
    // Try to subscribe to OHLC bars first (these come from Pyth network)
    priceFeedAggregatorService.subscribeToOHLCBars(symbol, ohlcInterval, handleOHLCBarUpdate)
      .then(success => {
        if (!success) {
          // Fallback to Polygon candles if OHLC subscription fails
          console.log("Falling back to Polygon candles...");
          return priceFeedAggregatorService.subscribeToPolygonCandles(symbol, handlePolygonCandleUpdate);
        }
        return success;
      })
      .catch(err => {
        console.error(`Error subscribing to data feeds for ${symbol}:`, err);
        // As a last resort, try to subscribe to Polygon candles if OHLC subscription throws an error
        priceFeedAggregatorService.subscribeToPolygonCandles(symbol, handlePolygonCandleUpdate)
          .catch(err2 => console.error(`Error subscribing to Polygon candles as fallback:`, err2));
      });

    // Handle window resize
    window.addEventListener('resize', handleResize);

    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize);
      
      // Unsubscribe from both data sources
      priceFeedAggregatorService.unsubscribeFromOHLCBars(symbol, ohlcInterval);
      priceFeedAggregatorService.unsubscribeFromPolygonCandles(symbol);
      
      // Clean up chart
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
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