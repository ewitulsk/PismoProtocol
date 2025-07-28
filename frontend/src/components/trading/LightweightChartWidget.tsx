"use client";
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  ColorType,
  Time,
  CandlestickData,
  IChartApi,
  CrosshairMode
} from 'lightweight-charts';
import { 
  chartBuilderService,
  ChartBuilderService,
  ChartBarUpdate
} from '../../utils/chartBuilderService';

interface LightweightChartWidgetProps {
  priceFeedIdBytes: string;
  interval?: string;
}

const LightweightChartWidget: React.FC<LightweightChartWidgetProps> = ({
  priceFeedIdBytes,
  interval = '1m', // Default to 1-minute interval
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<any>(null);
  const [lastBar, setLastBar] = useState<CandlestickData<Time> | null>(null);

  const convertToOhlcInterval = useCallback((timeframeValue: string): string => {
    let result: string;
    // console.log(`[ChartWidget] Converting interval: ${timeframeValue}`);
    switch (timeframeValue) {
      case '10S': 
        result = '10s';
        break;
      case '1':
        result = '1m';
        break;
      case '5':
        result = '5m';
        break;
      case '15':
        result = '15m';
        break;
      case '30':
        result = '30m';
        break;
      case '60':
        result = '1h';
        break;
      default:
        console.warn(`[ChartWidget] Unknown interval: ${timeframeValue}, defaulting to 1m`);
        result = '1m';
    }
    return result;
  }, []);

  const handleHistoricalBars = useCallback((bars: ChartBarUpdate[]) => {
    // console.log(`[ChartWidget] handleHistoricalBars called with ${bars.length} bars for asset: ${assetId}`);
    if (!candleSeriesRef.current) {
        console.warn('[ChartWidget] handleHistoricalBars: candleSeriesRef is not ready.');
        return;
    }

    const chartBars = bars.map(bar => {
      const chartBar = ChartBuilderService.createBarFromChartUpdate(bar);
      return {
        ...chartBar,
        time: chartBar.time as Time
      } as CandlestickData<Time>;
    });

    const sortedBars = [...chartBars].sort((a, b) => (a.time as number) - (b.time as number));
    
    const uniqueBars = sortedBars.filter((bar, index, self) => {
        if (index === 0) return true;
        const prevBar = self[index - 1];
        return (bar.time as number) > (prevBar.time as number);
    });

    if (uniqueBars.length > 0) {
        // console.log(`[ChartWidget] Applying ${uniqueBars.length} unique historical bars to chart.`);
        candleSeriesRef.current.setData(uniqueBars);
        setLastBar(uniqueBars[uniqueBars.length - 1]);

        if (chartRef.current) {
            const totalBars = uniqueBars.length;
            const visibleBars = Math.max(Math.floor(totalBars * 0.40), 10);
            const startIndex = Math.max(0, totalBars - visibleBars);
            
            if (startIndex < totalBars - 1) {
              const startTime = uniqueBars[startIndex].time;
              const endTime = uniqueBars[totalBars - 1].time;
              
              chartRef.current.timeScale().setVisibleRange({
                from: startTime as Time,
                to: endTime as Time
              });
            }
        }
    } else {
      console.log('[ChartWidget] No unique historical bars to apply.');
    }
  }, [priceFeedIdBytes]);

  const handleBarUpdate = useCallback((update: ChartBarUpdate) => {
    // console.log(`[ChartWidget] handleBarUpdate called for asset: ${update.asset_id}, time_scale: ${update.time_scale}`, update);
    if (!candleSeriesRef.current) {
      console.warn('[ChartWidget] handleBarUpdate: candleSeriesRef is not ready.');
      return;
    }
    
    const bar = ChartBuilderService.createBarFromChartUpdate(update);
    const typedBar = {
      ...bar,
      time: bar.time as Time
    } as CandlestickData<Time>;
    
    // console.log('[ChartWidget] Updating chart with new bar:', typedBar);
    candleSeriesRef.current.update(typedBar);
    setLastBar(typedBar);
  }, []);

  useEffect(() => {
    console.log('[ChartWidget] Chart creation effect fired. chartContainerRef.current:', chartContainerRef.current);
    if (!chartContainerRef.current) {
      console.log('[ChartWidget] chartContainerRef.current is null at effect start.');
      return;
    }

    console.log('[ChartWidget] Creating new chart instance.');
    chartRef.current = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
        layout: {
            background: { type: ColorType.Solid, color: '#1a1a1a' },
            textColor: '#d1d4dc',
        },
        grid: {
            vertLines: { color: '#2a2a2a' },
            horzLines: { color: '#2a2a2a' },
        },
        crosshair: {
            mode: CrosshairMode.Normal,
        },
        rightPriceScale: {
            borderColor: '#4a4a4a',
        },
        timeScale: {
            borderColor: '#4a4a4a',
            timeVisible: true,
            secondsVisible: true,
        },
    });

    candleSeriesRef.current = chartRef.current.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderDownColor: '#ef5350',
        borderUpColor: '#26a69a',
        wickDownColor: '#ef5350',
        wickUpColor: '#26a69a',
    });

    const handleResize = () => {
        if (chartRef.current && chartContainerRef.current) {
            chartRef.current.resize(chartContainerRef.current.clientWidth, chartContainerRef.current.clientHeight);
        }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      console.log('[ChartWidget] Chart creation effect cleanup (unmount).');
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
          chartRef.current.remove();
      }
    };
  }, []);

  useEffect(() => {
    console.log('[ChartWidget] Subscription effect fired. assetId:', priceFeedIdBytes, 'interval:', interval);
    const ohlcInterval = convertToOhlcInterval(interval || '1m');
    console.log('[ChartWidget] Subscription effect ohlcInterval:', ohlcInterval);
    let isSubscribed = true;
    chartBuilderService.connect().then(connected => {
      if (connected && isSubscribed) {
        console.log(`[ChartWidget] Connection successful. Subscribing to ${priceFeedIdBytes}/${ohlcInterval}`);
        chartBuilderService.subscribeToBarUpdates(
          priceFeedIdBytes,
          ohlcInterval,
          handleBarUpdate,
          handleHistoricalBars
        );
      } else if (!isSubscribed) {
        console.log('[ChartWidget] Component unmounted before connection was established.');
      } else {
        console.error('[ChartWidget] Failed to connect to chartBuilderService.');
      }
    });

    return () => {
      console.log(`[ChartWidget] Subscription effect cleanup (unmount). assetId:`, priceFeedIdBytes, 'interval:', interval);
      chartBuilderService.unsubscribeFromBarUpdates(
        priceFeedIdBytes,
        ohlcInterval,
        handleBarUpdate,
        handleHistoricalBars
      );
    };
  }, [priceFeedIdBytes, interval, convertToOhlcInterval, handleHistoricalBars, handleBarUpdate]);

  return (
    <div ref={chartContainerRef} className="w-full h-full relative">
      {lastBar && (
        <div className="absolute top-2 left-2 z-10 text-white text-sm">
          <div>O: {lastBar.open.toFixed(2)} H: {lastBar.high.toFixed(2)} L: {lastBar.low.toFixed(2)} C: {lastBar.close.toFixed(2)}</div>
        </div>
      )}
    </div>
  );
};

export default LightweightChartWidget;