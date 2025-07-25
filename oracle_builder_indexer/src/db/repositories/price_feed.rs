use crate::db::models::price_feed::{PriceFeed, NewPriceFeed};
use crate::db::postgres::schema::price_feeds::dsl::*;
use crate::db::repositories::{DBPool, base::BaseRepository};
use anyhow::{Context, Result};
use async_trait::async_trait;
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use diesel::result::Error as DieselError;
use std::sync::Arc;
use tracing::error;

#[derive(Clone)]
pub struct PriceFeedRepository {
    pool: Arc<DBPool>,
}

impl PriceFeedRepository {
    pub fn new(pool: Arc<DBPool>) -> Self {
        PriceFeedRepository { pool }
    }

    async fn get_conn(&self) -> Result<diesel_async::pooled_connection::deadpool::Object<diesel_async::AsyncPgConnection>> {
        self.pool.get().await.context("Failed to get DB connection")
    }

    // Auxiliary functions (specific to PriceFeed)
    pub async fn find_by_oracle_id(&self, oracle_id_param: &str) -> Result<Vec<PriceFeed>> {
        let mut conn = self.get_conn().await?;
        
        match price_feeds
            .filter(oracle_id.eq(oracle_id_param))
            .load::<PriceFeed>(&mut conn)
            .await
        {
            Ok(feeds) => Ok(feeds),
            Err(e) => {
                error!(oracle_id = %oracle_id_param, error = ?e, "Failed to find PriceFeeds by oracle_id");
                Err(anyhow::anyhow!("Failed to find PriceFeeds by oracle_id: {}", e))
            }
        }
    }

    pub async fn find_all(&self) -> Result<Vec<PriceFeed>> {
        let mut conn = self.get_conn().await?;
        
        match price_feeds.load::<PriceFeed>(&mut conn).await {
            Ok(feeds) => Ok(feeds),
            Err(e) => {
                error!(error = ?e, "Failed to load all PriceFeeds");
                Err(anyhow::anyhow!("Failed to load all PriceFeeds: {}", e))
            }
        }
    }

    pub async fn find_valid(&self) -> Result<Vec<PriceFeed>> {
        let mut conn = self.get_conn().await?;
        
        match price_feeds
            .filter(is_valid.eq(true))
            .load::<PriceFeed>(&mut conn)
            .await
        {
            Ok(feeds) => Ok(feeds),
            Err(e) => {
                error!(error = ?e, "Failed to load valid PriceFeeds");
                Err(anyhow::anyhow!("Failed to load valid PriceFeeds: {}", e))
            }
        }
    }

    pub async fn update_validity(&self, id: &str, valid: bool) -> Result<PriceFeed> {
        let mut conn = self.get_conn().await?;
        
        diesel::update(price_feeds.filter(price_feed_id.eq(id)))
            .set((is_valid.eq(valid), updated_at.eq(chrono::Utc::now())))
            .get_result(&mut conn)
            .await
            .map_err(|e| {
                error!(price_feed_id = %id, is_valid = %valid, error = ?e, "Failed to update PriceFeed validity");
                anyhow::anyhow!("Failed to update PriceFeed validity: {}", e)
            })
    }

    pub async fn update_urls(&self, id: &str, new_underlying_url: &str, new_live_url: &str) -> Result<PriceFeed> {
        let mut conn = self.get_conn().await?;
        
        diesel::update(price_feeds.filter(price_feed_id.eq(id)))
            .set((
                underlying_url.eq(new_underlying_url),
                live_url.eq(new_live_url),
                updated_at.eq(chrono::Utc::now())
            ))
            .get_result(&mut conn)
            .await
            .map_err(|e| {
                error!(price_feed_id = %id, error = ?e, "Failed to update PriceFeed URLs");
                anyhow::anyhow!("Failed to update PriceFeed URLs: {}", e)
            })
    }
}

#[async_trait]
impl BaseRepository<PriceFeed, NewPriceFeed> for PriceFeedRepository {
    async fn find(&self, id: &str) -> Result<Option<PriceFeed>> {
        let mut conn = self.get_conn().await?;
        
        match price_feeds
            .filter(price_feed_id.eq(id))
            .first::<PriceFeed>(&mut conn)
            .await
        {
            Ok(price_feed) => Ok(Some(price_feed)),
            Err(DieselError::NotFound) => Ok(None),
            Err(e) => {
                error!(price_feed_id = %id, error = ?e, "Failed to find PriceFeed");
                Err(anyhow::anyhow!("Failed to find PriceFeed: {}", e))
            }
        }
    }

    async fn create(&self, new_price_feed: NewPriceFeed) -> Result<PriceFeed> {
        let mut conn = self.get_conn().await?;
        let now = chrono::Utc::now();
        
        diesel::insert_into(price_feeds)
            .values((
                &new_price_feed,
                created_at.eq(&now),
                updated_at.eq(&now)
            ))
            .on_conflict(price_feed_id)
            .do_nothing()
            .get_result(&mut conn)
            .await
            .map_err(|e| {
                error!(price_feed = ?new_price_feed, error = ?e, "Failed to insert PriceFeed");
                anyhow::anyhow!("Failed to insert PriceFeed: {}", e)
            })
    }

    async fn update(&self, id: &str, updated_price_feed: PriceFeed) -> Result<PriceFeed> {
        let mut conn = self.get_conn().await?;
        
        diesel::update(price_feeds.filter(price_feed_id.eq(id)))
            .set((
                oracle_id.eq(&updated_price_feed.oracle_id),
                is_valid.eq(&updated_price_feed.is_valid),
                api_key.eq(&updated_price_feed.api_key),
                underlying_url.eq(&updated_price_feed.underlying_url),
                response_field.eq(&updated_price_feed.response_field),
                live_url.eq(&updated_price_feed.live_url),
                updated_at.eq(chrono::Utc::now())
            ))
            .get_result(&mut conn)
            .await
            .map_err(|e| {
                error!(price_feed_id = %id, error = ?e, "Failed to update PriceFeed");
                anyhow::anyhow!("Failed to update PriceFeed: {}", e)
            })
    }

    async fn delete(&self, id: &str) -> Result<usize> {
        let mut conn = self.get_conn().await?;
        
        diesel::delete(price_feeds.filter(price_feed_id.eq(id)))
            .execute(&mut conn)
            .await
            .map_err(|e| {
                error!(price_feed_id = %id, error = ?e, "Failed to delete PriceFeed");
                anyhow::anyhow!("Failed to delete PriceFeed: {}", e)
            })
    }
} 