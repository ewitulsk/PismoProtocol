"use client";

import { Time } from 'lightweight-charts';

export interface ChartBarData {
  time: number | Time; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface ChartBarUpdate {
  asset_id: string;
  time_scale: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface AssetInfo {
  asset_id: string;
  time_scales: string[];
}

type BarUpdateCallback = (update: ChartBarUpdate) => void;
type HistoricalBarsCallback = (bars: ChartBarUpdate[]) => void;

// Chart service message structures (based on Rust ChartMessage enum)
interface ChartMessage {
  type: 'get_assets' | 'subscribe' | 'unsubscribe';
  asset_id?: string;
  time_scale?: string;
}

// Chart service response structures (based on Rust ChartResponse enum)
interface ChartResponse {
  type: 'assets' | 'subscription_confirmed' | 'bar_update' | 'bars_data' | 'error';
  assets?: AssetInfo[];
  asset_id?: string;
  time_scale?: string;
  bar?: {
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  };
  bars?: Array<{
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  message?: string;
}

export class ChartBuilderService {
  private socket: WebSocket | null = null;
  private isConnected = false;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 2000; // 2 seconds
  private clientId: string | null = null;
  private barUpdateHandlers: Map<string, Map<string, Set<BarUpdateCallback>>> = new Map(); // assetId -> timeScale -> handlers
  private historicalBarsHandlers: Map<string, Map<string, Set<HistoricalBarsCallback>>> = new Map(); // assetId -> timeScale -> handlers
  private availableAssets: AssetInfo[] = [];
  private pendingSubscription: { 
    assetId: string; 
    timeScale?: string;
  } | null = null;
  private url = process.env.NEXT_PUBLIC_CHART_BUILDER_URL || 'ws://127.0.0.1:8080';

  // Connect to the WebSocket server
  public async connect(): Promise<boolean> {
    console.log(`[ChartBuilder] connect() called. isConnected: ${this.isConnected}, isConnecting: ${this.isConnecting}`);
    if (this.isConnected || this.isConnecting) {
      console.log(`[ChartBuilder] Connection attempt skipped. Already connected or connecting.`);
      return this.isConnected;
    }

    this.isConnecting = true;
    console.log(`[ChartBuilder] Attempting to connect to WebSocket server at ${this.url}`);

    return new Promise((resolve) => {
      try {
        this.socket = new WebSocket(this.url);
        console.log('[ChartBuilder] WebSocket instance created, waiting for connection...');

        this.socket.onopen = () => {
          console.log('[ChartBuilder] Successfully connected to WebSocket server');
          this.isConnected = true;
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          
          // Request available assets on connection
          this.requestAvailableAssets();
          
          // Process any pending subscription
          if (this.pendingSubscription) {
            const { assetId, timeScale } = this.pendingSubscription;
            this.pendingSubscription = null;
            this.subscribeToAsset(assetId, timeScale || '1m');
          }
          
          resolve(true);
        };

        this.socket.onclose = (event) => {
          console.log(`[ChartBuilder] WebSocket closed: ${event.code} - ${event.reason}`);
          this.isConnected = false;
          this.isConnecting = false;
          this.clientId = null;
          
          // Attempt to reconnect unless it was a clean close
          if (event.code !== 1000) {
            this.attemptReconnect();
          }
          
          if (!this.isConnected) {
            resolve(false);
          }
        };

        this.socket.onerror = (error) => {
          console.error('[ChartBuilder] WebSocket error:', error);
          this.isConnected = false;
          this.isConnecting = false;
          resolve(false);
        };

        this.socket.onmessage = (event) => {
          // console.log('[ChartBuilder] Raw WebSocket message:', event.data);
          this.handleMessage(event.data);
        };
      } catch (error) {
        console.error('[ChartBuilder] Error creating WebSocket:', error);
        this.isConnecting = false;
        resolve(false);
      }
    });
  }

  // Set the WebSocket URL
  public setUrl(url: string): void {
    this.url = url;
  }

  // Attempt to reconnect to the WebSocket server
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[ChartBuilder] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1);
    
    console.log(`[ChartBuilder] Attempting to reconnect in ${delay}ms... (Attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  // Request list of available assets
  private requestAvailableAssets(): void {
    if (!this.isConnected || !this.socket) {
      console.warn('[ChartBuilder] Cannot request available assets, not connected');
      return;
    }

    const message: ChartMessage = {
      type: 'get_assets'
    };

    this.socket.send(JSON.stringify(message));
  }

  // Subscribe to an asset's chart data
  public async subscribeToAsset(
    assetId: string,
    timeScale: string = '1m'
  ): Promise<boolean> {
    console.log(`[ChartBuilder] subscribeToAsset called for assetId: ${assetId}, timeScale: ${timeScale}, isConnected: ${this.isConnected}`);
    // If not connected, store subscription for later
    if (!this.isConnected) {
      this.pendingSubscription = { 
        assetId, 
        timeScale
      };
      console.log(`[ChartBuilder] Not connected, storing pending subscription for ${assetId}/${timeScale}`);
      // Try to connect
      const connected = await this.connect();
      console.log(`[ChartBuilder] connect() resolved to: ${connected}`);
      return connected;
    }

    if (!this.socket) {
      console.error('[ChartBuilder] Socket not initialized');
      return false;
    }

    try {
      const message: ChartMessage = {
        type: 'subscribe',
        asset_id: assetId,
        time_scale: timeScale
      };

      console.log(`[ChartBuilder] Sending subscription message: ${JSON.stringify(message)}`);
      this.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('[ChartBuilder] Error sending subscription:', error);
      return false;
    }
  }

  // Unsubscribe from an asset's chart data
  public unsubscribeFromAsset(assetId: string, timeScale: string): boolean {
    console.log(`[ChartBuilder] unsubscribeFromAsset called for ${assetId}/${timeScale}. isConnected: ${this.isConnected}`);
    if (!this.isConnected || !this.socket) {
      console.warn('[ChartBuilder] Cannot unsubscribe, not connected');
      return false;
    }

    try {
      const message: ChartMessage = {
        type: 'unsubscribe',
        asset_id: assetId,
        time_scale: timeScale
      };

      this.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('[ChartBuilder] Error unsubscribing:', error);
      return false;
    }
  }

  // Handle incoming messages from the WebSocket
  private handleMessage(data: string): void {
    try {
      // console.log('[ChartBuilder] handleMessage raw data:', data);
      const message: ChartResponse = JSON.parse(data);
      
      // Check if message has a valid type
      if (!message || typeof message !== 'object' || !message.type) {
        console.warn('[ChartBuilder] Received message with invalid format:', 
          typeof message === 'object' ? JSON.stringify(message).substring(0, 100) : typeof message);
        return;
      }
      
      switch (message.type) {
        case 'assets':
          if (message.assets) {
            this.availableAssets = message.assets;
            console.log('[ChartBuilder] Received available assets:', message.assets);
          }
          break;

        case 'subscription_confirmed':
          if (message.asset_id && message.time_scale) {
            console.log(`[ChartBuilder] Subscription confirmed for ${message.asset_id}/${message.time_scale}`);
          }
          break;

        case 'bar_update':
          if (message.asset_id && message.time_scale && message.bar) {
            this.handleBarUpdate(message.asset_id, message.time_scale, message.bar);
          }
          break;

        case 'bars_data':
          if (message.asset_id && message.time_scale && message.bars) {
            this.handleHistoricalBars(message.asset_id, message.time_scale, message.bars);
          }
          break;

        case 'error':
          console.error('[ChartBuilder] Server error:', message.message);
          break;

        default:
          console.warn('[ChartBuilder] Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('[ChartBuilder] Error parsing message:', error, 'Raw data:', data);
    }
  }

  // Handle bar updates
  private handleBarUpdate(assetId: string, timeScale: string, bar: ChartResponse['bar']): void {
    if (!bar) return;

    const update: ChartBarUpdate = {
      asset_id: assetId,
      time_scale: timeScale,
      timestamp: bar.timestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume
    };

    // Get handlers for this asset and time scale
    const assetHandlers = this.barUpdateHandlers.get(assetId);
    if (!assetHandlers) return;

    const timeScaleHandlers = assetHandlers.get(timeScale);
    if (!timeScaleHandlers || timeScaleHandlers.size === 0) return;

    // Call each registered handler
    timeScaleHandlers.forEach(callback => {
      try {
        callback(update);
      } catch (error) {
        console.error('[ChartBuilder] Error in bar update callback:', error);
      }
    });
  }

  // Handle historical bars
  private handleHistoricalBars(assetId: string, timeScale: string, bars: ChartResponse['bars']): void {
    if (!bars) return;

    const updates: ChartBarUpdate[] = bars.map(bar => ({
      asset_id: assetId,
      time_scale: timeScale,
      timestamp: bar.timestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume
    }));

    // Get handlers for this asset and time scale
    const assetHandlers = this.historicalBarsHandlers.get(assetId);
    if (!assetHandlers) return;

    const timeScaleHandlers = assetHandlers.get(timeScale);
    if (!timeScaleHandlers || timeScaleHandlers.size === 0) return;

    // Call each registered handler
    timeScaleHandlers.forEach(callback => {
      try {
        callback(updates);
      } catch (error) {
        console.error('[ChartBuilder] Error in historical bars callback:', error);
      }
    });
  }

  // Helper to check if this is the first handler for an asset/timeScale
  private isFirstHandler(assetId: string, timeScale: string): boolean {
    const barUpdateCount = this.barUpdateHandlers.get(assetId)?.get(timeScale)?.size || 0;
    const historicalCount = this.historicalBarsHandlers.get(assetId)?.get(timeScale)?.size || 0;
    return (barUpdateCount + historicalCount) === 1;
  }

  // Subscribe to bar updates for a specific asset and time scale
  public async subscribeToBarUpdates(
    assetId: string,
    timeScale: string,
    callback: BarUpdateCallback
  ): Promise<boolean> {
    // Initialize nested maps if they don't exist
    if (!this.barUpdateHandlers.has(assetId)) {
      this.barUpdateHandlers.set(assetId, new Map());
    }
    const assetHandlers = this.barUpdateHandlers.get(assetId)!;
    if (!assetHandlers.has(timeScale)) {
      assetHandlers.set(timeScale, new Set());
    }
    // Add the callback
    const timeScaleHandlers = assetHandlers.get(timeScale)!;
    timeScaleHandlers.add(callback);
    // Only subscribe if this is the first handler for this asset/timeScale
    if (this.isFirstHandler(assetId, timeScale)) {
      return await this.subscribeToAsset(assetId, timeScale);
    }
    return true;
  }

  // Subscribe to historical bars for a specific asset and time scale
  public async subscribeToHistoricalBars(
    assetId: string,
    timeScale: string,
    callback: HistoricalBarsCallback
  ): Promise<boolean> {
    // Initialize nested maps if they don't exist
    if (!this.historicalBarsHandlers.has(assetId)) {
      this.historicalBarsHandlers.set(assetId, new Map());
    }
    const assetHandlers = this.historicalBarsHandlers.get(assetId)!;
    if (!assetHandlers.has(timeScale)) {
      assetHandlers.set(timeScale, new Set());
    }
    // Add the callback
    const timeScaleHandlers = assetHandlers.get(timeScale)!;
    timeScaleHandlers.add(callback);
    // Only subscribe if this is the first handler for this asset/timeScale
    if (this.isFirstHandler(assetId, timeScale)) {
      return await this.subscribeToAsset(assetId, timeScale);
    }
    return true;
  }

  // Unsubscribe from bar updates
  public unsubscribeFromBarUpdates(
    assetId: string,
    timeScale: string,
    callback?: BarUpdateCallback
  ): boolean {
    console.log(`[ChartBuilder] unsubscribeFromBarUpdates called for ${assetId}/${timeScale}.`);
    const assetHandlers = this.barUpdateHandlers.get(assetId);
    if (!assetHandlers) return true;

    const timeScaleHandlers = assetHandlers.get(timeScale);
    if (!timeScaleHandlers) return true;

    if (callback) {
      timeScaleHandlers.delete(callback);
    } else {
      timeScaleHandlers.clear();
    }

    // Clean up empty maps
    if (timeScaleHandlers.size === 0) {
      assetHandlers.delete(timeScale);
    }

    if (assetHandlers.size === 0) {
      this.barUpdateHandlers.delete(assetId);
    }

    // Unsubscribe from asset if no handlers left
    const hasHistoricalHandlers = this.historicalBarsHandlers.get(assetId)?.has(timeScale);
    if (!hasHistoricalHandlers && timeScaleHandlers.size === 0) {
      this.unsubscribeFromAsset(assetId, timeScale);
    }

    return true;
  }

  // Unsubscribe from historical bars
  public unsubscribeFromHistoricalBars(
    assetId: string,
    timeScale: string,
    callback?: HistoricalBarsCallback
  ): boolean {
    console.log(`[ChartBuilder] unsubscribeFromHistoricalBars called for ${assetId}/${timeScale}.`);
    const assetHandlers = this.historicalBarsHandlers.get(assetId);
    if (!assetHandlers) return true;

    const timeScaleHandlers = assetHandlers.get(timeScale);
    if (!timeScaleHandlers) return true;

    if (callback) {
      timeScaleHandlers.delete(callback);
    } else {
      timeScaleHandlers.clear();
    }

    // Clean up empty maps
    if (timeScaleHandlers.size === 0) {
      assetHandlers.delete(timeScale);
    }

    if (assetHandlers.size === 0) {
      this.historicalBarsHandlers.delete(assetId);
    }

    // Unsubscribe from asset if no handlers left
    const hasBarUpdateHandlers = this.barUpdateHandlers.get(assetId)?.has(timeScale);
    if (!hasBarUpdateHandlers && timeScaleHandlers.size === 0) {
      this.unsubscribeFromAsset(assetId, timeScale);
    }

    return true;
  }

  // Get available assets
  public getAvailableAssets(): AssetInfo[] {
    return this.availableAssets;
  }

  // Create a bar from chart bar update (compatibility with existing code)
  public static createBarFromChartUpdate(chartBar: ChartBarUpdate): ChartBarData {
    // Convert ISO timestamp to seconds timestamp
    const time = chartBar.timestamp 
      ? Math.floor(new Date(chartBar.timestamp).getTime() / 1000)
      : Math.floor(Date.now() / 1000);
    
    return {
      time,
      open: chartBar.open || 0,
      high: chartBar.high || 0,
      low: chartBar.low || 0,
      close: chartBar.close || 0,
      volume: chartBar.volume || 0
    };
  }

  // Disconnect from the WebSocket server
  public disconnect(): void {
    console.log('[ChartBuilder] disconnect() called.');
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.isConnected = false;
      this.clientId = null;
    }
  }
}

// Singleton instance
export const chartBuilderService = new ChartBuilderService();
