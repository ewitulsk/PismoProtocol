use std::sync::Arc;
use diesel::result::Error;
use tokio::task;
use tracing::error;

use super::DBPool; // Use DBPool from parent mod
use crate::db::models::open_position_events::OpenPositionEvent; // Needs QueryableByName
use super::open_position_events::OpenPositionEventRepository; // Assuming this is the correct path

/// Asynchronously fetches all open positions from the database.
pub async fn get_all_open_positions(pool: Arc<DBPool>) -> Result<Vec<OpenPositionEvent>, Error> {
    let repo = OpenPositionEventRepository::new(pool); // Create repository instance

    // Spawn the blocking database operation onto a dedicated thread
    task::spawn_blocking(move || {
        repo.get_all() // Call the synchronous get_all method
    })
    .await
    .map_err(|e| {
        // Handle JoinError if the task panicked or was cancelled
        error!("Task join error fetching all positions: {}", e);
        Error::QueryBuilderError(Box::new(e)) // Represent JoinError as a DieselError variant
    })? // Propagate the JoinError converted to DieselError
    // The outer '?' propagates the DieselError from the repo.get_all() call
}