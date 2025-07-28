use axum::{
    routing::get,
    Router,
};
use std::sync::Arc;
use tower::ServiceBuilder;
use tower_http::{
    cors::CorsLayer,
    trace::TraceLayer,
};

use crate::db::repositories::DBPool;
use crate::handlers::{
    oracles::{get_oracles, get_oracle_by_id},
    price_feeds::{get_price_feeds, get_price_feed_by_id},
};

pub fn create_router(db_pool: Arc<DBPool>) -> Router {
    // API v0 routes
    let api_v0 = Router::new()
        // Oracle routes
        .route("/oracles", get(get_oracles))
        .route("/oracles/:id", get(get_oracle_by_id))
        // Price feed routes  
        .route("/price-feeds", get(get_price_feeds))
        .route("/price-feeds/:id", get(get_price_feed_by_id));

    // Main router with middleware
    Router::new()
        .nest("/v0", api_v0)
        .layer(
            ServiceBuilder::new()
                .layer(TraceLayer::new_for_http())
                .layer(CorsLayer::permissive())
        )
        .with_state(db_pool)
} 