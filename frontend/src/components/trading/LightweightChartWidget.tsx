"use client";
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  ColorType,
  Time,
  CandlestickData,
  LineData,
  ISeriesApi,
  SeriesType,
  IChartApi,
  UTCTimestamp,
  LineStyle,
  CrosshairMode
} from 'lightweight-charts';
import { 
  priceFeedAggregatorService, 
  OHLCBarUpdate,
  PriceFeedBarData, 
  PriceFeedAggregatorService 
} from '../../utils/priceFeedAggregator';

interface LightweightChartWidgetProps {
  priceFeedId: string;
  interval?: string;
}

// Valid time intervals supported by the price feed service
const VALID_INTERVALS = ["1s", "10s", "30s", "1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"];

// Example: Define a type for your price data points
interface PriceDataPoint {
  time: UTCTimestamp;
  value: number;
}

const LightweightChartWidget: React.FC<LightweightChartWidgetProps> = ({
  priceFeedId,
  interval = '60', // Default to 1-minute interval (60 seconds)
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [lastBar, setLastBar] = useState<CandlestickData<Time> | null>(null);
  const [historicalData, setHistoricalData] = useState<CandlestickData<Time>[]>([]);
  const [currentOhlcInterval, setCurrentOhlcInterval] = useState<string>('1m'); // Default to 1m
  
  // Track active subscriptions to prevent duplicate subscriptions
  const activeSubscriptionRef = useRef<{ symbol: string, interval: string } | null>(null);
  // Add a ref to track if we've already initialized the subscription
  const hasInitializedRef = useRef<boolean>(false);
  // Add a ref to store historical data to avoid dependency cycles
  const historicalDataRef = useRef<CandlestickData<Time>[]>([]);
  // Add a ref to track chart initialization state
  const isChartInitializedRef = useRef<boolean>(false);
  
  // Use refs to store chart and series objects to prevent recreation
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);

  // Process priceFeedId to remove '0x' prefix if it exists
  const processedPriceFeedId = priceFeedId.startsWith('0x') ? priceFeedId.substring(2) : priceFeedId;

  // Convert interval from TimeFrameSelector format to OHLC service interval format
  const convertToOhlcInterval = useCallback((timeframeValue: string): string => {
    switch (timeframeValue) {
      // Second-based intervals
      case '1S':
        return '1s';
      case '10S':
        return '10s';  
      case '30S':
        return '30s';
      
      // Minute-based intervals
      case '1':     // 1 minute
        return '1m';
      case '5':     // 5 minutes
        return '5m';
      case '15':    // 15 minutes
        return '15m';
      case '30':    // 30 minutes
        return '30m';
      
      // Hour-based intervals
      case '60':    // 1 hour (not 1 minute!)
        return '1h';
      case '240':   // 4 hours
        return '4h';
      
      // Day/Week/Month intervals
      case '1D':    // 1 day
        return '1d';
      case '1W':    // 1 week
        return '1w';
      case '1M':    // 1 month
        return '1M';
        
      // If the provided value is already in the correct format, return it
      case '1s': case '10s': case '30s': case '1m': case '5m': 
      case '15m': case '30m': case '1h': case '4h': case '1d': 
      case '1w': case '1M':
        return timeframeValue;
        
      default:
        console.warn(`Unknown interval: ${timeframeValue}, defaulting to 1-minute`);
        return '1m';
    }
  }, []);

  // Handle historical OHLC bars received upon subscription
  const handleHistoricalBars = useCallback((bars: OHLCBarUpdate[]) => {
    if (!candleSeriesRef.current) {
      console.warn('[LightweightChartWidget] Cannot handle historical bars, chart series not initialized');
      return;
    }

    console.log(`[LightweightChartWidget] Processing ${bars.length} historical bars`);
    
    if (bars.length === 0) {
      console.warn('[LightweightChartWidget] No historical bars to process');
      return;
    }
    
    // Convert OHLC bar updates to chart-compatible format
    const chartBars = bars.map(bar => {
      const chartBar = PriceFeedAggregatorService.createBarFromOHLCUpdate(bar);
      return {
        ...chartBar,
        time: chartBar.time as Time
      } as CandlestickData<Time>;
    });
    
    // Sort bars by time
    const sortedBars = [...chartBars].sort((a, b) => {
      const timeA = typeof a.time === 'number' ? a.time : Number(a.time);
      const timeB = typeof b.time === 'number' ? b.time : Number(b.time);
      return timeA - timeB;
    });
    
    // Update state and ref
    setHistoricalData(sortedBars);
    historicalDataRef.current = sortedBars;
    
    // Set data on the chart
    try {
      // Replace all existing data with the historical data
      candleSeriesRef.current.setData(sortedBars);
      
      // Fit content after loading historical data
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }
      
      // Update last bar
      if (sortedBars.length > 0) {
        setLastBar(sortedBars[sortedBars.length - 1]);
        
        // Update last price
        if (sortedBars[sortedBars.length - 1]?.close) {
          setLastPrice(sortedBars[sortedBars.length - 1].close);
        }
      }
      
      console.log(`[LightweightChartWidget] Successfully loaded ${sortedBars.length} historical bars`);
    } catch (error) {
      console.error('[LightweightChartWidget] Error setting historical bars on chart:', error);
    }
  }, []);

  // Handle new OHLC bar (creates a new bar on the chart)
  const handleNewBar = useCallback((update: OHLCBarUpdate) => {
    if (!candleSeriesRef.current) {
      console.warn('[LightweightChartWidget] Cannot handle new bar, chart series not initialized');
      return;
    }
    
    try {
      // Create a bar from the OHLC bar data
      const bar = PriceFeedAggregatorService.createBarFromOHLCUpdate(update);
      
      // Convert to the format expected by the chart
      const typedBar = {
        ...bar,
        time: bar.time as Time
      } as CandlestickData<Time>;
      
      // Update the chart
      candleSeriesRef.current.update(typedBar);
      setLastBar(typedBar);
      
      // Update the last price if available
      if (typeof update.close === 'number') {
        setLastPrice(update.close);
      }
    } catch (error) {
      console.error('[LightweightChartWidget] Error handling new OHLC bar:', error);
    }
  }, []);

  // Handle bar update (updates an existing bar on the chart)
  const handleBarUpdate = useCallback((update: OHLCBarUpdate) => {
    if (!candleSeriesRef.current) {
      console.warn('[LightweightChartWidget] Cannot handle bar update, chart series not initialized');
      return;
    }
    
    try {
      // Create a bar from the OHLC bar data
      const bar = PriceFeedAggregatorService.createBarFromOHLCUpdate(update);
      
      // Convert to the format expected by the chart
      const typedBar = {
        ...bar,
        time: bar.time as Time
      } as CandlestickData<Time>;
      
      // Update the chart with the updated bar
      candleSeriesRef.current.update(typedBar);
      setLastBar(typedBar);
      
      // Update the last price if available
      if (typeof update.close === 'number') {
        setLastPrice(update.close);
      }
    } catch (error) {
      console.error('[LightweightChartWidget] Error handling bar update:', error);
    }
  }, []);

  // Handle OHLC bar updates directly
  const handleOHLCBarUpdate = useCallback((update: OHLCBarUpdate & {type?: string, data?: OHLCBarUpdate, bars?: OHLCBarUpdate[]}) => {
    if (!candleSeriesRef.current) {
      console.warn('[LightweightChartWidget] Cannot handle update, chart series not initialized');
      return;
    }
    
    try {
      // Check if this is a price update message (ignore it)
      if (update.type === 'price_update') {
        // We're not doing anything with price updates at the moment
        return;
      }
      
      // Check if this is a historical bars message
      if (update.type === 'historical_bars' && update.bars) {
        console.log(`[LightweightChartWidget] Received historical bars: ${update.bars.length}`);
        handleHistoricalBars(update.bars);
        return;
      }
      
      // Check if this is a new bar message
      if (update.type === 'new_bar') {
        handleNewBar(update);
        return;
      }
      
      // Check if this is a bar update message
      if (update.type === 'bar_update') {
        handleBarUpdate(update);
        return;
      }
      
      // If we get here, it's an unknown update type
      console.warn(`[LightweightChartWidget] Unknown update type: ${update.type || 'undefined'}`);
      
    } catch (error) {
      console.error('[LightweightChartWidget] Error handling OHLC bar update:', error, update);
    }
  }, [handleHistoricalBars, handleNewBar, handleBarUpdate]);

  // Subscribe to price feeds
  const subscribeToFeeds = useCallback(async (feedId: string, ohlcInterval: string) => {
    // Check if we're already subscribed to this exact symbol and interval
    const currentSub = activeSubscriptionRef.current;
    if (currentSub && currentSub.symbol === feedId && currentSub.interval === ohlcInterval) {
      return true;
    }
    
    // Update the current subscription reference
    activeSubscriptionRef.current = { symbol: feedId, interval: ohlcInterval };
    
    // Update the current interval in state
    setCurrentOhlcInterval(ohlcInterval);
    
    // Subscribe to OHLC bars (these come from Pyth network)
    try {
      console.log(`[LightweightChartWidget] Subscribing to ${feedId} with interval ${ohlcInterval}`);
      const success = await priceFeedAggregatorService.subscribeToOHLCBars(feedId, ohlcInterval, handleOHLCBarUpdate);
      return success;
    } catch (err) {
      console.error('[LightweightChartWidget] Error subscribing to OHLC bars:', err);
      return false;
    }
  }, [handleOHLCBarUpdate]);

  // Unsubscribe from current feeds
  const unsubscribeFromCurrentFeeds = useCallback(() => {
    const currentSub = activeSubscriptionRef.current;
    if (currentSub) {
      // Unsubscribe from OHLC bars
      priceFeedAggregatorService.unsubscribeFromOHLCBars(currentSub.symbol, currentSub.interval);
      
      // Clear the current subscription reference
      activeSubscriptionRef.current = null;
    }
  }, []);

  // Initialize chart
  const initializeChart = useCallback(() => {
    if (!chartContainerRef.current) return;
    
    // Prevent multiple initializations
    if (isChartInitializedRef.current && chartRef.current) {
      console.log('[LightweightChartWidget] Chart already initialized, skipping initialization');
      return;
    }
    
    // Clean up existing chart if it exists
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      isChartInitializedRef.current = false;
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
    
    // Mark chart as initialized
    isChartInitializedRef.current = true;
    
    console.log('[LightweightChartWidget] Chart initialized successfully');
    
    // Initialize with empty data
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
    
    // If we have historical data already, set it now
    const cachedData = historicalDataRef.current;
    if (cachedData.length > 0) {
      console.log(`[LightweightChartWidget] Setting ${cachedData.length} cached historical bars after chart init`);
      
      // Sort the data by time
      const sortedData = [...cachedData].sort((a, b) => {
        const timeA = typeof a.time === 'number' ? a.time : Number(a.time);
        const timeB = typeof b.time === 'number' ? b.time : Number(b.time);
        return timeA - timeB;
      });
      
      // Set the data on the chart
      candleSeries.setData(sortedData);
      
      // Fit content to show all data
      chart.timeScale().fitContent();
      
      console.log('[LightweightChartWidget] Successfully set cached historical bars on chart');
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

  // Effect for chart initialization and cleanup
  useEffect(() => {
    if (!chartContainerRef.current) return;
    
    // Initialize chart only once
    if (!isChartInitializedRef.current) {
      initializeChart();
    }
    
    // Handle window resize
    window.addEventListener('resize', handleResize);

    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize);
      
      // Clean up chart
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
        isChartInitializedRef.current = false;
      }
    };
  }, [handleResize, initializeChart]);
  
  // Effect for subscription management - run only after chart is initialized
  useEffect(() => {
    if (!chartContainerRef.current || !candleSeriesRef.current) {
      console.log('[LightweightChartWidget] Chart not initialized yet, skipping subscription');
      return;
    }
    
    const ohlcInterval = convertToOhlcInterval(interval);
    
    // Use priceFeedId for subscription
    const subscriptionIdentifier = processedPriceFeedId;

    const currentSub = activeSubscriptionRef.current;
    const isSameSubscription = currentSub && 
                              currentSub.symbol === subscriptionIdentifier && 
                              currentSub.interval === ohlcInterval;
    
    if (!isSameSubscription) {
      console.log(`[LightweightChartWidget] Subscription changed from ${currentSub?.symbol}/${currentSub?.interval} to ${subscriptionIdentifier}/${ohlcInterval}`);
      
      unsubscribeFromCurrentFeeds();
      
      console.log('[LightweightChartWidget] Clearing historical data for new subscription');
      setHistoricalData([]);
      historicalDataRef.current = [];
      
      if (candleSeriesRef.current) {
        console.log('[LightweightChartWidget] Clearing chart data for new subscription');
        candleSeriesRef.current.setData([]);
      }
      
      // Subscribe using the determined identifier (preferably priceFeedId)
      console.log(`[LightweightChartWidget] Subscribing to ${subscriptionIdentifier} with interval ${ohlcInterval}`);
      subscribeToFeeds(subscriptionIdentifier, ohlcInterval)
        .then(success => {
          if (success) {
            console.log(`[LightweightChartWidget] Successfully subscribed to ${subscriptionIdentifier} with interval ${ohlcInterval}`);
            // setIsLoading(false); // Aggregator might handle its own loading state
          } else {
            console.error(`[LightweightChartWidget] Failed to subscribe to ${subscriptionIdentifier} with interval ${ohlcInterval}`);
            // setError(`Failed to subscribe to ${subscriptionIdentifier}`);
            // setIsLoading(false);
          }
        })
        .catch(error => {
          console.error(`[LightweightChartWidget] Error subscribing to ${subscriptionIdentifier} with interval ${ohlcInterval}:`, error);
          // setError(`Error subscribing: ${error.message}`);
          // setIsLoading(false);
        });
    }
    
  }, [processedPriceFeedId, interval, subscribeToFeeds, unsubscribeFromCurrentFeeds, convertToOhlcInterval]); // Use priceFeedId in dependencies
  
  // Effect for component unmount cleanup
  useEffect(() => {
    // Cleanup function for component unmount
    return () => {
      console.log('[LightweightChartWidget] Component unmounting, cleaning up subscriptions');
      
      // Unsubscribe from feeds
      unsubscribeFromCurrentFeeds();
    };
  }, [unsubscribeFromCurrentFeeds]);

  return (
    <div 
      ref={chartContainerRef} 
      className="w-full h-full" 
      style={{ minHeight: '100%', position: 'relative' }}
    />
  );
};

export default LightweightChartWidget;