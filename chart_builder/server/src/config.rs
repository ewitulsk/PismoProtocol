use serde::{Deserialize, Serialize};
use std::fs;
use anyhow::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub pyth: Pyth,
    pub server: Server,
    pub pyth_assets: Vec<AssetConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pyth {
    pub websocket_url: String,
    pub reconnect_delay_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Server {
    pub host: String,
    pub port: u16,
    pub max_bars: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetConfig {
    pub name: String,
    pub feed_id: String,
    pub enabled: bool,
}

pub fn load_config(path: &str) -> Result<Config> {
    let contents = fs::read_to_string(path)?;
    let config: Config = toml::from_str(&contents)?;
    Ok(config)
}