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

    // New method to find by account_id
    pub fn find_by_account_id(&self, acc_id: &str) -> Result<Option<NewAccountEvent>> {
        let mut conn = self.get_conn()?;
        match new_account_events
            .filter(account_id.eq(acc_id))
            .first::<NewAccountEvent>(&mut conn)
        {
            Ok(event) => Ok(Some(event)),
            Err(DieselError::NotFound) => Ok(None),
            Err(e) => {
                error!(account_id = %acc_id, error = ?e, "Failed to find NewAccountEvent by account_id");
                Err(anyhow::anyhow!("Failed to find NewAccountEvent by account_id: {}", e))
            }
        }
    }

    // New method to find all account events
    pub fn find_all(&self) -> Result<Vec<NewAccountEvent>> {
        let mut conn = self.get_conn()?;
        match new_account_events.load::<NewAccountEvent>(&mut conn) {
            Ok(events) => Ok(events),
            Err(e) => {
                error!(error = ?e, "Failed to load all NewAccountEvents");
                Err(anyhow::anyhow!("Failed to load all NewAccountEvents: {}", e))
            }
        }
    }

    // Implement update/delete if needed, otherwise leave as dead_code
    #[allow(dead_code)]
    fn update(&self) -> Result<()> { Ok(()) }
    #[allow(dead_code)]
    fn delete(&self) -> Result<()> { Ok(()) }

} 