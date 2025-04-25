use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use tracing::{error, debug};
use diesel::result::Error as DieselError; // Import Diesel Error for matching

// Import AppState
use crate::router::AppState;
// Import the model needed for the success response type
use crate::db::models::open_position_events::OpenPositionEvent;
// Removed direct DBPool import, accessed via AppState
use crate::db::repositories::repositories_utils::get_open_positions_for_account;

// Handler for GET /v0/positions/:account_id
pub async fn get_account_positions(
    State(state): State<AppState>,
    Path(account_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    debug!("Fetching open positions for account: {}", account_id);

    // Call the async repository function directly
    let result = get_open_positions_for_account(state.pool.clone(), account_id).await;

    match result {
        Ok(positions) => {
            // Successfully fetched positions, return Json directly
            Ok(Json(positions))
        },
        Err(db_err) => {
            // Handle Diesel error
            error!("Database error fetching positions: {}", db_err);
            // Wrap the error tuple in Err
            if matches!(db_err, DieselError::NotFound) {
                 Err((StatusCode::NOT_FOUND, "Account or positions not found".to_string()))
            } else {
                Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", db_err)))
            }
        },
        // No JoinError to handle here anymore
    }
}
