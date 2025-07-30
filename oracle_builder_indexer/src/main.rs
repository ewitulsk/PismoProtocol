use anyhow::{Result, Context};
use tracing::{info, error};
use tracing_subscriber;
use sui_data_ingestion_core::setup_single_workflow;
use std::sync::Arc;
use axum::serve;
use tokio::net::TcpListener;

use oracle_builder_indexer::{Config, OracleBuilderWorker};
use oracle_builder_indexer::db::repositories::DBPool;
use oracle_builder_indexer::router::create_router;
use oracle_builder_indexer::websocket::{WebSocketState, run_broadcast_handler};

async fn create_db_pool(config: &Config) -> Result<Arc<DBPool>> {
    use diesel_async::pooled_connection::deadpool::Pool;
    use diesel_async::pooled_connection::AsyncDieselConnectionManager;
    use diesel_async::AsyncPgConnection;

    let database_url = config.database_url();
    info!("Connecting to database: {}", database_url);

    let manager = AsyncDieselConnectionManager::<AsyncPgConnection>::new(&database_url);
    let pool = Pool::builder(manager)
        .max_size(config.database.pool_size as usize)
        .build()
        .context("Failed to create database pool")?;

    info!("Database pool created successfully with {} connections", config.database.pool_size);
    Ok(Arc::new(pool))
}

async fn run_api_server(config: &Config, db_pool: Arc<DBPool>, ws_state: WebSocketState) -> Result<()> {
    let app = create_router(db_pool, ws_state);
    
    let bind_address = format!("{}:{}", config.api.host, config.api.port);
    let listener = TcpListener::bind(&bind_address)
        .await
        .context("Failed to bind to address")?;
    
    info!("API server with WebSocket support starting on http://{}", bind_address);
    info!("WebSocket endpoint available at ws://{}/ws", bind_address);
    
    serve(listener, app)
        .await
        .context("API server failed")?;
    
    Ok(())
}

async fn run_indexer(config: &Config, db_pool: Arc<DBPool>, ws_state: WebSocketState) -> Result<()> {
    // Create the worker with database pool
    let mut worker = OracleBuilderWorker::new(config, db_pool);
    
    // Set up WebSocket broadcast sender
    worker.set_broadcast_sender(ws_state.broadcast_sender.clone());
    
    info!("Oracle Builder Worker initialized successfully");

    // Setup the indexer workflow to connect to Sui's data ingestion pipeline
    info!("Setting up indexer workflow...");
    let (indexer_executor, _term_sender) = setup_single_workflow(
        worker,
        config.indexer.remote_store_url.clone(),
        config.indexer.start_checkpoint,
        config.indexer.concurrency,
        None,
    )
    .await
    .context("Failed to setup indexer workflow")?;
    
    info!("Indexer workflow ready. Processing checkpoints from Sui network...");

    // Run the indexer
    match indexer_executor.await {
        Ok(_) => info!("Oracle Builder Indexer finished gracefully."),
        Err(e) => {
            error!(error = %e, "Oracle Builder Indexer failed.");
            return Err(e);
        }
    }

    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    info!("Starting Oracle Builder Indexer with API Server");

    let config_path = std::env::var("CONFIG_PATH")
        .unwrap_or_else(|_| "config/testnet.toml".to_string());
    
    let config = match Config::load(&config_path) {
        Ok(config) => config,
        Err(e) => {
            error!("Failed to load configuration from {}: {}", config_path, e);
            return Err(e);
        }
    };

    // Create database pool
    let db_pool = create_db_pool(&config).await
        .context("Failed to create database pool")?;

    // Test database connection
    match db_pool.get().await {
        Ok(_) => info!("Database connection test successful"),
        Err(e) => {
            error!("Failed to get database connection: {}", e);
            return Err(anyhow::anyhow!("Database connection failed: {}", e));
        }
    }

    // Create WebSocket state and broadcast handler
    let (ws_state, broadcast_receiver) = WebSocketState::new();
    
    // Start the WebSocket broadcast handler
    let broadcast_task = {
        let client_manager = ws_state.client_manager.clone();
        tokio::spawn(run_broadcast_handler(client_manager, broadcast_receiver))
    };

    // Run the API server, indexer, and broadcast handler concurrently
    let api_server_task = {
        let config = config.clone();
        let db_pool = db_pool.clone();
        let ws_state = ws_state.clone();
        tokio::spawn(async move {
            if let Err(e) = run_api_server(&config, db_pool, ws_state).await {
                error!("API server error: {}", e);
            }
        })
    };

    let indexer_task = {
        let config = config.clone();
        let db_pool = db_pool.clone();
        let ws_state = ws_state.clone();
        tokio::spawn(async move {
            if let Err(e) = run_indexer(&config, db_pool, ws_state).await {
                error!("Indexer error: {}", e);
            }
        })
    };

    info!("API server, indexer, and WebSocket services started successfully");

    // Wait for any task to complete (or fail)
    tokio::select! {
        _ = api_server_task => {
            info!("API server task completed");
        }
        _ = indexer_task => {
            info!("Indexer task completed");
        }
        _ = broadcast_task => {
            info!("WebSocket broadcast task completed");
        }
    }

    info!("Oracle Builder Indexer shutting down");
    Ok(())
}
