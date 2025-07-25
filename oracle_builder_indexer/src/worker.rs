use async_trait::async_trait;
use anyhow::Result;
use tracing::{info, error};
use std::sync::Arc;

use sui_data_ingestion_core::Worker;
use sui_types::full_checkpoint_content::CheckpointData;

use crate::events::{
    OracleCreatedEvent, PriceFeedCreatedEvent, 
    OracleInvalidatedEvent, PriceFeedInvalidatedEvent
};
use crate::config::Config;
use crate::db::repositories::{DBPool, oracle::OracleRepository, price_feed::PriceFeedRepository};
use crate::db::repositories::base::BaseRepository;

pub struct OracleBuilderWorker {
    oracle_created_event_type: String,
    price_feed_created_event_type: String,
    oracle_invalidated_event_type: String,
    price_feed_invalidated_event_type: String,
    oracle_repository: OracleRepository,
    price_feed_repository: PriceFeedRepository,
}

impl OracleBuilderWorker {
    pub fn new(config: &Config, db_pool: Arc<DBPool>) -> Self {
        let package_id = &config.indexer.package_id;
        
        let oracle_created_event_type = format!("{}::oracle_builder::OracleCreated", package_id);
        let price_feed_created_event_type = format!("{}::oracle_builder::PriceFeedCreated", package_id);
        let oracle_invalidated_event_type = format!("{}::oracle_builder::OracleInvalidated", package_id);
        let price_feed_invalidated_event_type = format!("{}::oracle_builder::PriceFeedInvalidated", package_id);

        let oracle_repository = OracleRepository::new(db_pool.clone());
        let price_feed_repository = PriceFeedRepository::new(db_pool);

        info!("Oracle Builder Worker configured for package ID: {}", package_id);
        info!("Remote Store URL: {}", config.indexer.remote_store_url);
        info!("Start Checkpoint: {}", config.indexer.start_checkpoint);
        info!("Concurrency: {}", config.indexer.concurrency);
        info!("Listening for event type: {}", oracle_created_event_type);
        info!("Listening for event type: {}", price_feed_created_event_type);
        info!("Listening for event type: {}", oracle_invalidated_event_type);
        info!("Listening for event type: {}", price_feed_invalidated_event_type);

        Self {
            oracle_created_event_type,
            price_feed_created_event_type,
            oracle_invalidated_event_type,
            price_feed_invalidated_event_type,
            oracle_repository,
            price_feed_repository,
        }
    }
}

#[async_trait]
impl Worker for OracleBuilderWorker {
    type Result = ();

    async fn process_checkpoint(&self, checkpoint: &CheckpointData) -> Result<()> {
        info!(
            "Processing checkpoint: {}",
            checkpoint.checkpoint_summary.sequence_number
        );

        for transaction_data in &checkpoint.transactions {
            let tx_digest_str = transaction_data.transaction.digest().base58_encode();

            if let Some(events) = &transaction_data.events {
                for event in &events.data {
                    let event_type_str = event.type_.to_string();
                    
                    match event_type_str.as_str() {
                        s if s == self.oracle_created_event_type => {
                            match bcs::from_bytes::<OracleCreatedEvent>(&event.contents) {
                                Ok(parsed_event) => {
                                    info!("Processing OracleCreatedEvent for tx {}", tx_digest_str);
                                    parsed_event.debug_event();
                                    
                                    // Convert event to NewOracle and persist to database
                                    let new_oracle = parsed_event.into();
                                    match self.oracle_repository.create(new_oracle).await {
                                        Ok(oracle) => {
                                            info!("Successfully created Oracle in database: {}", oracle.oracle_id);
                                        },
                                        Err(e) => {
                                            error!("Failed to create Oracle in database for tx {}: {}", tx_digest_str, e);
                                        }
                                    }
                                },
                                Err(e) => {
                                    error!("BCS Deserialization Error for OracleCreatedEvent tx {}: {}. Data: {:?}", 
                                           tx_digest_str, e, &event.contents);
                                }
                            }
                        },
                        s if s == self.price_feed_created_event_type => {
                            match bcs::from_bytes::<PriceFeedCreatedEvent>(&event.contents) {
                                Ok(parsed_event) => {
                                    info!("Processing PriceFeedCreatedEvent for tx {}", tx_digest_str);
                                    parsed_event.debug_event();
                                    
                                    // Convert event to NewPriceFeed and persist to database
                                    let new_price_feed = parsed_event.into();
                                    match self.price_feed_repository.create(new_price_feed).await {
                                        Ok(price_feed) => {
                                            info!("Successfully created PriceFeed in database: {}", price_feed.price_feed_id);
                                        },
                                        Err(e) => {
                                            error!("Failed to create PriceFeed in database for tx {}: {}", tx_digest_str, e);
                                        }
                                    }
                                },
                                Err(e) => {
                                    error!("BCS Deserialization Error for PriceFeedCreatedEvent tx {}: {}. Data: {:?}", 
                                           tx_digest_str, e, &event.contents);
                                }
                            }
                        },
                        s if s == self.oracle_invalidated_event_type => {
                            match bcs::from_bytes::<OracleInvalidatedEvent>(&event.contents) {
                                Ok(parsed_event) => {
                                    info!("Processing OracleInvalidatedEvent for tx {}", tx_digest_str);
                                    parsed_event.debug_event();
                                    
                                    // Update existing Oracle to set is_valid = false
                                    let oracle_id = parsed_event.oracle_id.to_string();
                                    match self.oracle_repository.update_validity(&oracle_id, false).await {
                                        Ok(oracle) => {
                                            info!("Successfully invalidated Oracle in database: {}", oracle.oracle_id);
                                        },
                                        Err(e) => {
                                            error!("Failed to invalidate Oracle in database for tx {}: {}", tx_digest_str, e);
                                        }
                                    }
                                },
                                Err(e) => {
                                    error!("BCS Deserialization Error for OracleInvalidatedEvent tx {}: {}. Data: {:?}", 
                                           tx_digest_str, e, &event.contents);
                                }
                            }
                        },
                        s if s == self.price_feed_invalidated_event_type => {
                            match bcs::from_bytes::<PriceFeedInvalidatedEvent>(&event.contents) {
                                Ok(parsed_event) => {
                                    info!("Processing PriceFeedInvalidatedEvent for tx {}", tx_digest_str);
                                    parsed_event.debug_event();
                                    
                                    // Update existing PriceFeed to set is_valid = false
                                    let price_feed_id = parsed_event.price_feed_id.to_string();
                                    match self.price_feed_repository.update_validity(&price_feed_id, false).await {
                                        Ok(price_feed) => {
                                            info!("Successfully invalidated PriceFeed in database: {}", price_feed.price_feed_id);
                                        },
                                        Err(e) => {
                                            error!("Failed to invalidate PriceFeed in database for tx {}: {}", tx_digest_str, e);
                                        }
                                    }
                                },
                                Err(e) => {
                                    error!("BCS Deserialization Error for PriceFeedInvalidatedEvent tx {}: {}. Data: {:?}", 
                                           tx_digest_str, e, &event.contents);
                                }
                            }
                        },
                        _ => {
                            // Ignore events that don't match our expected types
                        }
                    }
                }
            }
        }
        Ok(())
    }
} 