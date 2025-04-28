use axum::{
    routing::get,
    Router,
    middleware,
};
use tower_http::cors::{Any, CorsLayer};
use std::sync::Arc;

use crate::handlers::positions::get_account_positions;
use crate::handlers::vaults::{get_all_vaults, get_vault_by_address};
use crate::handlers::collateral::{get_account_collateral, get_account_collateral_by_token_address}; // Import the new collateral handler
use crate::handlers::accounts::{get_account_by_id, get_all_accounts}; // Import the new accounts handlers
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
        // Updated positions route
        .route("/v0/:account_id/positions", get(get_account_positions))
        // New collateral route
        .route("/v0/:account_id/collateral", get(get_account_collateral))
        // New collateral route with token info
        .route("/v0/:account_id/collateral/:token_info", get(get_account_collateral_by_token_address))
        // New accounts route
        .route("/v0/accounts/:account_id", get(get_account_by_id))
        .route("/v0/accounts", get(get_all_accounts)) // Add route for getting all accounts
        .route("/v0/vaults", get(get_all_vaults))
        // Add the new route for getting a single vault by address
        .route("/v0/vaults/:vault_address", get(get_vault_by_address))
        .with_state(app_state) // Pass the AppState instance
        .layer(cors) // Apply the CORS middleware
}
