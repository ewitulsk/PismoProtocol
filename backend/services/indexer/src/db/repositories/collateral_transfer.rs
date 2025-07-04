use std::sync::Arc;
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, PooledConnection};
use anyhow::Result;
use crate::db::postgres::schema::collateral_transfers;
use crate::db::postgres::schema::collateral_transfers::dsl::*;
use crate::db::models::collateral_transfer::{CollateralTransfer, NewCollateralTransfer};
use crate::db::repositories::DBPool;

pub struct CollateralTransferRepository {
    pool: Arc<DBPool>,
}

impl CollateralTransferRepository {
    pub fn new(pool: Arc<DBPool>) -> Self {
        CollateralTransferRepository { pool }
    }

    fn get_conn(&self) -> Result<PooledConnection<ConnectionManager<PgConnection>>> {
        self.pool.get().map_err(anyhow::Error::from)
    }

    pub fn create(&self, new_event: NewCollateralTransfer) -> Result<CollateralTransfer> {
        let mut conn = self.get_conn()?;
        diesel::insert_into(collateral_transfers)
            .values(&new_event)
            .get_result(&mut conn)
            .map_err(anyhow::Error::from)
    }

    #[allow(dead_code)]
    pub fn find_by_id(&self, _id: i32) -> Result<Option<CollateralTransfer>> {
        collateral_transfers
            .select(CollateralTransfer::as_select())
            .filter(id.eq(_id))
            .first(&mut self.get_conn()?)
            .optional()
            .map_err(anyhow::Error::from)
    }

    pub fn find_unfulfilled(&self) -> Result<Vec<CollateralTransfer>> {
        collateral_transfers
            .select(CollateralTransfer::as_select())
            .filter(fulfilled.eq(false))
            .load::<CollateralTransfer>(&mut self.get_conn()?)
            .map_err(anyhow::Error::from)
    }
} 