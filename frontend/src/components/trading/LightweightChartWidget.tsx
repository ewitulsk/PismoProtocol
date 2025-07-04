"use client";
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  createChart,
  ColorType,
  Time,
  CandlestickData,
  IChartApi,
  UTCTimestamp,
  LineStyle,
  CrosshairMode
} from 'lightweight-charts';
import { 
  priceFeedAggregatorService, 
  OHLCBarUpdate,
  PriceFeedAggregatorService 
} from '../../utils/priceFeedAggregator';

interface LightweightChartWidgetProps {
  priceFeedId: string;
  interval?: string;
}

const LightweightChartWidget: React.FC<LightweightChartWidgetProps> = ({
  priceFeedId,
  interval = '1', // Default to 1-minute interval
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<any>(null);
  const subscriptionRef = useRef<string | null>(null);
  const isInitializedRef = useRef(false);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastPrice, setLastPrice] = useState<number | null>(null);

  // Process priceFeedId to remove '0x' prefix if it exists
  const processedPriceFeedId = useMemo(() => 
    priceFeedId.startsWith('0x') ? priceFeedId.substring(2) : priceFeedId
  , [priceFeedId]);

  // Convert interval to OHLC format - memoized to prevent unnecessary recalculations
  const ohlcInterval = useMemo(() => {
    switch (interval) {
      case '10S': return '10s';
      case '1': return '1m';
      case '5': return '5m';
      case '15': return '15m';
      case '30': return '30m';
      case '60': return '1h';
      case '10s': case '1m': case '5m': case '15m': case '30m': case '1h':
        return interval;
      default:
        console.warn(`Unknown interval: ${interval}, defaulting to 1m`);
        return '1m';
    }
  }, [interval]);

  // Create subscription key for tracking
  const subscriptionKey = useMemo(() => 
    `${processedPriceFeedId}:${ohlcInterval}`
  , [processedPriceFeedId, ohlcInterval]);

  // Optimized historical data handler
  const handleHistoricalBars = useCallback((bars: OHLCBarUpdate[]) => {
    if (!candleSeriesRef.current || bars.length === 0) return;

    console.log(`[Chart] Processing ${bars.length} historical bars`);
    
    // Convert and sort bars in one pass
    const chartBars = bars
      .map(bar => ({
        ...PriceFeedAggregatorService.createBarFromOHLCUpdate(bar),
        time: PriceFeedAggregatorService.createBarFromOHLCUpdate(bar).time as Time
      } as CandlestickData<Time>))
      .sort((a, b) => Number(a.time) - Number(b.time))
      .filter((bar, index, self) => 
        index === 0 || Number(bar.time) > Number(self[index - 1].time)
      );

    try {
      candleSeriesRef.current.setData(chartBars);
      
      // Set visible range to show recent data
      if (chartRef.current && chartBars.length > 10) {
        const visibleBars = Math.max(Math.floor(chartBars.length * 0.4), 10);
        const startIndex = Math.max(0, chartBars.length - visibleBars);
        
        chartRef.current.timeScale().setVisibleRange({
          from: chartBars[startIndex].time,
          to: chartBars[chartBars.length - 1].time
        });
      }
      
      // Update last price
      if (chartBars.length > 0) {
        setLastPrice(chartBars[chartBars.length - 1].close);
      }
      
      setIsLoading(false);
      setError(null);
      
    } catch (error) {
      console.error('[Chart] Error setting historical bars:', error);
      setError('Failed to load chart data');
      setIsLoading(false);
    }
  }, []);

  // Optimized bar update handlers
  const handleBarUpdate = useCallback((update: OHLCBarUpdate) => {
    if (!candleSeriesRef.current) return;
    
    try {
      const bar = {
        ...PriceFeedAggregatorService.createBarFromOHLCUpdate(update),
        time: PriceFeedAggregatorService.createBarFromOHLCUpdate(update).time as Time
      } as CandlestickData<Time>;
      
      candleSeriesRef.current.update(bar);
      if (typeof update.close === 'number') {
        setLastPrice(update.close);
      }
    } catch (error) {
      console.error('[Chart] Error updating bar:', error);
    }
  }, []);

  // Unified message handler
  const handleMessage = useCallback((message: any) => {
    if (!message || !candleSeriesRef.current) return;
    
    switch (message.type) {
      case 'historical_bars':
        if (message.bars) {
          handleHistoricalBars(message.bars);
        }
        break;
      case 'new_bar':
      case 'bar_update':
        handleBarUpdate(message);
        break;
      case 'price_update':
        // Handle price updates if needed
        break;
      default:
        console.warn(`[Chart] Unknown message type: ${message.type}`);
    }
  }, [handleHistoricalBars, handleBarUpdate]);

  // Initialize chart once
  const initializeChart = useCallback(() => {
    if (!chartContainerRef.current || isInitializedRef.current) return;
    
    console.log('[Chart] Initializing chart');
    
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
        secondsVisible: ohlcInterval === '10s',
        borderColor: 'rgba(197, 203, 206, 0.8)',
        rightOffset: 5,
        barSpacing: 6,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(224, 227, 235, 0.4)',
          width: 1,
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: 'rgba(224, 227, 235, 0.4)',
          width: 1,
          style: LineStyle.Dashed,
        },
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    isInitializedRef.current = true;
    
    console.log('[Chart] Chart initialized successfully');
  }, [ohlcInterval]);

  // Handle resize
  const handleResize = useCallback(() => {
    if (chartRef.current && chartContainerRef.current) {
      chartRef.current.applyOptions({
        width: chartContainerRef.current.clientWidth
      });
    }
  }, []);

  // Main effect for chart initialization and subscription
  useEffect(() => {
    if (!chartContainerRef.current) return;
    
    // Initialize chart
    initializeChart();
    
    // Skip if already subscribed to the same feed
    if (subscriptionRef.current === subscriptionKey) {
      console.log('[Chart] Already subscribed to', subscriptionKey);
      return;
    }
    
    // Unsubscribe from previous subscription
    if (subscriptionRef.current) {
      const [prevFeed, prevInterval] = subscriptionRef.current.split(':');
      priceFeedAggregatorService.unsubscribeFromOHLCBars(prevFeed, prevInterval);
      subscriptionRef.current = null;
    }
    
    // Reset state for new subscription
    setIsLoading(true);
    setError(null);
    setLastPrice(null);
    
    // Clear existing chart data
    if (candleSeriesRef.current) {
      candleSeriesRef.current.setData([]);
    }
    
    // Subscribe to new feed
    console.log('[Chart] Subscribing to', subscriptionKey);
    
    const subscribe = async () => {
      try {
        const success = await priceFeedAggregatorService.subscribeToOHLCBars(
          processedPriceFeedId,
          ohlcInterval,
          handleMessage
        );
        
        if (success) {
          subscriptionRef.current = subscriptionKey;
          console.log('[Chart] Successfully subscribed to', subscriptionKey);
        } else {
          setError('Failed to subscribe to price feed');
          setIsLoading(false);
        }
      } catch (error) {
        console.error('[Chart] Subscription error:', error);
        setError('Error connecting to price feed');
        setIsLoading(false);
      }
    };
    
    subscribe();
    
    // Add resize listener
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      
      // Cleanup subscription
      if (subscriptionRef.current) {
        const [feed, interval] = subscriptionRef.current.split(':');
        priceFeedAggregatorService.unsubscribeFromOHLCBars(feed, interval);
        subscriptionRef.current = null;
      }
      
      // Cleanup chart
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
        isInitializedRef.current = false;
      }
    };
  }, [subscriptionKey, initializeChart, handleMessage, handleResize, processedPriceFeedId, ohlcInterval]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-primary">Loading chart...</div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div 
      ref={chartContainerRef} 
      className="w-full h-full" 
      style={{ minHeight: '100%', position: 'relative' }}
    />
  );
};

export default LightweightChartWidget;