use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};
use bigdecimal::BigDecimal;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultInfo {
    pub vault_address: String,
    pub coin_token_info: String,
    pub lp_token_info: String,
    pub total_supply: BigDecimal,
    pub coin_amount: BigDecimal,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountInfo {
    pub account_id: String,
    pub owner: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PositionInfo {
    pub position_id: String,
    pub account_id: String,
    pub position_type: String,
    pub amount: BigDecimal,
    pub leverage_multiplier: i32,
    pub entry_price: BigDecimal,
    pub entry_price_decimals: i32,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollateralInfo {
    pub collateral_id: String,
    pub account_id: String,
    pub amount: BigDecimal,
    pub token_type: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriceFeedInfo {
    pub feed_id: String,
    pub price: BigDecimal,
    pub expo: i32,
    pub timestamp: DateTime<Utc>,
}