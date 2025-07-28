use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
};
use std::sync::Arc;
use tracing::{error, info};

use crate::db::repositories::{price_feed::PriceFeedRepository, DBPool, base::BaseRepository};
use crate::db::models::price_feed::PriceFeed;
use crate::handlers::oracles::ApiResponse;

/// GET /v0/price-feeds
/// Returns all price feeds
pub async fn get_price_feeds(
    State(pool): State<Arc<DBPool>>,
) -> Result<Json<ApiResponse<Vec<PriceFeed>>>, StatusCode> {
    info!("GET /v0/price-feeds");
    
    let repo = PriceFeedRepository::new(pool);
    
    match repo.find_all().await {
        Ok(price_feeds) => {
            info!("Successfully retrieved {} price feeds", price_feeds.len());
            Ok(Json(ApiResponse::success(price_feeds)))
        },
        Err(e) => {
            error!("Failed to retrieve price feeds: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

/// GET /v0/price-feeds/:id  
/// Returns a specific price feed by ID
pub async fn get_price_feed_by_id(
    Path(id): Path<String>,
    State(pool): State<Arc<DBPool>>,
) -> Result<Json<ApiResponse<PriceFeed>>, StatusCode> {
    info!("GET /v0/price-feeds/{}", id);
    
    let repo = PriceFeedRepository::new(pool);
    
    match repo.find(&id).await {
        Ok(Some(price_feed)) => {
            info!("Successfully retrieved price feed: {}", id);
            Ok(Json(ApiResponse::success(price_feed)))
        },
        Ok(None) => {
            info!("Price feed not found: {}", id);
            Err(StatusCode::NOT_FOUND)
        },
        Err(e) => {
            error!("Failed to retrieve price feed {}: {}", id, e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
} 