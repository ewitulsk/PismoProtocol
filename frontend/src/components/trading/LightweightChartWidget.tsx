"use client";
import React, { useEffect, useRef, useState, useCallback } from 'react';
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

// Valid time intervals supported by the price feed service
const VALID_INTERVALS = ["1s", "10s", "30s", "1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"];

const LightweightChartWidget: React.FC<LightweightChartWidgetProps> = ({
  symbol = 'BTCUSD',
  interval = '60' // Default to 1-minute interval (60 seconds)
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [lastBar, setLastBar] = useState<CandlestickData<Time> | null>(null);
  const [historicalData, setHistoricalData] = useState<CandlestickData<Time>[]>([]);
  const [currentOhlcInterval, setCurrentOhlcInterval] = useState<string>('1m'); // Default to 1m
  
  // Track active subscriptions to prevent duplicate subscriptions
  const activeSubscriptionRef = useRef<{ symbol: string, interval: string } | null>(null);
  
  // Use refs to store chart and series objects to prevent recreation
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);

  // Convert seconds-based interval to OHLC service interval format
  const convertToOhlcInterval = useCallback((secondsInterval: string): string => {
    switch (secondsInterval) {
      case '1':     // 1 second
        return '1s';
      case '10':    // 10 seconds
        return '10s';  
      case '30':    // 30 seconds
        return '30s';
      case '60':    // 1 minute
        return '1m';
      case '300':   // 5 minutes
        return '5m';
      case '900':   // 15 minutes
        return '15m';
      case '1800':  // 30 minutes
        return '30m';
      case '3600':  // 1 hour
        return '1h';
      case '14400': // 4 hours
        return '4h';
      case '86400': // 1 day
        return '1d';
      case '604800': // 1 week
        return '1w';
      default:
        console.warn(`Unknown interval: ${interval}, defaulting to 1-minute`);
        return '1m';
    }
  }, []);

  // Handle historical OHLC bars received upon subscription
  const handleHistoricalBars = useCallback((bars: CandlestickData<Time>[]) => {
    if (!candleSeriesRef.current) return;
    
    console.log(`[LightweightChartWidget] Received ${bars.length} historical bars`);
    
    // Update state
    setHistoricalData(bars);
    
    // Set data on the chart
    if (bars.length > 0) {
      candleSeriesRef.current.setData(bars);
      
      // Fit content after loading historical data
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }
      
      // Update last bar
      setLastBar(bars[bars.length - 1]);
    }
  }, []);

  // Handle new OHLC bar (creates a new bar on the chart)
  const handleNewBar = useCallback((update: OHLCBarUpdate) => {
    if (!candleSeriesRef.current) return;
    
    try {
      console.log(`[LightweightChartWidget] Processing new OHLC bar for ${symbol}`, update);
      
      // Create a bar from the OHLC bar data
      const bar = PriceFeedAggregatorService.createBarFromOHLCUpdate(update);
      
      // Convert to the format expected by the chart
      const typedBar = {
        ...bar,
        time: bar.time as Time
      };
      
      // Update the chart
      candleSeriesRef.current.update(typedBar as CandlestickData<Time>);
      setLastBar(typedBar as CandlestickData<Time>);
      
      // Update the last price if available
      if (typeof update.close === 'number') {
        setLastPrice(update.close);
      }
    } catch (error) {
      console.error('[LightweightChartWidget] Error handling new OHLC bar:', error);
    }
  }, [symbol]);

  // Handle OHLC bar updates directly
  const handleOHLCBarUpdate = useCallback((update: OHLCBarUpdate) => {
    if (!candleSeriesRef.current) {
      console.warn("[LightweightChartWidget] Candle series ref is null, can't update chart");
      return;
    }
    
    try {
      // Check if this is a history message
      if (update.type === 'ohlc_history') {
        // Handle historical data
        if (update.bars && Array.isArray(update.bars) && update.bars.length > 0) {
          // Convert bars to chart format
          const chartBars = update.bars.map(bar => {
            const barData = PriceFeedAggregatorService.createBarFromOHLCUpdate(bar);
            return {
              ...barData,
              time: barData.time as Time
            } as CandlestickData<Time>;
          });
          
          // Process historical bars
          handleHistoricalBars(chartBars);
        }
        return;
      }
      
      // Check if this is a new bar
      if (update.type === 'new_bar') {
        handleNewBar(update.data);
        return;
      }
      
      // Handle regular bar update (updates the current bar)
      const confirmationStatus = update.confirmed ? 'confirmed' : 'update';
      console.log(`[LightweightChartWidget] Processing OHLC ${confirmationStatus} for ${symbol}, interval: ${currentOhlcInterval}`, update);
      
      // Create a bar from the OHLC bar data
      const bar = PriceFeedAggregatorService.createBarFromOHLCUpdate(update);
      
      // Convert to the format expected by the chart
      const typedBar = {
        ...bar,
        time: bar.time as Time
      };
      
      // Update the chart - only update for the interval we're currently displaying
      // Normalize intervals for more robust comparison
      const updateOHLCInterval = update.interval?.toLowerCase();
      const currInterval = currentOhlcInterval.toLowerCase();
      
      // Check if this update matches our interval
      const isMatch = updateOHLCInterval === currInterval;
      
      if (isMatch) {
        console.log(`[LightweightChartWidget] Updating chart with matching interval: ${updateOHLCInterval}`);
        candleSeriesRef.current.update(typedBar as CandlestickData<Time>);
        setLastBar(typedBar as CandlestickData<Time>);
      } else {
        console.log(`[LightweightChartWidget] Skipping update for non-matching interval: got ${updateOHLCInterval}, expected ${currInterval}`);
      }
      
      // Update the last price if available
      if (typeof update.close === 'number') {
        setLastPrice(update.close);
      }
    } catch (error) {
      console.error('[LightweightChartWidget] Error handling OHLC bar update:', error);
    }
  }, [symbol, currentOhlcInterval, handleHistoricalBars, handleNewBar]);

  // Handle polygon candle updates directly
  const handlePolygonCandleUpdate = useCallback((update: PolygonCandleUpdate) => {
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
  }, [symbol]);

  // Subscribe to price feeds
  const subscribeToFeeds = useCallback(async (symbol: string, ohlcInterval: string) => {
    console.log(`[LightweightChartWidget] Subscribing to feeds for ${symbol}, interval: ${ohlcInterval}`);
    
    // Update the current subscription reference
    activeSubscriptionRef.current = { symbol, interval: ohlcInterval };
    
    // Update the current interval in state
    setCurrentOhlcInterval(ohlcInterval);
    
    // Try to subscribe to OHLC bars first (these come from Pyth network)
    try {
      const success = await priceFeedAggregatorService.subscribeToOHLCBars(symbol, ohlcInterval, handleOHLCBarUpdate);
      
      if (!success && activeSubscriptionRef.current?.symbol === symbol && activeSubscriptionRef.current?.interval === ohlcInterval) {
        // Fallback to Polygon candles if OHLC subscription fails
        console.log("Falling back to Polygon candles...");
        return priceFeedAggregatorService.subscribeToPolygonCandles(symbol, handlePolygonCandleUpdate);
      }
      return success;
    } catch (err) {
      console.error(`Error subscribing to data feeds for ${symbol}:`, err);
      
      // Only try fallback if we're still on the same subscription
      if (activeSubscriptionRef.current?.symbol === symbol && activeSubscriptionRef.current?.interval === ohlcInterval) {
        // As a last resort, try to subscribe to Polygon candles if OHLC subscription throws an error
        try {
          return await priceFeedAggregatorService.subscribeToPolygonCandles(symbol, handlePolygonCandleUpdate);
        } catch (err2) {
          console.error(`Error subscribing to Polygon candles as fallback:`, err2);
          return false;
        }
      }
      return false;
    }
  }, [handleOHLCBarUpdate, handlePolygonCandleUpdate]);

  // Unsubscribe from current feeds
  const unsubscribeFromCurrentFeeds = useCallback(() => {
    const currentSub = activeSubscriptionRef.current;
    if (currentSub) {
      console.log(`[LightweightChartWidget] Unsubscribing from feeds for ${currentSub.symbol}, interval: ${currentSub.interval}`);
      
      // Unsubscribe from both data sources
      priceFeedAggregatorService.unsubscribeFromOHLCBars(currentSub.symbol, currentSub.interval);
      priceFeedAggregatorService.unsubscribeFromPolygonCandles(currentSub.symbol);
      
      // Clear the current subscription reference
      activeSubscriptionRef.current = null;
    }
  }, []);

  // Initialize chart
  const initializeChart = useCallback(() => {
    if (!chartContainerRef.current) return;
    
    // Clean up existing chart if it exists
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    }
    
    console.log('[LightweightChartWidget] Initializing chart');
    
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
    
    // Initialize with empty data
    setHistoricalData([]);
    candleSeries.setData([]);

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
  }, [interval]);

  // Handle resize
  const handleResize = useCallback(() => {
    if (chartRef.current && chartContainerRef.current) {
      chartRef.current.applyOptions({
        width: chartContainerRef.current.clientWidth || 600
      });
    }
  }, []);

  // Main effect to handle subscriptions based on symbol and interval changes
  useEffect(() => {
    if (!chartContainerRef.current) return;
    
    console.log(`[LightweightChartWidget] Symbol or interval changed: ${symbol}, ${interval}`);
    
    // Initialize chart
    initializeChart();
    
    // Convert the lightweight-chart interval (in seconds) to OHLC service interval format
    const ohlcInterval = convertToOhlcInterval(interval);
    
    // Unsubscribe from current feeds
    unsubscribeFromCurrentFeeds();
    
    // Subscribe to feeds with new symbol and interval
    subscribeToFeeds(symbol, ohlcInterval);
    
    // Handle window resize
    window.addEventListener('resize', handleResize);

    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize);
      
      // Unsubscribe from all data sources
      unsubscribeFromCurrentFeeds();
      
      // Clean up chart
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
      }
    };
  }, [symbol, interval, handleResize, initializeChart, subscribeToFeeds, unsubscribeFromCurrentFeeds, convertToOhlcInterval]);

  return (
    <div 
      ref={chartContainerRef} 
      className="w-full h-full" 
      style={{ minHeight: '100%', position: 'relative' }}
    />
  );
};

export default LightweightChartWidget;