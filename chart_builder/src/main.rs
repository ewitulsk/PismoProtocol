use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::broadcast;
use tokio::time;
use tokio_tungstenite::{connect_async, accept_async, tungstenite::protocol::Message};
use tracing::{error, info, warn};
use url::Url;

// Data structures for OHLC bars
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OHLCBar {
    pub timestamp: DateTime<Utc>,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

impl OHLCBar {
    pub fn new(timestamp: DateTime<Utc>, price: f64) -> Self {
        Self {
            timestamp,
            open: price,
            high: price,
            low: price,
            close: price,
            volume: 0.0,
        }
    }

    pub fn update_price(&mut self, price: f64) {
        self.high = self.high.max(price);
        self.low = self.low.min(price);
        self.close = price;
        self.volume += 1.0; // Simple volume counting
    }
}

#[derive(Debug, Clone, Copy)]
pub enum TimeScale {
    OneSecond,
    TenSeconds,
    OneMinute,
    TenMinutes,
    OneHour,
}

impl TimeScale {
    pub fn duration_secs(&self) -> u64 {
        match self {
            TimeScale::OneSecond => 1,
            TimeScale::TenSeconds => 10,
            TimeScale::OneMinute => 60,
            TimeScale::TenMinutes => 600,
            TimeScale::OneHour => 3600,
        }
    }

    pub fn to_string(&self) -> &'static str {
        match self {
            TimeScale::OneSecond => "1s",
            TimeScale::TenSeconds => "10s",
            TimeScale::OneMinute => "1m",
            TimeScale::TenMinutes => "10m",
            TimeScale::OneHour => "1h",
        }
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
    pub asset_id: String,
    pub feed_id: String,
    pub one_second: TimeSeries,
    pub ten_second: TimeSeries,
    pub one_minute: TimeSeries,
    pub ten_minute: TimeSeries,
    pub one_hour: TimeSeries,
}

impl AssetData {
    pub fn new(asset_id: String, feed_id: String) -> Self {
        Self {
            asset_id,
            feed_id,
            one_second: TimeSeries::new(TimeScale::OneSecond, 1000),
            ten_second: TimeSeries::new(TimeScale::TenSeconds, 1000),
            one_minute: TimeSeries::new(TimeScale::OneMinute, 1000),
            ten_minute: TimeSeries::new(TimeScale::TenMinutes, 1000),
            one_hour: TimeSeries::new(TimeScale::OneHour, 1000),
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

// Pyth websocket message structures
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum PythMessage {
    #[serde(rename = "subscribe")]
    Subscribe { ids: Vec<String> },
    #[serde(rename = "unsubscribe")]
    Unsubscribe { ids: Vec<String> },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum PythResponse {
    #[serde(rename = "connection_established")]
    ConnectionEstablished {
        client_id: String,
        message: String,
    },
    #[serde(rename = "response")]
    Response { status: String },
    #[serde(rename = "price_update")]
    PriceUpdate { data: PriceData },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PriceData {
    pub id: String,
    pub price: f64,
    pub conf: f64,
    pub expo: i32,
    pub status: String,
    pub publish_time: String,
    pub ema_price: f64,
    pub ema_conf: f64,
}

// Chart service message structures
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ChartMessage {
    #[serde(rename = "get_assets")]
    GetAssets,
    #[serde(rename = "subscribe")]
    Subscribe { asset_id: String, time_scale: String },
    #[serde(rename = "unsubscribe")]
    Unsubscribe { asset_id: String, time_scale: String },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ChartResponse {
    #[serde(rename = "assets")]
    Assets { assets: Vec<AssetInfo> },
    #[serde(rename = "subscription_confirmed")]
    SubscriptionConfirmed { asset_id: String, time_scale: String },
    #[serde(rename = "bar_update")]
    BarUpdate {
        asset_id: String,
        time_scale: String,
        bar: OHLCBar,
    },
    #[serde(rename = "error")]
    Error { message: String },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AssetInfo {
    pub asset_id: String,
    pub time_scales: Vec<String>,
}

// Main service structure
pub struct ChartBuilderService {
    pub assets: Arc<DashMap<String, AssetData>>,
    pub update_sender: broadcast::Sender<(String, TimeScale, OHLCBar)>,
}

impl ChartBuilderService {
    pub fn new() -> (Self, broadcast::Receiver<(String, TimeScale, OHLCBar)>) {
        let (update_sender, update_receiver) = broadcast::channel(1000);
        (
            Self {
                assets: Arc::new(DashMap::new()),
                update_sender,
            },
            update_receiver,
        )
    }

    pub async fn subscribe_to_asset(&self, asset_id: &str, feed_id: &str) {
        let asset_data = AssetData::new(asset_id.to_string(), feed_id.to_string());
        self.assets.insert(asset_id.to_string(), asset_data);
        
        let assets = self.assets.clone();
        let update_sender = self.update_sender.clone();
        let asset_id = asset_id.to_string();
        let feed_id = feed_id.to_string();

        tokio::spawn(async move {
            Self::start_pyth_connection(assets, update_sender, asset_id, feed_id).await;
        });
    }

    async fn start_pyth_connection(
        assets: Arc<DashMap<String, AssetData>>,
        update_sender: broadcast::Sender<(String, TimeScale, OHLCBar)>,
        asset_id: String,
        feed_id: String,
    ) {
        loop {
            match Self::connect_to_pyth(&assets, &update_sender, &asset_id, &feed_id).await {
                Ok(_) => {
                    warn!("Pyth connection closed for asset {}, reconnecting...", asset_id);
                }
                Err(e) => {
                    error!("Error connecting to Pyth for asset {}: {}", asset_id, e);
                }
            }
            time::sleep(Duration::from_secs(5)).await;
        }
    }

    async fn connect_to_pyth(
        assets: &Arc<DashMap<String, AssetData>>,
        update_sender: &broadcast::Sender<(String, TimeScale, OHLCBar)>,
        asset_id: &str,
        feed_id: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let url = Url::parse("wss://hermes-beta.pyth.network/v2/updates/price/stream")?;
        let (ws_stream, _) = connect_async(url).await?;
        let (mut write, mut read) = ws_stream.split();

        // Subscribe to the feed
        let subscribe_msg = PythMessage::Subscribe {
            ids: vec![feed_id.to_string()],
        };
        let subscribe_json = serde_json::to_string(&subscribe_msg)?;
        write.send(Message::Text(subscribe_json)).await?;

        info!("Connected to Pyth for asset: {}", asset_id);

        while let Some(message) = read.next().await {
            match message {
                Ok(Message::Text(text)) => {
                    if let Ok(response) = serde_json::from_str::<PythResponse>(&text) {
                        match response {
                            PythResponse::ConnectionEstablished { client_id, message } => {
                                info!("Connected to Pyth: {} (client: {})", message, client_id);
                            }
                            PythResponse::Response { status } => {
                                info!("Subscription status: {}", status);
                            }
                            PythResponse::PriceUpdate { data } => {
                                let timestamp = DateTime::parse_from_rfc3339(&data.publish_time)
                                    .unwrap_or_else(|_| DateTime::parse_from_rfc3339("2023-01-01T00:00:00Z").unwrap())
                                    .with_timezone(&Utc);

                                // Calculate actual price considering expo
                                let actual_price = data.price * (10.0_f64.powi(data.expo));
                                
                                info!("Price update for {}: ${:.2} at {}", asset_id, actual_price, timestamp);

                                // Update all timescales for this asset
                                if let Some(mut asset_data) = assets.get_mut(asset_id) {
                                    asset_data.update_price(actual_price, timestamp);
                                    
                                    // Send updates for all timescales
                                    for time_scale in [TimeScale::OneSecond, TimeScale::TenSeconds, TimeScale::OneMinute, TimeScale::TenMinutes, TimeScale::OneHour] {
                                        if let Some(last_bar) = asset_data.get_bars_for_timescale(time_scale).last() {
                                            let _ = update_sender.send((asset_id.to_string(), time_scale, last_bar.clone()));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                Ok(Message::Close(_)) => {
                    info!("Pyth connection closed for asset: {}", asset_id);
                    break;
                }
                Err(e) => {
                    error!("Error reading from Pyth websocket: {}", e);
                    break;
                }
                _ => {}
            }
        }

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

    pub fn get_bars(&self, asset_id: &str, time_scale: TimeScale) -> Option<Vec<OHLCBar>> {
        self.assets
            .get(asset_id)
            .map(|asset| asset.get_bars_for_timescale(time_scale).clone())
    }
}

// Websocket server for serving chart data
pub async fn start_chart_server(
    service: Arc<ChartBuilderService>,
    mut update_receiver: broadcast::Receiver<(String, TimeScale, OHLCBar)>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {

    let listener = TcpListener::bind("127.0.0.1:8080").await?;
    info!("Chart server listening on ws://127.0.0.1:8080");

    // Store client subscriptions
    let client_subscriptions: Arc<DashMap<String, HashMap<String, Vec<String>>>> = Arc::new(DashMap::new());

    // Handle broadcast updates
    let subscriptions = client_subscriptions.clone();
    tokio::spawn(async move {
        while let Ok((asset_id, time_scale, bar)) = update_receiver.recv().await {
            // This would normally send updates to subscribed clients
            // For now, we'll just log the update
            info!("Broadcasting update for {}-{}: ${:.2}", asset_id, time_scale.to_string(), bar.close);
        }
    });

    while let Ok((stream, _)) = listener.accept().await {
        let service = service.clone();
        let subscriptions = client_subscriptions.clone();
        tokio::spawn(handle_client_connection(stream, service, subscriptions));
    }

    Ok(())
}

async fn handle_client_connection(
    stream: TcpStream,
    service: Arc<ChartBuilderService>,
    _subscriptions: Arc<DashMap<String, HashMap<String, Vec<String>>>>,
) {
    let ws_stream = match accept_async(stream).await {
        Ok(ws_stream) => ws_stream,
        Err(e) => {
            error!("Error accepting websocket connection: {}", e);
            return;
        }
    };

    let (mut write, mut read) = ws_stream.split();
    let client_id = uuid::Uuid::new_v4().to_string();

    info!("New client connected: {}", client_id);

    while let Some(message) = read.next().await {
        match message {
            Ok(Message::Text(text)) => {
                if let Ok(chart_message) = serde_json::from_str::<ChartMessage>(&text) {
                    let response = match chart_message {
                        ChartMessage::GetAssets => {
                            let assets = service.get_assets();
                            ChartResponse::Assets { assets }
                        }
                        ChartMessage::Subscribe { asset_id, time_scale } => {
                            ChartResponse::SubscriptionConfirmed { asset_id, time_scale }
                        }
                        ChartMessage::Unsubscribe { asset_id, time_scale } => {
                            ChartResponse::SubscriptionConfirmed { asset_id, time_scale }
                        }
                    };

                    if let Ok(response_json) = serde_json::to_string(&response) {
                        let _ = write.send(Message::Text(response_json)).await;
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
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    info!("Starting Chart Builder Service");

    // Create the service
    let (service, update_receiver) = ChartBuilderService::new();
    let service = Arc::new(service);

    // Subscribe to some assets (hardcoded for now)
    // SOL/USD feed ID (you may need to update this with actual Pyth feed IDs)
    service.subscribe_to_asset("SOL", "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d").await;
    
    // BTC/USD feed ID (you may need to update this with actual Pyth feed IDs)
    service.subscribe_to_asset("BTC", "e62df6c8b4c85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43").await;

    // Start the chart server
    start_chart_server(service, update_receiver).await?;

    Ok(())
}