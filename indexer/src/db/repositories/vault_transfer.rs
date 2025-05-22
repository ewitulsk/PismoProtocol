use std::sync::Arc;
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, PooledConnection};
use anyhow::Result;
use crate::db::postgres::schema::vault_transfers;
use crate::db::postgres::schema::vault_transfers::dsl::*;
use crate::db::models::vault_transfer::{VaultTransfer, NewVaultTransfer};
use crate::db::repositories::DBPool; // Assuming DBPool is defined here or in db/repositories/mod.rs

pub struct VaultTransferRepository {
    pool: Arc<DBPool>,
}

impl VaultTransferRepository {
    pub fn new(pool: Arc<DBPool>) -> Self {
        VaultTransferRepository { pool }
    }

    fn get_conn(&self) -> Result<PooledConnection<ConnectionManager<PgConnection>>> {
        self.pool.get().map_err(anyhow::Error::from)
    }

    pub fn create(&self, new_event: NewVaultTransfer) -> Result<VaultTransfer> {
        let mut conn = self.get_conn()?;
        diesel::insert_into(vault_transfers)
            .values(&new_event)
            .get_result(&mut conn)
            .map_err(anyhow::Error::from)
    }

    #[allow(dead_code)]
    pub fn find_by_id(&self, _id: i32) -> Result<Option<VaultTransfer>> {
        vault_transfers
            .select(VaultTransfer::as_select())
            .filter(id.eq(_id))
            .first(&mut self.get_conn()?)
            .optional()
            .map_err(anyhow::Error::from)
    }

    // This will be used by the new route
    pub fn find_unfulfilled(&self) -> Result<Vec<VaultTransfer>> {
        vault_transfers
            .select(VaultTransfer::as_select())
            .filter(fulfilled.eq(false))
            .load::<VaultTransfer>(&mut self.get_conn()?)
            .map_err(anyhow::Error::from)
    }
} 