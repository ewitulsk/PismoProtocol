"use client";
import { useEffect, useRef, useState } from 'react';
import { pythPriceFeedService } from '@/utils/pythPriceFeed';

interface TradingViewWidgetProps {
  symbol?: string;
  interval?: string;
}

interface BarData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export default function TradingViewWidget({ 
  symbol = 'BTCUSD', 
  interval = '60' 
}: TradingViewWidgetProps) {
  const container = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);
  const lastPriceRef = useRef<number | null>(null);
  const lastBarRef = useRef<BarData | null>(null);
  
  // Convert interval to TradingView format
  const getFormattedInterval = (interval: string) => {
    // Handle second-based intervals (TradingView uses seconds for intervals < 1 min)
    if (interval.endsWith('S')) {
      return interval;
    }
    return interval;
  };

  // Custom datafeed implementation that uses Pyth data for real-time updates
  const createCustomDatafeed = () => {
    return {
      onReady: (callback: (config: any) => void) => {
        // Configuration for the chart
        const config = {
          supported_resolutions: ['1S', '10S', '30S', '1', '5', '15', '30', '60', '120', '240', '1D', '1W', '1M'],
          supports_time: true,
          supports_marks: false,
          supports_timescale_marks: false,
          supports_search: false,
          exchanges: [{ value: 'CRYPTO', name: 'Crypto', desc: 'Cryptocurrency' }],
          // Force always showing price with high precision
          price_scale: {
            autoScale: true,
            precision: 8
          }
        };
        callback(config);
      },
      
      // This method is called when a chart needs to get historical data
      getBars: (
        symbolInfo: any,
        resolution: string,
        periodParams: any,
        onHistoryCallback: (bars: any[], options: { noData: boolean }) => void,
        onErrorCallback: (error: string) => void
      ) => {
        
        // For this implementation, we'll use TradingView's own data source for historical data
        // But we will append the live Pyth data to it
        
        // Return empty data to signify that we don't provide historical data directly
        // TradingView will use its own data source
        onHistoryCallback([], { noData: true });
      },
      
      // This is called when the chart subscribes to real-time updates
      subscribeBars: (
        symbolInfo: any,
        resolution: string,
        onRealtimeCallback: (bar: any) => void,
        subscribeUID: string,
        onResetCacheNeededCallback: () => void
      ) => {
        
        // Subscribe to Pyth price updates
        pythPriceFeedService.subscribe(symbolInfo.name, (price, confidence) => {
          const timestamp = Math.floor(Date.now() / 1000);
          
          if (lastPriceRef.current === null) {
            lastPriceRef.current = price;
            return;
          }
          
          // Always create 1-second bars for real-time updates, regardless of chart resolution
          const oneSecondTimeframe = 1; // Always use 1 second bars for high precision
          
          // Round to the nearest second
          const barTime = Math.floor(timestamp / oneSecondTimeframe) * oneSecondTimeframe;
          
          // Update or create a new bar
          if (!lastBarRef.current || lastBarRef.current.time !== barTime) {
            // Create a new bar
            const newBar = {
              time: barTime,
              open: lastPriceRef.current,
              high: price > lastPriceRef.current ? price : lastPriceRef.current,
              low: price < lastPriceRef.current ? price : lastPriceRef.current,
              close: price,
            };
            
            lastBarRef.current = newBar;
            onRealtimeCallback(newBar);
          } else {
            // Update the current bar
            const updatedBar = { ...lastBarRef.current };
            updatedBar.close = price;
            updatedBar.high = Math.max(updatedBar.high, price);
            updatedBar.low = Math.min(updatedBar.low, price);
            
            lastBarRef.current = updatedBar;
            onRealtimeCallback(updatedBar);
          }
          
          lastPriceRef.current = price;
        });
      },
      
      // This is called when the chart unsubscribes from real-time updates
      unsubscribeBars: (subscribeUID: string) => {
        // Unsubscribe from Pyth price updates
        pythPriceFeedService.unsubscribe(symbol);
      },
      
      // These methods are required but can be simplified for our implementation
      resolveSymbol: (symbolName: string, onSymbolResolvedCallback: (symbolInfo: any) => void, onResolveErrorCallback: (error: string) => void) => {
        
        // Provide symbol information
        const symbolInfo = {
          name: symbolName,
          description: symbolName, 
          type: 'crypto',
          session: '24x7',
          timezone: 'Etc/UTC',
          minmov: 1,
          pricescale: 100000, // Adjust based on your asset
          has_intraday: true,
          intraday_multipliers: ['1', '5', '15', '30', '60', '240', '1D'],
          supported_resolutions: ['1S', '10S', '30S', '1', '5', '15', '30', '60', '120', '240', '1D', '1W', '1M'],
          volume_precision: 8,
          data_status: 'streaming',
          has_empty_bars: true
        };
        
        onSymbolResolvedCallback(symbolInfo);
      },
      
      searchSymbols: () => {},
      getServerTime: () => {}
    };
  };

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      if (container.current && window.TradingView) {
        // Create the widget with our custom datafeed
        widgetRef.current = new window.TradingView.widget({
          autosize: true,
          symbol: symbol,
          interval: getFormattedInterval(interval),
          timezone: 'Etc/UTC',
          theme: 'dark',
          style: '1',
          locale: 'en',
          toolbar_bg: '#1E1F25',
          enable_publishing: false,
          allow_symbol_change: false,
          container_id: container.current.id,
          hide_side_toolbar: true,
          hide_top_toolbar: true,
          hidevolume: true,
          save_image: false,
          show_popup_button: false,
          withdateranges: false,
          hide_legend: true,
          datafeed: createCustomDatafeed(),
          library_path: 'https://s3.tradingview.com/charting_library/',
          time_frames: [
            { text: "1s", resolution: "1S" },
            { text: "1m", resolution: "1" },
            { text: "5m", resolution: "5" },
            { text: "15m", resolution: "15" },
            { text: "1h", resolution: "60" },
            { text: "4h", resolution: "240" },
            { text: "1d", resolution: "1D" },
          ],
          disabled_features: [
            'header_symbol_search',
            'header_screenshot',
            'header_compare',
            'header_undo_redo',
            'header_saveload',
            'use_localstorage_for_settings',
            'symbol_search_hot_key',
            'left_toolbar',
            'right_toolbar',
            'header_indicators',
            'header_settings',
            'header_fullscreen_button',
            'header_chart_type',
            'control_bar',
            'chart_property_page_background',
            'chart_property_page_scales',
            'chart_property_page_style',
            'chart_property_page_timezone_sessions',
            'chart_property_page_trading',
            'property_pages',
            'show_chart_property_page',
            'symbol_info',
            'volume_force_overlay',
            'go_to_date',
            'adaptive_logo',
            'border_around_the_chart',
            'main_series_scale_menu',
            'legend_context_menu',
            'scales_context_menu',
            'pane_context_menu',
            'popup_hints'
          ],
          enabled_features: [
            'move_logo_to_main_pane',
            'hide_last_na_study_output',
            'same_data_requery',
            'side_toolbar_in_fullscreen_mode',
            'disable_resolution_rebuild',
            'timeframes_toolbar'
          ],
        });
      }
    };
    
    document.head.appendChild(script);
    
    // Clean up subscriptions on unmount
    return () => {
      pythPriceFeedService.unsubscribe(symbol);
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [symbol, interval]);
  
  return <div id="tradingview_widget" ref={container} className="h-full w-full" style={{ minHeight: '100%' }} />;
}

// Add TypeScript support for TradingView
declare global {
  interface Window {
    TradingView: any;
  }
}