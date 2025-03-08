"use client";
import { useEffect, useRef } from 'react';

interface TradingViewWidgetProps {
  symbol?: string;
  interval?: string;
}

export default function TradingViewWidget({ 
  symbol = 'BTCUSD', 
  interval = '60' 
}: TradingViewWidgetProps) {
  const container = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      if (container.current && window.TradingView) {
        new window.TradingView.widget({
          autosize: true,
          symbol: symbol,
          interval: interval,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          theme: 'dark',
          style: '1',
          locale: 'en',
          toolbar_bg: '#1E1F25',
          enable_publishing: false,
          allow_symbol_change: true,
          container_id: container.current.id,
          hide_side_toolbar: false,
          studies: [
            'RSI@tv-basicstudies',
            'MASimple@tv-basicstudies',
            'VWAP@tv-basicstudies'
          ],
          disabled_features: [
            'header_symbol_search',
            'header_screenshot',
          ],
          enabled_features: [
            'use_localstorage_for_settings',
          ],
        });
      }
    };
    
    document.head.appendChild(script);
    
    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [symbol, interval]);
  
  return <div id="tradingview_widget" ref={container} className="h-full w-full" />;
}

// Add TypeScript support for TradingView
declare global {
  interface Window {
    TradingView: any;
  }
}