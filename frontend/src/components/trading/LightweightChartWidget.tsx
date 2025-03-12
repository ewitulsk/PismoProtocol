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

  // Handle polygon candle updates directly
  const handlePolygonCandleUpdate = (update: PolygonCandleUpdate) => {
    if (!candleSeriesRef.current) return;
    
    try {
      console.log(`[LightweightChartWidget] Processing Polygon candle for ${symbol}`);
      
      // Create a bar from the Polygon candle data
      const bar = PriceFeedAggregatorService.createBarFromPolygonCandle(update);
      
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
      console.error('[LightweightChartWidget] Error handling Polygon candle update:', error);
    }
  };
  
  // Handle OHLC bar updates directly
  const handleOHLCBarUpdate = (update: OHLCBarUpdate) => {
    if (!candleSeriesRef.current) return;
    
    try {
      // Safely check confirmed status with optional chaining
      const confirmationStatus = update?.confirmed ? 'confirmed' : 'update';
      console.log(`[LightweightChartWidget] Processing OHLC ${confirmationStatus} for ${symbol}, interval: ${interval}`);
      
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

    // Subscribe to OHLC bars (from Pyth network) and/or Polygon candles based on availability
    console.log(`The chart is subscribing to OHLC bars for ${symbol}, interval: ${interval}...`);
    
    // Map lightweight-chart interval to OHLC service interval
    const ohlcInterval = interval === '60' ? '1m' : 
                         interval === '300' ? '5m' : 
                         interval === '900' ? '15m' : 
                         interval === '1800' ? '30m' : 
                         interval === '3600' ? '1h' : 
                         interval === '14400' ? '4h' : 
                         interval === '86400' ? '1d' : '1m';
                         
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