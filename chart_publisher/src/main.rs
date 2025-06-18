mod config;
mod websockets;

use anyhow::Result;
use tracing::info;
use crate::config::Config;
use crate::websockets::pyth::pyth_client::PythWebSocketClient;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    info!("Starting Chart Publisher...");

    let config_path = std::env::var("CONFIG_PATH")
        .unwrap_or_else(|_| "config/config.toml".to_string());
    let config = Config::load(&config_path)?;

    info!("Pyth WebSocket URL: {}", config.pyth.websocket_url);

    let mut pyth_handler = PythWebSocketClient::new(config.pyth.websocket_url);

    info!("Chart Publisher ready!");
    
    pyth_handler.subscribe("0xf9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b").await?;

    tokio::select! {
        result = pyth_handler.connect() => {
            match result {
                Ok(_) => info!("WebSocket connection completed"),
                Err(e) => info!("WebSocket connection error: {}", e),
            }
        }
    }
    
    info!("Shutting down Chart Publisher...");

    Ok(())
}
