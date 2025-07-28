use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tokio::time::sleep;
use tokio_tungstenite::{accept_async, tungstenite::protocol::Message};
use tracing::{error, info};

// Import shared types from lib.rs
use chart_builder_server::{OHLCBar, TimeScale, ChartMessage, ChartResponse, AssetInfo, config::Config, PriceUpdate, BarUpdateCallback};
use chart_builder_server::websockets::pyth::pyth_client::{start_pyth_client, PythWebSocketClient};

// Helper function to parse time scale strings
fn parse_time_scale(time_scale: &str) -> Option<TimeScale> {
    match time_scale {
        "1s" => Some(TimeScale::OneSecond),
        "10s" => Some(TimeScale::TenSeconds),
        "1m" => Some(TimeScale::OneMinute),
        "10m" => Some(TimeScale::TenMinutes),
        "1h" => Some(TimeScale::OneHour),
        _ => None,
    }
}

// Helper function to send bars to a specific client
fn send_bars_to_client(
    writers: &Arc<DashMap<String, mpsc::UnboundedSender<Message>>>,
    client_id: &str,
    asset_id: &str,
    time_scale: &str,
    bars: &Vec<OHLCBar>,
) {
    let response = ChartResponse::BarsData {
        asset_id: asset_id.to_string(),
        time_scale: time_scale.to_string(),
        bars: bars.clone(),
    };

    info!("Sent {} bars for {} {}", 
                  bars.len(), asset_id, time_scale);
    
    if let Ok(response_json) = serde_json::to_string(&response) {
        if let Some(writer) = writers.get(client_id) {
            let _ = writer.send(Message::Text(response_json));
        }
    }
}

// Helper function to send single bar update to all subscribed clients
fn send_bar_update_to_subscribed_clients(
    writers: &Arc<DashMap<String, mpsc::UnboundedSender<Message>>>,
    subscriptions: &Arc<DashMap<String, HashMap<String, Vec<String>>>>,
    asset_id: &str,
    time_scale: &str,
    bar: &OHLCBar,
) {
    let response = ChartResponse::BarUpdate {
        asset_id: asset_id.to_string(),
        time_scale: time_scale.to_string(),
        bar: bar.clone(),
    };
    
    if let Ok(response_json) = serde_json::to_string(&response) {
        let mut sent_to_clients = false;
        
        for client_entry in subscriptions.iter() {
            let client_id = client_entry.key();
            let client_subs = client_entry.value();
            
            // Check if client is subscribed to this asset and time scale
            if let Some(time_scales) = client_subs.get(asset_id) {
                if time_scales.contains(&time_scale.to_string()) {
                    if let Some(writer) = writers.get(client_id) {
                        let _ = writer.send(Message::Text(response_json.clone()));
                        sent_to_clients = true;
                    }
                }
            }
        }
        
        // if sent_to_clients {
        //     info!("Sent bar update for {} {}: timestamp={}", 
        //           asset_id, time_scale, bar.timestamp);
        // }
    }
}



#[derive(Debug, Clone)]
pub struct TimeSeries {
    pub bars: Vec<OHLCBar>,
    pub time_scale: TimeScale,
    pub max_bars: usize,
}

impl TimeSeries {
    pub fn new(time_scale: TimeScale, max_bars: usize) -> Self {
        Self {
            bars: Vec::new(),
            time_scale,
            max_bars,
        }
    }

    pub fn add_or_update_price(&mut self, price: f64, timestamp: DateTime<Utc>) {
        let bar_timestamp = self.align_timestamp(timestamp);
        
        if let Some(last_bar) = self.bars.last_mut() {
            if last_bar.timestamp == bar_timestamp {
                // Update existing bar
                last_bar.update_price(price);
                return;
            }
        }

        // Create new bar
        let new_bar = OHLCBar::new(bar_timestamp, price);
        self.bars.push(new_bar);

        // Keep only max_bars
        if self.bars.len() > self.max_bars {
            self.bars.remove(0);
        }
    }

    fn align_timestamp(&self, timestamp: DateTime<Utc>) -> DateTime<Utc> {
        let duration_secs = self.time_scale.duration_secs();
        let timestamp_secs = timestamp.timestamp();
        let aligned_secs = (timestamp_secs / duration_secs as i64) * duration_secs as i64;
        DateTime::from_timestamp(aligned_secs, 0).unwrap_or(timestamp)
    }
}

// Asset data structure
#[derive(Debug, Clone)]
pub struct AssetData {
    pub feed_id: String,
    pub one_second: TimeSeries,
    pub ten_second: TimeSeries,
    pub one_minute: TimeSeries,
    pub ten_minute: TimeSeries,
    pub one_hour: TimeSeries,
}

impl AssetData {
    pub fn new(feed_id: String, max_bars: usize) -> Self {
        Self {
            feed_id,
            one_second: TimeSeries::new(TimeScale::OneSecond, max_bars),
            ten_second: TimeSeries::new(TimeScale::TenSeconds, max_bars),
            one_minute: TimeSeries::new(TimeScale::OneMinute, max_bars),
            ten_minute: TimeSeries::new(TimeScale::TenMinutes, max_bars),
            one_hour: TimeSeries::new(TimeScale::OneHour, max_bars),
        }
    }

    pub fn update_price(&mut self, price: f64, timestamp: DateTime<Utc>) {
        self.one_second.add_or_update_price(price, timestamp);
        self.ten_second.add_or_update_price(price, timestamp);
        self.one_minute.add_or_update_price(price, timestamp);
        self.ten_minute.add_or_update_price(price, timestamp);
        self.one_hour.add_or_update_price(price, timestamp);
    }

    pub fn get_bars_for_timescale(&self, time_scale: TimeScale) -> &Vec<OHLCBar> {
        match time_scale {
            TimeScale::OneSecond => &self.one_second.bars,
            TimeScale::TenSeconds => &self.ten_second.bars,
            TimeScale::OneMinute => &self.one_minute.bars,
            TimeScale::TenMinutes => &self.ten_minute.bars,
            TimeScale::OneHour => &self.one_hour.bars,
        }
    }
}

// Main service structure
pub struct ChartBuilderService {
    pub assets: Arc<DashMap<String, AssetData>>,
    pub config: Config,
    pub pyth_client: Arc<PythWebSocketClient>,
    pub bar_update_callback: Option<BarUpdateCallback>,
}

impl ChartBuilderService {
    pub fn new(config: Config) -> (Self, mpsc::UnboundedReceiver<PriceUpdate>) {
        // Create price update channel
        let (price_tx, price_rx) = mpsc::unbounded_channel::<PriceUpdate>();
        
        let pyth_client = PythWebSocketClient::new(
            config.pyth.websocket_url.clone(),
            Duration::from_secs(config.pyth.reconnect_delay_secs),
            price_tx,
        );
        
        let service = Self {
            assets: Arc::new(DashMap::new()),
            config,
            pyth_client: Arc::new(pyth_client),
            bar_update_callback: None,
        };
        
        (service, price_rx)
    }
    
    pub fn set_bar_update_callback(&mut self, callback: BarUpdateCallback) {
        self.bar_update_callback = Some(callback);
    }

    async fn handle_price_update(&self, update: PriceUpdate) -> anyhow::Result<()> {
        if let Some(mut asset_data) = self.assets.get_mut(&update.feed_id) {
            // Get the previous bars count for each timescale to detect new bars
            let prev_counts = (
                asset_data.one_second.bars.len(),
                asset_data.ten_second.bars.len(),
                asset_data.one_minute.bars.len(),
                asset_data.ten_minute.bars.len(),
                asset_data.one_hour.bars.len(),
            );
            
            // Update the asset data
            asset_data.update_price(update.price, update.timestamp);
            
            // Send BarUpdate for ALL bar changes (new bars and existing bar updates)
            if let Some(ref callback) = self.bar_update_callback {
                let current_counts = (
                    asset_data.one_second.bars.len(),
                    asset_data.ten_second.bars.len(),
                    asset_data.one_minute.bars.len(),
                    asset_data.ten_minute.bars.len(),
                    asset_data.one_hour.bars.len(),
                );
                
                // Check each timescale for changes
                let timescales = [
                    (TimeScale::OneSecond, "1s", prev_counts.0, current_counts.0, &asset_data.one_second.bars),
                    (TimeScale::TenSeconds, "10s", prev_counts.1, current_counts.1, &asset_data.ten_second.bars),
                    (TimeScale::OneMinute, "1m", prev_counts.2, current_counts.2, &asset_data.one_minute.bars),
                    (TimeScale::TenMinutes, "10m", prev_counts.3, current_counts.3, &asset_data.ten_minute.bars),
                    (TimeScale::OneHour, "1h", prev_counts.4, current_counts.4, &asset_data.one_hour.bars),
                ];
                
                for (_, time_scale_str, prev_count, current_count, bars) in timescales.iter() {
                    if *current_count > *prev_count {
                        // NEW bar was created - timestamp changes to new aligned time
                        if let Some(latest_bar) = bars.last() {
                            callback(&update.feed_id, time_scale_str, latest_bar);
                        }
                    } else if *current_count == *prev_count && !bars.is_empty() {
                        // EXISTING bar was updated - timestamp stays the same (aligned to time period)
                        if let Some(latest_bar) = bars.last() {
                            callback(&update.feed_id, time_scale_str, latest_bar);
                        }
                    }
                }
            }
        } else {
            info!("Received price update for unsubscribed feed: {}", update.feed_id);
        }
        
        Ok(())
    }

    pub async fn subscribe_to_asset(&self, feed_id: &str) -> anyhow::Result<()> {
        let asset_data = AssetData::new(feed_id.to_string(), self.config.server.max_bars);
        self.assets.insert(feed_id.to_string(), asset_data);
        
        self.pyth_client.subscribe(feed_id).await?;
        
        info!("Subscribed to feed {}", feed_id);
        Ok(())
    }

    pub fn get_assets(&self) -> Vec<AssetInfo> {
        self.assets
            .iter()
            .map(|entry| AssetInfo {
                asset_id: entry.key().clone(),
                time_scales: vec!["1s".to_string(), "10s".to_string(), "1m".to_string(), "10m".to_string(), "1h".to_string()],
            })
            .collect()
    }

    pub fn get_bars(&self, feed_id: &str, time_scale: TimeScale) -> Option<Vec<OHLCBar>> {
        self.assets
            .get(feed_id)
            .map(|asset| asset.get_bars_for_timescale(time_scale).clone())
    }
}

// WebSocket server for serving chart data
pub async fn start_chart_server(
    service: Arc<ChartBuilderService>,
    client_subscriptions: Arc<DashMap<String, HashMap<String, Vec<String>>>>,
    client_writers: Arc<DashMap<String, mpsc::UnboundedSender<Message>>>,
) -> anyhow::Result<()> {
    let bind_address = format!("{}:{}", service.config.server.host, service.config.server.port);
    let listener = TcpListener::bind(&bind_address).await?;
    info!("Chart server listening on ws://{}", bind_address);

    while let Ok((stream, _)) = listener.accept().await {
        let service = service.clone();
        let subscriptions = client_subscriptions.clone();
        let writers = client_writers.clone();
        tokio::spawn(handle_client_connection(stream, service, subscriptions, writers));
    }

    Ok(())
}

async fn handle_client_connection(
    stream: TcpStream,
    service: Arc<ChartBuilderService>,
    subscriptions: Arc<DashMap<String, HashMap<String, Vec<String>>>>,
    writers: Arc<DashMap<String, mpsc::UnboundedSender<Message>>>,
) {
    let ws_stream = match accept_async(stream).await {
        Ok(ws_stream) => ws_stream,
        Err(e) => {
            error!("Error accepting websocket connection: {}", e);
            return;
        }
    };

    let (write, mut read) = ws_stream.split();
    let client_id = uuid::Uuid::new_v4().to_string();
    
    // Create channel for this client's outgoing messages
    let (write_tx, mut write_rx) = mpsc::unbounded_channel::<Message>();
    writers.insert(client_id.clone(), write_tx);
    
    // Handle outgoing messages
    let mut write = write;
    let write_task = tokio::spawn(async move {
        while let Some(message) = write_rx.recv().await {
            if let Err(e) = write.send(message).await {
                error!("Error sending message to client: {}", e);
                break;
            }
        }
    });

    info!("New client connected: {}", client_id);
    
    // Initialize client subscriptions
    subscriptions.insert(client_id.clone(), HashMap::new());

    while let Some(message) = read.next().await {
        match message {
            Ok(Message::Text(text)) => {
                // tracing::info!("[Server] Raw message from client {}: {}", client_id, text);
                match serde_json::from_str::<ChartMessage>(&text) {
                    Ok(chart_message) => {
                        // tracing::info!("[Server] Parsed ChartMessage from client {}: {:?}", client_id, chart_message);
                        let response = match chart_message {
                            ChartMessage::GetAssets => {
                                let assets = service.get_assets();
                                ChartResponse::Assets { assets }
                            }
                            ChartMessage::Subscribe { asset_id, time_scale } => {
                                tracing::info!("[Server] Client {} subscribing to asset: {}, time_scale: {}", client_id, asset_id, time_scale);
                                // Track client subscription
                                if let Some(mut client_subs) = subscriptions.get_mut(&client_id) {
                                    client_subs.entry(asset_id.clone()).or_insert_with(Vec::new).push(time_scale.clone());
                                }
                                // Send existing bars to the newly subscribed client
                                if let Some(time_scale_enum) = parse_time_scale(&time_scale) {
                                    if let Some(bars) = service.get_bars(&asset_id, time_scale_enum) {
                                        tracing::info!("[Server] Sending {} bars to client {} for asset {} time_scale {}", bars.len(), client_id, asset_id, time_scale);
                                        send_bars_to_client(&writers, &client_id, &asset_id, &time_scale, &bars);
                                    }
                                }
                                ChartResponse::SubscriptionConfirmed { asset_id, time_scale }
                            }
                            ChartMessage::Unsubscribe { asset_id, time_scale } => {
                                tracing::info!("[Server] Client {} unsubscribing from asset: {}, time_scale: {}", client_id, asset_id, time_scale);
                                // Remove client subscription
                                if let Some(mut client_subs) = subscriptions.get_mut(&client_id) {
                                    if let Some(time_scales) = client_subs.get_mut(&asset_id) {
                                        time_scales.retain(|ts| ts != &time_scale);
                                        if time_scales.is_empty() {
                                            client_subs.remove(&asset_id);
                                        }
                                    }
                                }
                                ChartResponse::SubscriptionConfirmed { asset_id, time_scale }
                            }
                        };
                        if let Ok(response_json) = serde_json::to_string(&response) {
                            tracing::info!("[Server] Sending response to client {}: {}", client_id, response_json);
                            if let Some(writer) = writers.get(&client_id) {
                                let _ = writer.send(Message::Text(response_json));
                            }
                        }
                    }
                    Err(e) => {
                        tracing::error!("[Server] Failed to parse ChartMessage from client {}: {} | Raw: {}", client_id, e, text);
                    }
                }
            }
            Ok(Message::Close(_)) => {
                info!("Client {} disconnected", client_id);
                break;
            }
            Err(e) => {
                error!("Error reading from client {}: {}", client_id, e);
                break;
            }
            _ => {}
        }
    }
    
    // Cleanup
    subscriptions.remove(&client_id);
    writers.remove(&client_id);
    write_task.abort();
}



#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    info!("Starting Chart Builder Service");

    // Load configuration
    let config = Config::load_or_default("config.toml");
    info!("Loaded configuration: {:?}", config);

    // Create the service and price update receiver
    let (mut service, mut price_rx) = ChartBuilderService::new(config);
    
    // Set up client subscriptions and writers for real-time updates
    let client_subscriptions: Arc<DashMap<String, HashMap<String, Vec<String>>>> = Arc::new(DashMap::new());
    let client_writers: Arc<DashMap<String, mpsc::UnboundedSender<Message>>> = Arc::new(DashMap::new());
    
    // Set up bar update callback for client notifications
    let subscriptions_clone = client_subscriptions.clone();
    let writers_clone = client_writers.clone();
    
    // Set up callback that sends individual bar updates to subscribed clients
    
    service.set_bar_update_callback(Arc::new(move |feed_id: &str, time_scale: &str, bar: &OHLCBar| {
        send_bar_update_to_subscribed_clients(&writers_clone, &subscriptions_clone, feed_id, time_scale, bar);
    }));
    
    let service = Arc::new(service);

    // Start the Pyth WebSocket client
    let pyth_handler = start_pyth_client(service.pyth_client.clone());
    
    // Start price update processing task
    let service_clone = service.clone();
    let price_update_handler = tokio::spawn(async move {
        while let Some(price_update) = price_rx.recv().await {
            if let Err(e) = service_clone.handle_price_update(price_update).await {
                error!("Error handling price update: {}", e);
            }
        }
    });

    sleep(Duration::from_secs(5)).await;
    info!("Continuing Main...");

    // Subscribe to some assets (hardcoded for now)
    // SOL/USD feed ID
    match service.subscribe_to_asset("fe650f0367d4a7ef9815a593ea15d36593f0643aaaf0149bb04be67ab851decd").await {
        Ok(_) => {info!("Successfully Subscribed to SOL")},
        Err(e) => {error!("Error Subscribing to SOL: {}", e)}
    };
    
    // BTC/USD feed ID
    // match service.subscribe_to_asset("f9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b").await {
    //     Ok(_) => {info!("Successfully Subscribed to BTC")},
    //     Err(e) => {error!("Error Subscribing to BTC: {}", e)}
    // };

    // Start the chart server with client tracking
    let chart_server_handler = start_chart_server(service.clone(), client_subscriptions, client_writers);

    tokio::select! {
        result = pyth_handler => {
            if let Err(e) = result {
                error!("Pyth handler task failed: {}", e);
            }
        }
        result = price_update_handler => {
            if let Err(e) = result {
                error!("Price update handler task failed: {}", e);
            }
        }
        result = chart_server_handler => {
            if let Err(e) = result {
                error!("Chart server task failed: {}", e);
            }
        }
    }

    Ok(())
} 