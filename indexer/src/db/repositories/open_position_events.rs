use std::sync::Arc;
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, PooledConnection};
use diesel::pg::PgConnection;
use diesel::result::Error;

use crate::db::models::open_position_events::{OpenPositionEvent, NewOpenPositionEvent};
// Import the schema's dsl for easy table access
use crate::db::postgres::schema::open_position_events::dsl::*;
use super::DBPool; // Import DBPool from parent mod.rs

/// Repository struct holding the connection pool for OpenPositionEvent operations
#[derive(Clone)]
pub struct OpenPositionEventRepository {
    pool: Arc<DBPool>,
}

impl OpenPositionEventRepository {
    /// Creates a new repository instance.
    pub fn new(pool: Arc<DBPool>) -> Self {
        OpenPositionEventRepository { pool }
    }

    fn get_conn(&self) -> Result<PooledConnection<ConnectionManager<PgConnection>>, Error> {
         self.pool.get().map_err(|e| Error::DatabaseError(diesel::result::DatabaseErrorKind::UnableToSendCommand, Box::new(format!("Failed to get DB connection: {}", e))))
    }

    /// Creates a new OpenPositionEvent record.
    pub fn create(&self, new_item: NewOpenPositionEvent) -> Result<OpenPositionEvent, Error> {
        let mut conn = self.get_conn()?;
        diesel::insert_into(open_position_events)
            .values(&new_item)
            .get_result(&mut conn)
    }

    /// Finds an OpenPositionEvent by its primary key (transaction_hash).
    pub fn find(&self, id: String) -> Result<Option<OpenPositionEvent>, Error> {
        let mut conn = self.get_conn()?;
        open_position_events
            .find(id)
            .first(&mut conn)
            .optional()
    }

    /// Updates an existing OpenPositionEvent identified by its primary key.
    pub fn update(&self, id: String, changes: &OpenPositionEvent) -> Result<OpenPositionEvent, Error> {
        let mut conn = self.get_conn()?;
        diesel::update(open_position_events.find(id))
            .set(changes)
            .get_result(&mut conn)
    }

    /// Deletes an OpenPositionEvent by its primary key.
    /// Returns the number of deleted rows (should be 0 or 1).
    pub fn delete(&self, id: String) -> Result<usize, Error> {
        let mut conn = self.get_conn()?;
        diesel::delete(open_position_events.find(id))
            .execute(&mut conn)
    }
} 