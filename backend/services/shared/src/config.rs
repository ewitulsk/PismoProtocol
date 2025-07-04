use serde::{Deserialize, Serialize};
use std::env;
use crate::error::{SharedError, SharedResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    pub url: String,
    pub max_connections: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuiConfig {
    pub api_url: String,
    pub contract_address: String,
    pub contract_global: String,
    pub program_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalServiceConfig {
    pub pyth_price_feed_url: String,
    pub indexer_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedConfig {
    pub database: DatabaseConfig,
    pub server: ServerConfig,
    pub sui: SuiConfig,
    pub external_services: ExternalServiceConfig,
}

impl Default for SharedConfig {
    fn default() -> Self {
        Self {
            database: DatabaseConfig {
                url: env::var("DATABASE_URL").unwrap_or_else(|_| "postgresql://localhost/pismo".to_string()),
                max_connections: 10,
            },
            server: ServerConfig {
                host: env::var("SERVER_HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
                port: env::var("SERVER_PORT").unwrap_or_else(|_| "8080".to_string()).parse().unwrap_or(8080),
            },
            sui: SuiConfig {
                api_url: env::var("SUI_API_URL").unwrap_or_else(|_| "https://sui-testnet.nodereal.io".to_string()),
                contract_address: env::var("CONTRACT_ADDRESS").unwrap_or_default(),
                contract_global: env::var("CONTRACT_GLOBAL").unwrap_or_default(),
                program_id: env::var("PROGRAM_ID").unwrap_or_default(),
            },
            external_services: ExternalServiceConfig {
                pyth_price_feed_url: env::var("PYTH_PRICE_FEED_URL").unwrap_or_else(|_| "https://hermes.pyth.network/api/latest_price_feeds?".to_string()),
                indexer_url: env::var("INDEXER_URL").unwrap_or_else(|_| "http://localhost:8080".to_string()),
            },
        }
    }
}

impl SharedConfig {
    pub fn from_env() -> SharedResult<Self> {
        Ok(Self::default())
    }

    pub fn validate(&self) -> SharedResult<()> {
        if self.database.url.is_empty() {
            return Err(SharedError::ConfigError("Database URL cannot be empty".to_string()));
        }
        
        if self.sui.api_url.is_empty() {
            return Err(SharedError::ConfigError("SUI API URL cannot be empty".to_string()));
        }
        
        Ok(())
    }
}