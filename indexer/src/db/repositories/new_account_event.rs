use crate::db::models::new_account_event::{NewAccountEvent, NewNewAccountEvent};
use crate::db::postgres::schema::new_account_events::dsl::*;
use crate::db::repositories::DBPool;
use anyhow::{Context, Result};
use diesel::prelude::*;
use diesel::result::Error as DieselError;
use std::sync::Arc;
use tracing::error;

#[derive(Clone)]
pub struct NewAccountEventRepository {
    pool: Arc<DBPool>,
}

impl NewAccountEventRepository {
    pub fn new(pool: Arc<DBPool>) -> Self {
        NewAccountEventRepository { pool }
    }

    fn get_conn(&self) -> Result<diesel::r2d2::PooledConnection<diesel::r2d2::ConnectionManager<diesel::PgConnection>>> {
        self.pool.get().context("Failed to get DB connection")
    }

    pub fn create(&self, new_event: NewNewAccountEvent) -> Result<NewAccountEvent> {
        let mut conn = self.get_conn()?;
        diesel::insert_into(new_account_events)
            .values(&new_event)
            .on_conflict(transaction_hash)
            .do_nothing() // Or specify update logic if needed
            .get_result(&mut conn)
            .map_err(|e| {
                error!(event = ?new_event, error = ?e, "Failed to insert NewAccountEvent");
                anyhow::anyhow!("Failed to insert NewAccountEvent: {}", e)
            })
    }

    #[allow(dead_code)]
    pub fn find(&self, tx_hash: &str) -> Result<Option<NewAccountEvent>> {
        let mut conn = self.get_conn()?;
        match new_account_events
            .filter(transaction_hash.eq(tx_hash))
            .first::<NewAccountEvent>(&mut conn)
        {
            Ok(event) => Ok(Some(event)),
            Err(DieselError::NotFound) => Ok(None),
            Err(e) => {
                error!(tx_hash = %tx_hash, error = ?e, "Failed to find NewAccountEvent");
                Err(anyhow::anyhow!("Failed to find NewAccountEvent: {}", e))
            }
        }
    }

    // Implement update/delete if needed, otherwise leave as dead_code
    #[allow(dead_code)]
    fn update(&self) -> Result<()> { Ok(()) }
    #[allow(dead_code)]
    fn delete(&self) -> Result<()> { Ok(()) }

} 