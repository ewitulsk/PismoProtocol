use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;
use tracing::{error, debug};

// Import AppState
use crate::router::AppState;
// Removed direct DBPool import, accessed via AppState
use crate::db::repositories::repositories_utils::get_open_positions_for_account;
use crate::db::models::open_position_events::OpenPositionEvent;

// Handler for GET /v0/positions/:account_id
pub async fn get_account_positions(
    State(state): State<AppState>,
    Path(account_id): Path<String>,
) -> impl IntoResponse {
    debug!("Fetching open positions for account: {}", account_id);

    // Call the async repository function directly
    let result = get_open_positions_for_account(state.pool.clone(), account_id).await;

    match result {
        Ok(positions) => {
            // Successfully fetched positions
            (StatusCode::OK, Json(positions)).into_response()
        },
        Err(db_err) => {
            // Handle Diesel error
            error!("Database error fetching positions: {}", db_err);
            // Consider more specific error mapping based on db_err type
            if matches!(db_err, diesel::result::Error::NotFound) {
                 (StatusCode::NOT_FOUND, "Account or positions not found".to_string()).into_response()
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", db_err)).into_response()
            }
        },
        // No JoinError to handle here anymore
    }
}
