use async_trait::async_trait;
use sqlx::{Row, FromRow};
use chrono::{DateTime, Utc};
use serde::{Serialize, Deserialize};
use shared::db::DbPool;
use shared::error::{SharedError, SharedResult};
use crate::db::repositories::Repository;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct VaultCreatedEvent {
    pub id: i32,
    pub transaction_hash: String,
    pub vault_address: String,
    pub vault_marker_address: String,
    pub coin_token_info: String,
    pub lp_token_info: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewVaultCreatedEvent {
    pub transaction_hash: String,
    pub vault_address: String,
    pub vault_marker_address: String,
    pub coin_token_info: String,
    pub lp_token_info: String,
    pub timestamp: DateTime<Utc>,
}

/// Repository struct holding the connection pool for VaultCreatedEvent operations
#[derive(Clone)]
pub struct VaultCreatedEventRepository {
    pool: DbPool,
}

#[async_trait]
impl Repository<VaultCreatedEvent, i32> for VaultCreatedEventRepository {
    async fn new(pool: DbPool) -> Self {
        VaultCreatedEventRepository { pool }
    }

    async fn create(&self, item: VaultCreatedEvent) -> SharedResult<VaultCreatedEvent> {
        let new_item = NewVaultCreatedEvent {
            transaction_hash: item.transaction_hash,
            vault_address: item.vault_address,
            vault_marker_address: item.vault_marker_address,
            coin_token_info: item.coin_token_info,
            lp_token_info: item.lp_token_info,
            timestamp: item.timestamp,
        };
        
        self.create_new(new_item).await
    }

    async fn find(&self, id: i32) -> SharedResult<Option<VaultCreatedEvent>> {
        let result = sqlx::query_as!(
            VaultCreatedEvent,
            "SELECT id, transaction_hash, vault_address, vault_marker_address, coin_token_info, lp_token_info, timestamp FROM vault_created_events WHERE id = $1",
            id
        )
        .fetch_optional(&self.pool)
        .await?;
        
        Ok(result)
    }

    async fn update(&self, id: i32, item: VaultCreatedEvent) -> SharedResult<VaultCreatedEvent> {
        let result = sqlx::query_as!(
            VaultCreatedEvent,
            "UPDATE vault_created_events SET transaction_hash = $2, vault_address = $3, vault_marker_address = $4, coin_token_info = $5, lp_token_info = $6, timestamp = $7 WHERE id = $1 RETURNING *",
            id,
            item.transaction_hash,
            item.vault_address,
            item.vault_marker_address,
            item.coin_token_info,
            item.lp_token_info,
            item.timestamp
        )
        .fetch_one(&self.pool)
        .await?;
        
        Ok(result)
    }

    async fn delete(&self, id: i32) -> SharedResult<bool> {
        let result = sqlx::query!("DELETE FROM vault_created_events WHERE id = $1", id)
            .execute(&self.pool)
            .await?;
        
        Ok(result.rows_affected() > 0)
    }

    async fn find_all(&self) -> SharedResult<Vec<VaultCreatedEvent>> {
        let result = sqlx::query_as!(
            VaultCreatedEvent,
            "SELECT id, transaction_hash, vault_address, vault_marker_address, coin_token_info, lp_token_info, timestamp FROM vault_created_events"
        )
        .fetch_all(&self.pool)
        .await?;
        
        Ok(result)
    }
}

impl VaultCreatedEventRepository {
    /// Creates a new VaultCreatedEvent record using NewVaultCreatedEvent
    pub async fn create_new(&self, new_item: NewVaultCreatedEvent) -> SharedResult<VaultCreatedEvent> {
        let result = sqlx::query_as!(
            VaultCreatedEvent,
            "INSERT INTO vault_created_events (transaction_hash, vault_address, vault_marker_address, coin_token_info, lp_token_info, timestamp) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
            new_item.transaction_hash,
            new_item.vault_address,
            new_item.vault_marker_address,
            new_item.coin_token_info,
            new_item.lp_token_info,
            new_item.timestamp
        )
        .fetch_one(&self.pool)
        .await?;
        
        Ok(result)
    }

    /// Finds a VaultCreatedEvent by its vault address.
    pub async fn find_by_vault_address(&self, address: String) -> SharedResult<Option<VaultCreatedEvent>> {
        let result = sqlx::query_as!(
            VaultCreatedEvent,
            "SELECT id, transaction_hash, vault_address, vault_marker_address, coin_token_info, lp_token_info, timestamp FROM vault_created_events WHERE vault_address = $1",
            address
        )
        .fetch_optional(&self.pool)
        .await?;
        
        Ok(result)
    }
} 