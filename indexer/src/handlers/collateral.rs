use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use tracing::{error, debug};
use diesel::result::Error as DieselError;
use serde::Serialize;
use anyhow::{Result, Context};
use bigdecimal::ToPrimitive;
use std::convert::TryInto;

// Import AppState and Repository
use crate::router::AppState;
use crate::db::models::collateral_deposit_event::CollateralDepositEvent as DbCollateralEvent;
use crate::db::repositories::collateral_deposit_event::CollateralDepositEventRepository;

// Define the response structures
#[derive(Serialize, Debug, Clone)]
pub struct TokenIdentifier {
    pub token_address: String
}

#[derive(Serialize, Debug, Clone)]
pub struct CollateralResponse {
    pub collateral_id: [u8; 32],
    pub collateral_marker_id: [u8; 32],
    pub account_id: [u8; 32],
    pub token_id: TokenIdentifier,
    pub amount: u64,
    // We might want to include transaction_hash and timestamp later, but omitting for now per request
}

// Helper function to convert DB model to response model
fn map_db_event_to_response(db_event: DbCollateralEvent) -> Result<CollateralResponse> {
    let collateral_id: [u8; 32] = hex::decode(&db_event.collateral_id)
        .context("Failed to decode collateral_id")?
        .try_into()
        .map_err(|_| anyhow::anyhow!("Decoded collateral_id has incorrect length"))?;
    let collateral_marker_id: [u8; 32] = hex::decode(&db_event.collateral_marker_id)
        .context("Failed to decode collateral_marker_id")?
        .try_into()
        .map_err(|_| anyhow::anyhow!("Decoded collateral_marker_id has incorrect length"))?;
    let account_id: [u8; 32] = hex::decode(&db_event.account_id)
        .context("Failed to decode account_id")?
        .try_into()
        .map_err(|_| anyhow::anyhow!("Decoded account_id has incorrect length"))?;
    

    let amount = db_event.amount.to_u64()
        .context("Failed to convert BigDecimal amount to u64")?;

    Ok(CollateralResponse {
        collateral_id,
        collateral_marker_id,
        account_id,
        token_id: TokenIdentifier {
            token_address: db_event.token_address
        },
        amount,
    })
}

// Handler for GET /v0/:account_id/collateral
pub async fn get_account_collateral(
    State(state): State<AppState>,
    Path(account_id_str): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    debug!("Fetching collateral deposit events for account: {}", account_id_str);

    // Create repository instance
    let repo = CollateralDepositEventRepository::new(state.pool.clone());

    // Call the repository function to find collateral by account ID
    match repo.find_by_account_id(&account_id_str) {
        Ok(db_collateral_events) => {
            // Map DB events to response events
            let response_events: Vec<CollateralResponse> = db_collateral_events
                .into_iter()
                .map(map_db_event_to_response)
                .filter_map(|result| match result {
                    Ok(event) => Some(event),
                    Err(e) => {
                        error!("Failed to map DB collateral event to response: {}", e);
                        None // Skip events that fail mapping
                    }
                })
                .collect();

            // Check if any events were found (considering potential mapping errors)
            if response_events.is_empty() && repo.find_by_account_id(&account_id_str).map(|v| v.is_empty()).unwrap_or(true) {
                 // If the original query was empty OR all items failed mapping, return NotFound
                 // Re-querying to distinguish between no results and mapping failure. This could be optimized.
                 debug!("No collateral found or failed to map for account {}", account_id_str);
                 return Err((StatusCode::NOT_FOUND, format!("No collateral found for account {}", account_id_str)));
            }

            // Successfully fetched and mapped collateral events
            Ok(Json(response_events))
        },
        Err(db_err) => {
            // Handle repository errors
            error!("Database error fetching collateral for account {}: {}", account_id_str, db_err);
            // Don't need to downcast here as find_by_account_id now returns anyhow::Error
            // It returns Ok(vec![]) on DieselError::NotFound, so NotFound shouldn't propagate here.
            Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", db_err)))
        }
    }
}

// Handler for GET /v0/:account_id/collateral/:token_address
pub async fn get_account_collateral_by_token_address(
    State(state): State<AppState>,
    Path((account_id_str, token_address_str)): Path<(String, String)>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    debug!(
        "Fetching collateral deposit events for account: {} and token_address: {}",
        account_id_str,
        token_address_str
    );

    // Create repository instance
    let repo = CollateralDepositEventRepository::new(state.pool.clone());

    // Call the repository function to find collateral by account ID and token info
    match repo.find_by_account_id_and_token_address(&account_id_str, &token_address_str) {
        Ok(db_collateral_events) => {
            // Map DB events to response events
            let response_events: Vec<CollateralResponse> = db_collateral_events
                .into_iter()
                .map(map_db_event_to_response)
                .filter_map(|result| match result {
                    Ok(event) => Some(event),
                    Err(e) => {
                        error!("Failed to map DB collateral event to response: {}", e);
                        None // Skip events that fail mapping
                    }
                })
                .collect();

            // Check if any events were found (considering potential mapping errors)
            // Re-querying to distinguish between no results and mapping failure. This could be optimized.
            if response_events.is_empty() && repo.find_by_account_id_and_token_address(&account_id_str, &token_address_str).map(|v| v.is_empty()).unwrap_or(true) {
                 // If the original query was empty OR all items failed mapping, return NotFound
                 debug!("No collateral found or failed to map for account {} and token_address {}", account_id_str, token_address_str);
                 return Err((StatusCode::NOT_FOUND, format!("No collateral found for account {} with token info {}", account_id_str, token_address_str)));
            }

            // Successfully fetched and mapped collateral events
            Ok(Json(response_events))
        },
        Err(db_err) => {
            // Handle repository errors
            error!(
                "Database error fetching collateral for account {} and token_address {}: {}",
                account_id_str, token_address_str, db_err
            );
            // It returns Ok(vec![]) on DieselError::NotFound, so NotFound shouldn't propagate here.
            Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", db_err)))
        }
    }
} 