use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Utc};
use tracing::{error, debug};

// Import AppState and Repository
use crate::router::AppState;
use crate::db::models::vault_created_events::VaultCreatedEvent;
use crate::db::repositories::vault_created_events::VaultCreatedEventRepository;

pub struct VaultCreatedEventResponse {
    pub transaction_hash: String,
    pub vault_address: String,
    pub vault_marker_address: String,
    pub coin_token_info: String,
    pub lp_token_info: String,
    pub timestamp: DateTime<Utc>,
}

#[axum::debug_handler]
pub async fn get_all_vaults(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    debug!("Fetching all vault created events");

    // Create repository instance
    let repo = VaultCreatedEventRepository::new(state.pool.clone());

    // Call the repository function
    match repo.find_all() {
        Ok(vaults) => {
            // Successfully fetched vaults
            Ok(Json(vaults))
        },
        Err(db_err) => {
            // Handle Diesel error
            error!("Database error fetching vaults: {}", db_err);
            Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", db_err)))
        }
    }
} 