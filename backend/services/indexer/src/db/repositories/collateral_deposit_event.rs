use crate::db::models::collateral_deposit_event::{CollateralDepositEvent, NewCollateralDepositEvent};
use crate::db::postgres::schema::collateral_deposit_events::dsl::*;
use crate::db::postgres::schema::collateral_marker_liquidated_events;
use crate::db::postgres::schema::collateral_combine_events;
use crate::db::postgres::schema::collateral_withdraw_events;
use crate::db::repositories::DBPool;
use anyhow::{Context, Result};
use diesel::prelude::*;
use diesel::result::Error as DieselError;
use std::sync::Arc;
use tracing::{error, debug};

#[derive(Clone)]
pub struct CollateralDepositEventRepository {
    pool: Arc<DBPool>,
}

impl CollateralDepositEventRepository {
    pub fn new(pool: Arc<DBPool>) -> Self {
        CollateralDepositEventRepository { pool }
    }

    fn get_conn(&self) -> Result<diesel::r2d2::PooledConnection<diesel::r2d2::ConnectionManager<diesel::PgConnection>>> {
        self.pool.get().context("Failed to get DB connection")
    }

    pub fn create(&self, new_event: NewCollateralDepositEvent) -> Result<CollateralDepositEvent> {
        let mut conn = self.get_conn()?;
        let result = diesel::insert_into(collateral_deposit_events)
            .values(&new_event)
            .on_conflict(transaction_hash)
            .do_nothing() // Or specify update logic if needed
            .get_result(&mut conn);
        
        match result {
            Ok(event) => Ok(event),
            Err(DieselError::NotFound) => {
                debug!(tx_hash = %new_event.transaction_hash, "CollateralDepositEvent with this transaction_hash already exists due to conflict, fetching existing record.");
                collateral_deposit_events
                    .filter(transaction_hash.eq(&new_event.transaction_hash))
                    .first(&mut conn)
                    .map_err(|fetch_err| {
                        error!(original_event = ?new_event, error = ?fetch_err, "Failed to fetch existing CollateralDepositEvent after insert conflict");
                        anyhow::anyhow!("Failed to fetch existing CollateralDepositEvent after insert conflict: {}", fetch_err)
                    })
            }
            Err(insert_err) => {
                error!(event = ?new_event, error = ?insert_err, "Failed to insert CollateralDepositEvent");
                Err(anyhow::anyhow!("Failed to insert CollateralDepositEvent: {}", insert_err))
            }
        }
    }

    #[allow(dead_code)]
    pub fn find(&self, tx_hash: &str) -> Result<Option<CollateralDepositEvent>> {
        let mut conn = self.get_conn()?;
        match collateral_deposit_events
            .filter(transaction_hash.eq(tx_hash))
            .first::<CollateralDepositEvent>(&mut conn)
        {
            Ok(event) => Ok(Some(event)),
            Err(DieselError::NotFound) => Ok(None),
            Err(e) => {
                error!(tx_hash = %tx_hash, error = ?e, "Failed to find CollateralDepositEvent");
                Err(anyhow::anyhow!("Failed to find CollateralDepositEvent: {}", e))
            }
        }
    }

    pub fn find_by_account_id(&self, target_account_id: &str) -> Result<Vec<CollateralDepositEvent>> {
        let mut conn = self.get_conn()?;
        match collateral_deposit_events
            .filter(account_id.eq(target_account_id))
            .filter(diesel::dsl::not(diesel::dsl::exists(
                collateral_marker_liquidated_events::table
                    .filter(collateral_marker_liquidated_events::collateral_marker_id.eq(collateral_marker_id))
            )))
            .filter(diesel::dsl::not(diesel::dsl::exists(
                collateral_withdraw_events::table
                    .filter(collateral_withdraw_events::collateral_marker_id.eq(collateral_marker_id))
                    .filter(collateral_withdraw_events::marker_destroyed.eq(true))
            )))
            .filter(diesel::dsl::not(diesel::dsl::exists(
                collateral_combine_events::table
                    .filter(
                        collateral_combine_events::old_collateral_marker_id1.eq(collateral_marker_id)
                        .or(collateral_combine_events::old_collateral_marker_id2.eq(collateral_marker_id))
                    )
            )))
            .load::<CollateralDepositEvent>(&mut conn)
        {
            Ok(events) => Ok(events),
            Err(DieselError::NotFound) => Ok(Vec::new()), // Return empty vec if no records found
            Err(e) => {
                error!(account_id = %target_account_id, error = ?e, "Failed to find CollateralDepositEvents by account ID");
                Err(anyhow::anyhow!("Failed to find CollateralDepositEvents by account ID: {}", e))
            }
        }
    }

    pub fn find_by_account_id_and_token_address(&self, target_account_id: &str, target_token_address: &str) -> Result<Vec<CollateralDepositEvent>> {
        let mut conn = self.get_conn()?;
        match collateral_deposit_events
            .filter(account_id.eq(target_account_id))
            .filter(token_address.eq(target_token_address))
            .filter(diesel::dsl::not(diesel::dsl::exists(
                collateral_marker_liquidated_events::table
                    .filter(collateral_marker_liquidated_events::collateral_marker_id.eq(collateral_marker_id))
            )))
            .filter(diesel::dsl::not(diesel::dsl::exists(
                collateral_withdraw_events::table
                    .filter(collateral_withdraw_events::collateral_marker_id.eq(collateral_marker_id))
                    .filter(collateral_withdraw_events::marker_destroyed.eq(true))
            )))
            .filter(diesel::dsl::not(diesel::dsl::exists(
                collateral_combine_events::table
                    .filter(
                        collateral_combine_events::old_collateral_marker_id1.eq(collateral_marker_id)
                        .or(collateral_combine_events::old_collateral_marker_id2.eq(collateral_marker_id))
                    )
            )))
            .load::<CollateralDepositEvent>(&mut conn)
        {
            Ok(events) => Ok(events),
            Err(DieselError::NotFound) => Ok(Vec::new()),
            Err(e) => {
                error!(account_id = %target_account_id, token_address = %target_token_address, error = ?e, "Failed to find CollateralDepositEvents by account ID and token info");
                Err(anyhow::anyhow!("Failed to find CollateralDepositEvents by account ID and token info: {}", e))
            }
        }
    }

    // Implement update/delete if needed, otherwise leave as dead_code
    #[allow(dead_code)]
    fn update(&self) -> Result<()> { Ok(()) }
    #[allow(dead_code)]
    fn delete(&self) -> Result<()> { Ok(()) }

} 