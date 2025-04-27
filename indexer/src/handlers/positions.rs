use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use tracing::{error, debug};
use diesel::result::Error as DieselError; // Import Diesel Error for matching
use tokio::task; // Import tokio::task for spawn_blocking

// Import AppState
use crate::router::AppState;
// Import the model needed for the success response type
use crate::db::models::open_position_events::OpenPositionEvent;
// Import the repository
use crate::db::repositories::open_position_events::OpenPositionEventRepository;
// Import the remaining utility function
use crate::db::repositories::repositories_utils::{get_all_open_positions};

// Handler for GET /v0/positions/:account_id
pub async fn get_account_positions(
    State(state): State<AppState>,
    Path(account_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    debug!("Fetching open positions for account: {}", account_id);

    let repo = OpenPositionEventRepository::new(state.pool.clone());

    let result = task::spawn_blocking(move || {
        repo.get_open_positions_for_account(account_id)
    }).await;

    match result {
        Ok(Ok(positions)) => {
            Ok(Json(positions))
        },
        Ok(Err(db_err)) => {
            error!("Database error fetching positions: {}", db_err);
            if matches!(db_err, DieselError::NotFound) {
                Err((StatusCode::NOT_FOUND, "Account or positions not found".to_string()))
            } else {
                Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", db_err)))
            }
        },
        Err(join_err) => {
            error!("Task join error fetching positions: {}", join_err);
            Err((StatusCode::INTERNAL_SERVER_ERROR, "Failed to execute database query".to_string()))
        }
    }
}

// Handler for GET /v0/positions
pub async fn get_all_positions(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    debug!("Fetching all open positions");

    // Call the async repository function directly
    let result = get_all_open_positions(state.pool.clone()).await;

    match result {
        Ok(positions) => {
            // Successfully fetched positions, return Json directly
            Ok(Json(positions))
        },
        Err(db_err) => {
            // Handle Diesel error
            error!("Database error fetching all positions: {}", db_err);
            // Wrap the error tuple in Err
            Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", db_err)))
        },
    }
}
