use serde::{Deserialize, Serialize};
use std::fs;
use anyhow::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub pyth: Pyth,
    pub server: Server,
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

impl Default for Config {
    fn default() -> Self {
        Self {
            pyth: Pyth {
                websocket_url: "wss://hermes-beta.pyth.network/ws".to_string(),
                reconnect_delay_secs: 5,
            },
            server: Server {
                host: "127.0.0.1".to_string(),
                port: 8080,
                max_bars: 1000,
            },
        }
    }
}

impl Config {
    pub fn load(path: &str) -> Result<Self> {
        let contents = fs::read_to_string(path)?;
        let config: Config = toml::from_str(&contents)?;
        Ok(config)
    }

    pub fn load_or_default(path: &str) -> Self {
        Self::load(path).unwrap_or_else(|_| {
            tracing::warn!("Could not load config from {}, using defaults", path);
            Self::default()
        })
    }
} 