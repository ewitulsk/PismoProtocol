use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use tracing::{debug, error};

// Import AppState
use crate::router::AppState;
// Import the repository
use crate::db::repositories::new_account_event::NewAccountEventRepository;
// Import the model needed for the success response type (assuming it's NewAccountEvent)
// use crate::db::models::new_account_event::NewAccountEvent;

// Handler for GET /v0/accounts/:account_id
pub async fn get_account_by_id(
    State(state): State<AppState>,
    Path(acc_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    debug!("Fetching account event for account_id: {}", acc_id);

    // Create repository instance
    let repo = NewAccountEventRepository::new(state.pool.clone());

    // Call the repository function
    match repo.find_by_account_id(&acc_id) {
        Ok(Some(account_event)) => {
            // Successfully fetched the account event
            Ok(Json(account_event))
        }
        Ok(None) => {
            // Account event not found
            let error_msg = format!("Account with ID {} not found", acc_id);
            error!(error_msg);
            Err((StatusCode::NOT_FOUND, error_msg))
        }
        Err(db_err) => {
            // Handle database error
            error!("Database error fetching account by ID {}: {}", acc_id, db_err);
            Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", db_err)))
        }
    }
}

// Handler for GET /v0/accounts
pub async fn get_all_accounts(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    debug!("Fetching all account events");

    // Create repository instance
    let repo = NewAccountEventRepository::new(state.pool.clone());

    // Call the repository function to find all accounts
    match repo.find_all() { // Assuming find_all() exists or needs to be created in the repo
        Ok(accounts) => {
            // Successfully fetched all account events
            Ok(Json(accounts))
        }
        Err(db_err) => {
            // Handle database error
            error!("Database error fetching all accounts: {}", db_err);
            Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", db_err)))
        }
    }
} 