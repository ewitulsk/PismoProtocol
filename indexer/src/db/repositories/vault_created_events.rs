use std::sync::Arc;
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, PooledConnection};
use diesel::pg::PgConnection;
use diesel::result::Error;

use crate::db::models::vault_created_events::{VaultCreatedEvent, NewVaultCreatedEvent};
// Import the DSL from the auto-generated schema
use crate::db::postgres::schema::vault_created_events::dsl::*;
use super::DBPool; // Import DBPool from parent mod.rs

/// Repository struct holding the connection pool for VaultCreatedEvent operations
#[derive(Clone)]
pub struct VaultCreatedEventRepository {
    pool: Arc<DBPool>,
}

impl VaultCreatedEventRepository {
    /// Creates a new repository instance.
    pub fn new(pool: Arc<DBPool>) -> Self {
        VaultCreatedEventRepository { pool }
    }

    fn get_conn(&self) -> Result<PooledConnection<ConnectionManager<PgConnection>>, Error> {
         self.pool.get().map_err(|e| Error::DatabaseError(diesel::result::DatabaseErrorKind::UnableToSendCommand, Box::new(format!("Failed to get DB connection: {}", e))))
    }

    /// Creates a new VaultCreatedEvent record.
    pub fn create(&self, new_item: NewVaultCreatedEvent) -> Result<VaultCreatedEvent, Error> {
        let mut conn = self.get_conn()?;
        diesel::insert_into(vault_created_events) // Use DSL directly
            .values(&new_item)
            .get_result(&mut conn)
    }

    /// Finds a VaultCreatedEvent by its primary key (id).
    pub fn find(&self, pk_id: i32) -> Result<Option<VaultCreatedEvent>, Error> {
        // Remove the explicit use alias, rely on imported dsl::*
        let mut conn = self.get_conn()?;
        vault_created_events // Use DSL directly
            .filter(id.eq(pk_id))
            .first(&mut conn)
            .optional()
    }

    /// Finds a VaultCreatedEvent by its vault address.
    pub fn find_by_vault_address(&self, address: String) -> Result<Option<VaultCreatedEvent>, Error> {
        let mut conn = self.get_conn()?;
        vault_created_events // Use DSL directly
            .filter(vault_address.eq(address))
            .first(&mut conn)
            .optional()
    }

    /// Retrieves all VaultCreatedEvent records from the database.
    pub fn find_all(&self) -> Result<Vec<VaultCreatedEvent>, Error> {
        let mut conn = self.get_conn()?;
        vault_created_events
            .load::<VaultCreatedEvent>(&mut conn)
    }

    /// Updates an existing VaultCreatedEvent identified by its primary key.
    pub fn update(&self, pk_id: i32, changes: &VaultCreatedEvent) -> Result<VaultCreatedEvent, Error> {
        // Remove the explicit use alias, rely on imported dsl::*
        let mut conn = self.get_conn()?;
        diesel::update(vault_created_events.filter(id.eq(pk_id))) // Use DSL directly
            .set(changes)
            .get_result(&mut conn)
    }

    /// Deletes a VaultCreatedEvent by its primary key.
    /// Returns the number of deleted rows (should be 0 or 1).
    pub fn delete(&self, pk_id: i32) -> Result<usize, Error> {
        // Remove the explicit use alias, rely on imported dsl::*
        let mut conn = self.get_conn()?;
        diesel::delete(vault_created_events.filter(id.eq(pk_id))) // Use DSL directly
            .execute(&mut conn)
    }
} 