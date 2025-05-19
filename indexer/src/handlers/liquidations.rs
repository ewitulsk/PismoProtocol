use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use tracing::{error, debug};

use crate::router::AppState;
use crate::db::models::position_liquidated_event::PositionLiquidatedEvent;
use crate::db::repositories::position_liquidated_event::PositionLiquidatedEventRepository;
use crate::db::models::collateral_marker_liquidated_event::CollateralMarkerLiquidatedEvent;
use crate::db::repositories::collateral_marker_liquidated_event::CollateralMarkerLiquidatedEventRepository;

// Handler for GET /v0/liquidations/positions
pub async fn get_all_position_liquidated_events(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    debug!("Fetching all position liquidated events");

    let repo = PositionLiquidatedEventRepository::new(state.pool.clone());

    match tokio::task::spawn_blocking(move || repo.get_all()).await {
        Ok(Ok(events)) => {
            Ok(Json(events))
        },
        Ok(Err(db_err)) => {
            error!("Database error fetching all position liquidated events: {}", db_err);
            Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", db_err)))
        },
        Err(join_err) => {
            error!("Task join error fetching all position liquidated events: {}", join_err);
            Err((StatusCode::INTERNAL_SERVER_ERROR, "Failed to execute database query".to_string()))
        }
    }
}

// Handler for GET /v0/liquidations/collateral-markers
pub async fn get_all_collateral_marker_liquidated_events(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    debug!("Fetching all collateral marker liquidated events");

    let repo = CollateralMarkerLiquidatedEventRepository::new(state.pool.clone());

    match tokio::task::spawn_blocking(move || repo.get_all()).await {
        Ok(Ok(events)) => {
            Ok(Json(events))
        },
        Ok(Err(db_err)) => {
            error!("Database error fetching all collateral marker liquidated events: {}", db_err);
            Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", db_err)))
        },
        Err(join_err) => {
            error!("Task join error fetching all collateral marker liquidated events: {}", join_err);
            Err((StatusCode::INTERNAL_SERVER_ERROR, "Failed to execute database query".to_string()))
        }
    }
} 