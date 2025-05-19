use axum::{
    routing::get,
    Router,
    http::{Method, header::HeaderValue}, // Correctly import Method and HeaderValue
    middleware,
};
use tower_http::cors::{Any, CorsLayer};
use std::sync::Arc;

use crate::handlers::positions::{get_account_positions, get_all_positions};
use crate::handlers::vaults::{get_all_vaults, get_vault_by_address};
use crate::handlers::collateral::{get_account_collateral, get_account_collateral_by_token_address, get_latest_collateral_assertion_by_account_id}; // Import the new collateral handler
use crate::handlers::accounts::{get_account_by_id, get_all_accounts}; // Import the new accounts handlers
use crate::handlers::transfers::{get_unfulfilled_vault_transfers, get_unfulfilled_collateral_transfers}; // Added
use crate::handlers::liquidations::{get_all_position_liquidated_events, get_all_collateral_marker_liquidated_events}; // Added
use crate::db::repositories::DBPool; // Import DBPool from the repo mod

// Define the application state struct
#[derive(Clone)]
pub struct AppState {
    pub pool: Arc<DBPool>,
    // Add other shared state fields here later
}


// Function to create the Axum router
pub fn create_router(pool: Arc<DBPool>) -> Router {
    // Create the application state
    let app_state = AppState {
        pool,
    };

    // Define CORS layer (permissive for development)
    let cors = CorsLayer::new()
        .allow_origin(Any) // Allow any origin
        .allow_methods(Any) // Allow any method (GET, POST, etc.)
        .allow_headers(Any); // Allow any header

    Router::new()
        // Route for all positions
        .route("/v0/positions", get(get_all_positions))
        // Updated positions route for a specific account
        .route("/v0/:account_id/positions", get(get_account_positions))
        // New collateral route
        .route("/v0/:account_id/collateral", get(get_account_collateral))
        // New collateral route with token info
        .route("/v0/:account_id/collateral/:token_info", get(get_account_collateral_by_token_address))
        // New collateral assertion route
        .route("/v0/:account_id/collateral-assertion", get(get_latest_collateral_assertion_by_account_id))
        // New accounts route
        .route("/v0/accounts/:account_id", get(get_account_by_id))
        .route("/v0/accounts", get(get_all_accounts)) // Add route for getting all accounts
        .route("/v0/vaults", get(get_all_vaults))
        // Add the new route for getting a single vault by address
        .route("/v0/vaults/:vault_address", get(get_vault_by_address))
        // Add routes for unfulfilled transfers
        .route("/v0/vault-transfers/unfulfilled", get(get_unfulfilled_vault_transfers)) // Added
        .route("/v0/collateral-transfers/unfulfilled", get(get_unfulfilled_collateral_transfers)) // Added
        // Add routes for liquidation events
        .route("/v0/liquidations/positions", get(get_all_position_liquidated_events)) // Added
        .route("/v0/liquidations/collateral-markers", get(get_all_collateral_marker_liquidated_events)) // Added
        .with_state(app_state) // Pass the AppState instance
        .layer(cors) // Apply the CORS middleware
}
