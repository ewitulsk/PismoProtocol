use axum::{
    routing::get,
    Router,
};
use std::sync::Arc;

use crate::handlers::positions::get_account_positions;
use crate::handlers::vaults::get_all_vaults;
use crate::handlers::collateral::get_account_collateral; // Import the new collateral handler
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

    Router::new()
        // Updated positions route
        .route("/v0/:account_id/positions", get(get_account_positions))
        // New collateral route
        .route("/v0/:account_id/collateral", get(get_account_collateral))
        .route("/v0/vaults", get(get_all_vaults))
        .with_state(app_state) // Pass the AppState instance
}
