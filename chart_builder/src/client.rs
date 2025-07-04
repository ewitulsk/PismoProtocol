use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use tracing::{error, info};
use url::Url;

// Chart message structures (duplicate from main.rs for client usage)
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

#[derive(Debug, Serialize, Deserialize)]
pub struct OHLCBar {
    pub timestamp: String,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

pub struct ChartClient {
    url: String,
}

impl ChartClient {
    pub fn new(url: String) -> Self {
        Self { url }
    }

    pub async fn connect_and_run(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let url = Url::parse(&self.url)?;
        let (ws_stream, _) = connect_async(url).await?;
        let (mut write, mut read) = ws_stream.split();

        info!("Connected to chart server");

        // Request available assets
        let get_assets_msg = ChartMessage::GetAssets;
        let get_assets_json = serde_json::to_string(&get_assets_msg)?;
        write.send(Message::Text(get_assets_json)).await?;

        // Subscribe to SOL 1-minute charts
        let subscribe_msg = ChartMessage::Subscribe {
            asset_id: "SOL".to_string(),
            time_scale: "1m".to_string(),
        };
        let subscribe_json = serde_json::to_string(&subscribe_msg)?;
        write.send(Message::Text(subscribe_json)).await?;

        // Listen for responses
        while let Some(message) = read.next().await {
            match message {
                Ok(Message::Text(text)) => {
                    if let Ok(response) = serde_json::from_str::<ChartResponse>(&text) {
                        match response {
                            ChartResponse::Assets { assets } => {
                                info!("Available assets: {:?}", assets);
                            }
                            ChartResponse::SubscriptionConfirmed { asset_id, time_scale } => {
                                info!("Subscribed to {} - {}", asset_id, time_scale);
                            }
                            ChartResponse::BarUpdate { asset_id, time_scale, bar } => {
                                info!("Bar update for {} ({}): O:{:.2} H:{:.2} L:{:.2} C:{:.2} V:{:.2}", 
                                    asset_id, time_scale, bar.open, bar.high, bar.low, bar.close, bar.volume);
                            }
                            ChartResponse::Error { message } => {
                                error!("Server error: {}", message);
                            }
                        }
                    }
                }
                Ok(Message::Close(_)) => {
                    info!("Connection closed");
                    break;
                }
                Err(e) => {
                    error!("Error reading message: {}", e);
                    break;
                }
                _ => {}
            }
        }

        Ok(())
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    let client = ChartClient::new("ws://127.0.0.1:8080".to_string());
    client.connect_and_run().await?;

    Ok(())
}