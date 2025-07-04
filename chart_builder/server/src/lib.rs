use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::mpsc;

pub mod config;
pub mod websockets;

// Message type for price updates
#[derive(Debug, Clone)]
pub struct PriceUpdate {
    pub feed_id: String,
    pub price: f64,
    pub timestamp: DateTime<Utc>,
}

// Type alias for price update sender
pub type PriceUpdateSender = mpsc::UnboundedSender<PriceUpdate>;

// Type alias for bar update callback - back to single bar for real-time updates
pub type BarUpdateCallback = Arc<dyn Fn(&str, &str, &OHLCBar) + Send + Sync>;

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

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
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
    #[serde(rename = "bars_data")]
    BarsData {
        asset_id: String,
        time_scale: String,
        bars: Vec<OHLCBar>,
    },
    #[serde(rename = "error")]
    Error { message: String },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AssetInfo {
    pub asset_id: String,
    pub time_scales: Vec<String>,
} 