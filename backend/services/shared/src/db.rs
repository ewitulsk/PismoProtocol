use async_trait::async_trait;
use sqlx::{Pool, Postgres, Row};
use crate::error::{SharedError, SharedResult};
use std::fmt::Debug;

pub mod repository;

pub type DbPool = Pool<Postgres>;

#[async_trait]
pub trait AsyncRepository<T, K>
where
    T: Send + Sync + Debug,
    K: Send + Sync + Debug,
{
    async fn new(pool: DbPool) -> Self;
    async fn create(&self, item: T) -> SharedResult<T>;
    async fn find(&self, id: K) -> SharedResult<Option<T>>;
    async fn update(&self, id: K, item: T) -> SharedResult<T>;
    async fn delete(&self, id: K) -> SharedResult<bool>;
    async fn find_all(&self) -> SharedResult<Vec<T>>;
}

pub async fn create_pool(database_url: &str) -> SharedResult<DbPool> {
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await?;
    
    Ok(pool)
}

pub async fn migrate(pool: &DbPool) -> SharedResult<()> {
    sqlx::migrate!("./migrations")
        .run(pool)
        .await
        .map_err(|e| SharedError::DatabaseError(e))?;
    
    Ok(())
}

// Helper function to convert feed bytes to hex string
pub fn convert_feed_bytes_to_hex_str(feed_bytes: &[u8]) -> String {
    format!("0x{}", hex::encode(feed_bytes))
}

// Helper function to parse hex string to bytes
pub fn parse_hex_to_bytes(hex_str: &str) -> SharedResult<Vec<u8>> {
    let hex_str = hex_str.strip_prefix("0x").unwrap_or(hex_str);
    hex::decode(hex_str)
        .map_err(|e| SharedError::ParseError(format!("Failed to parse hex string: {}", e)))
}