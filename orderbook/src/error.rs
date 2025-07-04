use thiserror::Error;

#[derive(Error, Debug)]
pub enum OrderbookError {
    #[error("Market not found: {0}")]
    MarketNotFound(String),
    
    #[error("Invalid order amount: {0}")]
    InvalidAmount(String),
    
    #[error("Market already exists: {0}")]
    MarketAlreadyExists(String),
    
    #[error("Insufficient funds")]
    InsufficientFunds,
    
    #[error("Invalid market ID")]
    InvalidMarketId,
}