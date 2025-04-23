use axum::{
    routing::get,
    Router,
};
use std::sync::Arc;

use crate::handlers::positions::get_account_positions;
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
        .route("/v0/positions/:account_id", get(get_account_positions))
        .with_state(app_state) // Pass the AppState instance
}
