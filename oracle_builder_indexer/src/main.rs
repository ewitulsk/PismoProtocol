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

async fn run_api_server(config: &Config, db_pool: Arc<DBPool>) -> Result<()> {
    let app = create_router(db_pool);
    
    let bind_address = format!("{}:{}", config.api.host, config.api.port);
    let listener = TcpListener::bind(&bind_address)
        .await
        .context("Failed to bind to address")?;
    
    info!("API server starting on http://{}", bind_address);
    
    serve(listener, app)
        .await
        .context("API server failed")?;
    
    Ok(())
}

async fn run_indexer(config: &Config, db_pool: Arc<DBPool>) -> Result<()> {
    // Create the worker with database pool
    let worker = OracleBuilderWorker::new(config, db_pool);
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

    // Run both the API server and indexer concurrently
    let api_server_task = {
        let config = config.clone();
        let db_pool = db_pool.clone();
        tokio::spawn(async move {
            if let Err(e) = run_api_server(&config, db_pool).await {
                error!("API server error: {}", e);
            }
        })
    };

    let indexer_task = {
        let config = config.clone();
        let db_pool = db_pool.clone();
        tokio::spawn(async move {
            if let Err(e) = run_indexer(&config, db_pool).await {
                error!("Indexer error: {}", e);
            }
        })
    };

    info!("Both API server and indexer started successfully");

    // Wait for either task to complete (or fail)
    tokio::select! {
        _ = api_server_task => {
            info!("API server task completed");
        }
        _ = indexer_task => {
            info!("Indexer task completed");
        }
    }

    info!("Oracle Builder Indexer shutting down");
    Ok(())
}
