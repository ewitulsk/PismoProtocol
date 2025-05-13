use anyhow::{Result, Context};
use diesel::pg::PgConnection;
use diesel::r2d2::{ConnectionManager, Pool};
use std::env;
use std::net::SocketAddr;
use std::sync::Arc;
use sui_data_ingestion_core::setup_single_workflow;
use tokio::net::TcpListener;
use tracing::{error, info};

// Ensure modules are declared
mod config;
mod db;
mod events;
mod handlers;
mod router;
mod callbacks;
mod worker; // Uncomment worker module

// Use the modules
use crate::config::Config;
use crate::db::repositories::{
    close_position_events::ClosePositionEventRepository,
    open_position_events::OpenPositionEventRepository,
    vault_created_events::VaultCreatedEventRepository,
    new_account_event::NewAccountEventRepository,
    collateral_deposit_event::CollateralDepositEventRepository,
    start_collateral_value_assertion_event::StartCollateralValueAssertionEventRepository,
    collateral_transfer::CollateralTransferRepository,
    vault_transfer::VaultTransferRepository,
};
use crate::router::create_router;
use crate::worker::PositionEventWorker;

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    info!("Starting indexer and API server...");

    // --- Configuration ---
    let config_path =
        env::var("CONFIG_PATH").unwrap_or_else(|_| "config/testnet.toml".to_string());
    info!("Loading configuration from: {}", config_path);
    let config = Config::load(&config_path)
        .with_context(|| format!("Failed to load configuration from {}", config_path))?;

    // --- Database Setup ---
    info!("Setting up database connection pool...");
    let manager = ConnectionManager::<PgConnection>::new(&config.database_url);
    let pool = Pool::builder()
        .build(manager)
        .context("Failed to create database connection pool")?;
    let db_pool = Arc::new(pool);
    info!("Database pool created successfully.");

    // --- Initialize Components --- //

    // Repositories (Cloned Arcs needed for both worker and server state)
    let open_repo = Arc::new(OpenPositionEventRepository::new(db_pool.clone()));
    let close_repo = Arc::new(ClosePositionEventRepository::new(db_pool.clone()));
    let vault_repo = Arc::new(VaultCreatedEventRepository::new(db_pool.clone()));
    let new_account_repo = Arc::new(NewAccountEventRepository::new(db_pool.clone()));
    let collateral_deposit_repo = Arc::new(CollateralDepositEventRepository::new(db_pool.clone()));
    let start_collateral_value_assertion_repo = Arc::new(StartCollateralValueAssertionEventRepository::new(db_pool.clone()));
    let collateral_transfer_repo = Arc::new(CollateralTransferRepository::new(db_pool.clone()));
    let vault_transfer_repo = Arc::new(VaultTransferRepository::new(db_pool.clone()));
    info!("Repositories initialized.");

    // Worker
    let worker = PositionEventWorker::new(
        open_repo.clone(),
        close_repo.clone(),
        vault_repo.clone(),
        new_account_repo.clone(),
        collateral_deposit_repo.clone(),
        start_collateral_value_assertion_repo.clone(),
        collateral_transfer_repo.clone(),
        vault_transfer_repo.clone(),
        &config
    );
    info!("PositionEventWorker initialized.");

    // Router (Takes DB Pool state)
    let app = create_router(db_pool.clone());
    info!("Router created.");

    // --- Setup Indexer Task ---
    info!("Setting up indexer workflow...");
    let (indexer_executor, _term_sender) = setup_single_workflow(
        worker,
        config.remote_store_url.clone(), // Clone URL
        config.start_checkpoint,
        config.concurrency,
        None,
    )
    .await
    .context("Failed to setup indexer workflow")?;
    info!("Indexer workflow ready.");

    // --- Setup Server Task ---
    // Use listen_addr from config
    let addr_str = &config.listen_addr;
    let addr: SocketAddr = addr_str
        .parse()
        .with_context(|| format!("Invalid listen_addr format in config: {}", addr_str))?;
    println!("API server listening on {}", addr);
    let listener = TcpListener::bind(addr)
        .await
        .context("Failed to bind TCP listener")?;
    let server = axum::serve(listener, app.into_make_service());

    // --- Run Concurrently --- //
    info!("Starting server and indexer concurrently...");

    tokio::select! {
        res = server => {
            match res {
                Ok(_) => info!("Axum server finished gracefully."),
                Err(e) => error!(error = %e, "Axum server failed."),
            }
        },
        res = indexer_executor => {
             match res {
                Ok(_) => info!("Indexer executor finished gracefully."),
                Err(e) => error!(error = %e, "Indexer executor failed."),
            }
        },
    }

    info!("Application shut down.");
    Ok(())
}
