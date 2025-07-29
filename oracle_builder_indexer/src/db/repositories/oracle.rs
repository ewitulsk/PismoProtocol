use crate::db::models::oracle::{Oracle, NewOracle};
use crate::db::postgres::schema::oracles::dsl::*;
use crate::db::repositories::{DBPool, base::BaseRepository};
use anyhow::{Context, Result};
use async_trait::async_trait;
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use diesel::result::Error as DieselError;
use std::sync::Arc;
use tracing::error;

#[derive(Clone)]
pub struct OracleRepository {
    pool: Arc<DBPool>,
}

impl OracleRepository {
    pub fn new(pool: Arc<DBPool>) -> Self {
        OracleRepository { pool }
    }

    async fn get_conn(&self) -> Result<diesel_async::pooled_connection::deadpool::Object<diesel_async::AsyncPgConnection>> {
        self.pool.get().await.context("Failed to get DB connection")
    }

    // Auxiliary functions (specific to Oracle)
    pub async fn find_by_owner(&self, owner_addr: &str) -> Result<Vec<Oracle>> {
        let mut conn = self.get_conn().await?;
        
        match oracles
            .filter(owner.eq(owner_addr))
            .load::<Oracle>(&mut conn)
            .await
        {
            Ok(oracle_list) => Ok(oracle_list),
            Err(e) => {
                error!(owner = %owner_addr, error = ?e, "Failed to find Oracles by owner");
                Err(anyhow::anyhow!("Failed to find Oracles by owner: {}", e))
            }
        }
    }

    pub async fn find_all(&self) -> Result<Vec<Oracle>> {
        let mut conn = self.get_conn().await?;
        
        match oracles.load::<Oracle>(&mut conn).await {
            Ok(oracle_list) => Ok(oracle_list),
            Err(e) => {
                error!(error = ?e, "Failed to load all Oracles");
                Err(anyhow::anyhow!("Failed to load all Oracles: {}", e))
            }
        }
    }

    pub async fn update_validity(&self, id: &str, valid: bool) -> Result<Oracle> {
        let mut conn = self.get_conn().await?;
        
        diesel::update(oracles.filter(oracle_id.eq(id)))
            .set((is_valid.eq(valid), updated_at.eq(chrono::Utc::now())))
            .get_result(&mut conn)
            .await
            .map_err(|e| {
                error!(oracle_id = %id, is_valid = %valid, error = ?e, "Failed to update Oracle validity");
                anyhow::anyhow!("Failed to update Oracle validity: {}", e)
            })
    }
}

#[async_trait]
impl BaseRepository<Oracle, NewOracle> for OracleRepository {
    async fn find(&self, id: &str) -> Result<Option<Oracle>> {
        let mut conn = self.get_conn().await?;
        
        match oracles
            .filter(oracle_id.eq(id))
            .first::<Oracle>(&mut conn)
            .await
        {
            Ok(oracle) => Ok(Some(oracle)),
            Err(DieselError::NotFound) => Ok(None),
            Err(e) => {
                error!(oracle_id = %id, error = ?e, "Failed to find Oracle");
                Err(anyhow::anyhow!("Failed to find Oracle: {}", e))
            }
        }
    }

    async fn create(&self, new_oracle: NewOracle) -> Result<Oracle> {
        let mut conn = self.get_conn().await?;
        let now = chrono::Utc::now();
        
        diesel::insert_into(oracles)
            .values((
                &new_oracle,
                created_at.eq(&now),
                updated_at.eq(&now)
            ))
            .on_conflict(oracle_id)
            .do_nothing()
            .get_result(&mut conn)
            .await
            .map_err(|e| {
                error!(oracle = ?new_oracle, error = ?e, "Failed to insert Oracle");
                anyhow::anyhow!("Failed to insert Oracle: {}", e)
            })
    }

    async fn update(&self, id: &str, updated_oracle: Oracle) -> Result<Oracle> {
        let mut conn = self.get_conn().await?;
        
        diesel::update(oracles.filter(oracle_id.eq(id)))
            .set((
                owner.eq(&updated_oracle.owner),
                name.eq(&updated_oracle.name),
                description.eq(&updated_oracle.description),
                is_valid.eq(&updated_oracle.is_valid),
                updated_at.eq(chrono::Utc::now())
            ))
            .get_result(&mut conn)
            .await
            .map_err(|e| {
                error!(oracle_id = %id, error = ?e, "Failed to update Oracle");
                anyhow::anyhow!("Failed to update Oracle: {}", e)
            })
    }

    async fn delete(&self, id: &str) -> Result<usize> {
        let mut conn = self.get_conn().await?;
        
        diesel::delete(oracles.filter(oracle_id.eq(id)))
            .execute(&mut conn)
            .await
            .map_err(|e| {
                error!(oracle_id = %id, error = ?e, "Failed to delete Oracle");
                anyhow::anyhow!("Failed to delete Oracle: {}", e)
            })
    }
} 