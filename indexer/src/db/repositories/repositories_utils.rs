use std::sync::Arc;
use diesel::prelude::*;
use diesel::pg::PgConnection;
use diesel::result::Error;
use diesel::sql_types::Text;
use diesel::RunQueryDsl;

use super::DBPool; // Use DBPool from parent mod
use crate::db::models::open_position_events::OpenPositionEvent; // Needs QueryableByName

/// Fetches all open positions for a given account ID asynchronously.
///
/// An open position is defined as an entry in `open_position_events` that does not
/// have a corresponding entry in `close_position_events` with the same `position_id`.
/// Wraps the synchronous Diesel query in `spawn_blocking`.
pub async fn get_open_positions_for_account(
    pool: Arc<DBPool>, // Take ownership of Arc or clone inside
    target_account_id: String,
) -> Result<Vec<OpenPositionEvent>, Error> { // Return original Result type

    let result = tokio::task::spawn_blocking(move || {
        let mut conn = pool.get().map_err(|e| Error::DatabaseError(diesel::result::DatabaseErrorKind::UnableToSendCommand, Box::new(format!("Spawn_blocking: Failed to get DB connection: {}", e))))?;

        // Raw SQL query using NOT EXISTS.
        // It selects all columns from open_position_events aliased as 'ope'.
        // Make sure the columns match the OpenPositionEvent struct for QueryableByName.
        let query = r#"
            SELECT
                ope.transaction_hash,
                ope.position_id,
                ope.position_type,
                ope.amount,
                ope.leverage_multiplier,
                ope.entry_price,
                ope.entry_price_decimals,
                ope.supported_positions_token_i,
                ope.price_feed_id_bytes,
                ope.account_id,
                ope.timestamp
            FROM open_position_events ope
            WHERE ope.account_id = $1
            AND NOT EXISTS (
                SELECT 1
                FROM close_position_events cpe
                WHERE cpe.position_id = ope.position_id
            );
        "#;

        diesel::sql_query(query)
            .bind::<Text, _>(target_account_id)
            .load::<OpenPositionEvent>(&mut conn) // Load results into Vec<OpenPositionEvent>
    }).await;

    // Handle potential JoinError from spawn_blocking and flatten the Result
    result.map_err(|join_err| {
        // Convert JoinError to diesel::result::Error (or a custom error type)
        Error::DatabaseError(diesel::result::DatabaseErrorKind::Unknown, Box::new(format!("Task execution failed: {}", join_err)))
    })?
} 