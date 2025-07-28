use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::{error, info};

use crate::db::repositories::{oracle::OracleRepository, DBPool, base::BaseRepository};
use crate::db::models::oracle::Oracle;

#[derive(Debug, Deserialize)]
pub struct OracleQuery {
    owner_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    success: bool,
    data: Option<T>,
    error: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(message: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message),
        }
    }
}

/// GET /v0/oracles
/// Returns all oracles or filters by owner_id if provided
pub async fn get_oracles(
    Query(params): Query<OracleQuery>,
    State(pool): State<Arc<DBPool>>,
) -> Result<Json<ApiResponse<Vec<Oracle>>>, StatusCode> {
    info!("GET /v0/oracles - params: {:?}", params);
    
    let repo = OracleRepository::new(pool);
    
    let result = match params.owner_id {
        Some(owner_id) => {
            info!("Fetching oracles for owner: {}", owner_id);
            repo.find_by_owner(&owner_id).await
        },
        None => {
            info!("Fetching all oracles");
            repo.find_all().await
        }
    };

    match result {
        Ok(oracles) => {
            info!("Successfully retrieved {} oracles", oracles.len());
            Ok(Json(ApiResponse::success(oracles)))
        },
        Err(e) => {
            error!("Failed to retrieve oracles: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

/// GET /v0/oracles/:id
/// Returns a specific oracle by ID
pub async fn get_oracle_by_id(
    Path(id): Path<String>,
    State(pool): State<Arc<DBPool>>,
) -> Result<Json<ApiResponse<Oracle>>, StatusCode> {
    info!("GET /v0/oracles/{}", id);
    
    let repo = OracleRepository::new(pool);
    
    match repo.find(&id).await {
        Ok(Some(oracle)) => {
            info!("Successfully retrieved oracle: {}", id);
            Ok(Json(ApiResponse::success(oracle)))
        },
        Ok(None) => {
            info!("Oracle not found: {}", id);
            Err(StatusCode::NOT_FOUND)
        },
        Err(e) => {
            error!("Failed to retrieve oracle {}: {}", id, e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
} 