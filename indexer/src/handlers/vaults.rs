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
use crate::db::repositories::vault_created_events::VaultCreatedEventRepository;

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

#[axum::debug_handler]
pub async fn get_vault_by_address(
    State(state): State<AppState>,
    axum::extract::Path(vault_addr): axum::extract::Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    debug!("Fetching vault with address: {}", vault_addr);

    // Create repository instance
    let repo = VaultCreatedEventRepository::new(state.pool.clone());

    // Call the repository function
    match repo.find_by_vault_address(vault_addr.clone()) { // Clone vault_addr as it's moved into find_by_vault_address
        Ok(Some(vault)) => {
            // Successfully fetched the vault
            Ok(Json(vault))
        },
        Ok(None) => {
            // Vault not found
            let error_msg = format!("Vault with address {} not found", vault_addr);
            error!(error_msg);
            Err((StatusCode::NOT_FOUND, error_msg))
        },
        Err(db_err) => {
            // Handle Diesel error
            error!("Database error fetching vault by address {}: {}", vault_addr, db_err);
            Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", db_err)))
        }
    }
} 