use anyhow::{Result, Context};
use tracing::{info, error};
use tracing_subscriber;
use sui_data_ingestion_core::setup_single_workflow;
use std::sync::Arc;

use oracle_builder_indexer::{Config, OracleBuilderWorker};
use oracle_builder_indexer::db::repositories::DBPool;

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

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    info!("Starting Oracle Builder Indexer");

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

    // Create the worker with database pool
    let worker = OracleBuilderWorker::new(&config, db_pool);
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

    info!("Oracle Builder Indexer shutting down");
    Ok(())
}
