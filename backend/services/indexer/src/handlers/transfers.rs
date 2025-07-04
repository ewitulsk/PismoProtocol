use axum::response::IntoResponse;
use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
};
use std::sync::Arc;
use tracing::{info, error};

use crate::db::models::vault_transfer::VaultTransfer;
use crate::db::models::collateral_transfer::CollateralTransfer;
use crate::db::repositories::vault_transfer::VaultTransferRepository;
use crate::db::repositories::collateral_transfer::CollateralTransferRepository;
use crate::router::AppState;

pub async fn get_unfulfilled_vault_transfers(
    State(state): State<AppState>
) -> Result<impl IntoResponse, (StatusCode, String)> {
    info!("Fetching unfulfilled vault transfers");
    let repo = VaultTransferRepository::new(state.pool.clone()); // Create repo instance
    match repo.find_unfulfilled() {
        Ok(transfers) => Ok(Json(transfers)),
        Err(e) => {
            error!("Failed to fetch unfulfilled vault transfers: {}", e);
            Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
        }
    }
}

pub async fn get_unfulfilled_collateral_transfers(
    State(state): State<AppState>
) -> Result<impl IntoResponse, (StatusCode, String)> {
    info!("Fetching unfulfilled collateral transfers");
    let repo = CollateralTransferRepository::new(state.pool.clone()); // Create repo instance
    match repo.find_unfulfilled() {
        Ok(transfers) => Ok(Json(transfers)),
        Err(e) => {
            error!("Failed to fetch unfulfilled collateral transfers: {}", e);
            Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
        }
    }
} 