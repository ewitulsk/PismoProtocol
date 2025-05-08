use crate::db::models::start_collateral_value_assertion_event::{NewStartCollateralValueAssertionEvent, StartCollateralValueAssertionEvent};
use crate::db::postgres::schema::start_collateral_value_assertion_events::dsl::*;
use crate::db::repositories::DBPool;
use anyhow::{Context, Result};
use diesel::prelude::*;
use diesel::result::Error as DieselError;
use std::sync::Arc;
use tracing::error;

#[derive(Clone)]
pub struct StartCollateralValueAssertionEventRepository {
    pool: Arc<DBPool>,
}

impl StartCollateralValueAssertionEventRepository {
    pub fn new(pool: Arc<DBPool>) -> Self {
        StartCollateralValueAssertionEventRepository { pool }
    }

    fn get_conn(&self) -> Result<diesel::r2d2::PooledConnection<diesel::r2d2::ConnectionManager<diesel::PgConnection>>> {
        self.pool.get().context("Failed to get DB connection")
    }

    pub fn create(&self, new_event: NewStartCollateralValueAssertionEvent) -> Result<StartCollateralValueAssertionEvent> {
        let mut conn = self.get_conn()?;
        diesel::insert_into(start_collateral_value_assertion_events)
            .values(&new_event)
            .on_conflict(cva_id) // Use cva_id for conflict
            .do_nothing()
            .get_result(&mut conn)
            .map_err(|e| {
                error!(event = ?new_event, error = ?e, "Failed to insert StartCollateralValueAssertionEvent");
                anyhow::anyhow!("Failed to insert StartCollateralValueAssertionEvent: {}", e)
            })
    }

    #[allow(dead_code)]
    pub fn find(&self, target_cva_id: &str) -> Result<Option<StartCollateralValueAssertionEvent>> {
        let mut conn = self.get_conn()?;
        match start_collateral_value_assertion_events
            .filter(cva_id.eq(target_cva_id))
            .first::<StartCollateralValueAssertionEvent>(&mut conn)
        {
            Ok(event) => Ok(Some(event)),
            Err(DieselError::NotFound) => Ok(None),
            Err(e) => {
                error!(cva_id = %target_cva_id, error = ?e, "Failed to find StartCollateralValueAssertionEvent");
                Err(anyhow::anyhow!("Failed to find StartCollateralValueAssertionEvent: {}", e))
            }
        }
    }

    pub fn find_latest_by_account_id(&self, target_account_id: &str) -> Result<Option<StartCollateralValueAssertionEvent>> {
        let mut conn = self.get_conn()?;
        match start_collateral_value_assertion_events
            .filter(account_id.eq(target_account_id))
            .order(timestamp.desc())
            .first::<StartCollateralValueAssertionEvent>(&mut conn)
        {
            Ok(event) => Ok(Some(event)),
            Err(DieselError::NotFound) => Ok(None),
            Err(e) => {
                error!(account_id = %target_account_id, error = ?e, "Failed to find latest StartCollateralValueAssertionEvent by account ID");
                Err(anyhow::anyhow!("Failed to find latest StartCollateralValueAssertionEvent by account ID: {}", e))
            }
        }
    }

    // Add other find methods if necessary, e.g., find_by_account_id

    #[allow(dead_code)]
    fn update(&self) -> Result<()> { Ok(()) }
    #[allow(dead_code)]
    fn delete(&self) -> Result<()> { Ok(()) }
} 