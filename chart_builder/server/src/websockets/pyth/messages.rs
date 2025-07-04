use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PythRequest {
    Subscribe { ids: Vec<String> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PythResponse {
    ConnectionEstablished {
        client_id: String,
        message: String,
    },
    
    Response { 
        status: String
    },

    PriceUpdate {
        price_feed: PythPriceFeed,
    },
}

// Price feed structure from Pyth
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PythPriceFeed {
    pub id: String,
    pub price: PythPrice,
    pub ema_price: PythPrice,
}

// Price and metadata structures from Pyth
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PythPrice {
    pub price: String,
    pub conf: String,
    pub expo: i32,
    pub publish_time: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PythMetadata {
    pub slot: Option<u64>,
    pub emitter_chain: Option<u32>,
    pub price_service_receive_time: Option<i64>,
} 