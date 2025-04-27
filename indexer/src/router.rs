use axum::{
    routing::get,
    Router,
    http::{Method, header::HeaderValue}, // Correctly import Method and HeaderValue
};
use std::sync::Arc;
use tower_http::cors::{CorsLayer, Any}; // Import CorsLayer and Any

use crate::handlers::positions::{get_account_positions, get_all_positions};
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

    // Configure CORS
    // Allow requests specifically from your frontend development server
    let cors = CorsLayer::new()
        // Use HeaderValue from axum::http::header
        .allow_origin("http://localhost:3000".parse::<HeaderValue>().unwrap()) 
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS]) // Allow common methods
        .allow_headers(Any); // Allow all headers for simplicity during development, can be restricted later

    Router::new()
        // Route for all positions
        .route("/v0/positions", get(get_all_positions))
        // Updated positions route for a specific account
        .route("/v0/:account_id/positions", get(get_account_positions))
        // New collateral route
        .route("/v0/:account_id/collateral", get(get_account_collateral))
        .route("/v0/vaults", get(get_all_vaults))
        .with_state(app_state) // Pass the AppState instance
        .layer(cors) // Remove the semicolon here to return the Router
}
