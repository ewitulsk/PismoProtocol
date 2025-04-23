use async_trait::async_trait;
use bigdecimal::{BigDecimal, FromPrimitive};
use chrono::{DateTime, Utc, TimeZone};
use std::sync::Arc;
use anyhow::{Result, anyhow, Context};
use tracing::{info, error, debug};
use hex;

use sui_data_ingestion_core::Worker;
use sui_types::full_checkpoint_content::CheckpointData;

use crate::db::repositories::open_position_events::OpenPositionEventRepository;
use crate::db::repositories::close_position_events::ClosePositionEventRepository;
use crate::events::position_created::PositionCreatedEvent as MovePositionCreatedEvent;
use crate::events::position_closed::PositionClosedEvent as MovePositionClosedEvent;

pub struct PositionEventWorker {
    open_repo: Arc<OpenPositionEventRepository>,
    close_repo: Arc<ClosePositionEventRepository>,
    position_created_event_type: String,
    position_closed_event_type: String,
}

impl PositionEventWorker {
    pub fn new(
        open_repo: Arc<OpenPositionEventRepository>,
        close_repo: Arc<ClosePositionEventRepository>,
        package_id: String,
    ) -> Self {
        let position_created_event_type = format!("{}::positions::PositionCreatedEvent", package_id);
        let position_closed_event_type = format!("{}::positions::PositionClosedEvent", package_id);
        info!("Worker configured for package ID: {}", package_id);
        info!("Listening for event type: {}", position_created_event_type);
        info!("Listening for event type: {}", position_closed_event_type);

        Self {
            open_repo,
            close_repo,
            position_created_event_type,
            position_closed_event_type,
        }
    }

    fn timestamp_ms_to_datetime(timestamp_ms: u64) -> Result<DateTime<Utc>> {
        Utc.timestamp_millis_opt(timestamp_ms as i64)
           .single()
           .ok_or_else(|| anyhow!("Invalid or out-of-range timestamp: {}", timestamp_ms))
    }
}

#[async_trait]
impl Worker for PositionEventWorker {
    type Result = ();

    async fn process_checkpoint(&self, checkpoint: &CheckpointData) -> Result<()> {
        info!(
            "Processing checkpoint: {}",
            checkpoint.checkpoint_summary.sequence_number
        );

        let checkpoint_timestamp_ms = checkpoint.checkpoint_summary.timestamp_ms;
        let checkpoint_time = Self::timestamp_ms_to_datetime(checkpoint_timestamp_ms)?;

        for transaction_data in &checkpoint.transactions {
            let tx_digest_str = transaction_data.transaction.digest().base58_encode();

            if let Some(events) = &transaction_data.events {
                for event in &events.data {
                     let event_type_str = event.type_.to_string();
                     debug!("Processing event type: {}", event_type_str);

                     if event_type_str == self.position_created_event_type {
                        match bcs::from_bytes::<MovePositionCreatedEvent>(&event.contents) {
                            Ok(parsed_event) => {
                                match parsed_event.try_map_to_db(tx_digest_str.clone(), checkpoint_time) {
                                    Ok(new_db_event) => {
                                        match self.open_repo.create(new_db_event) {
                                            Ok(_) => info!("Successfully stored PositionCreatedEvent for tx {}", tx_digest_str),
                                            Err(e) => error!("DB Error storing PositionCreatedEvent for tx {}: {}", tx_digest_str, e),
                                        }
                                    },
                                    Err(map_err) => {
                                        error!("Mapping Error for PositionCreatedEvent tx {}: {}", tx_digest_str, map_err);
                                    }
                                }
                            },
                            Err(e) => {
                                error!("BCS Deserialization Error for PositionCreatedEvent tx {}: {}. Data: {:?}", tx_digest_str, e, &event.contents);
                            }
                        }
                     } else if event_type_str == self.position_closed_event_type {
                         match bcs::from_bytes::<MovePositionClosedEvent>(&event.contents) {
                            Ok(parsed_event) => {
                                match parsed_event.try_map_to_db(tx_digest_str.clone(), checkpoint_time) {
                                    Ok(new_db_event) => {
                                        match self.close_repo.create(new_db_event) {
                                            Ok(_) => info!("Successfully stored PositionClosedEvent for tx {}", tx_digest_str),
                                            Err(e) => error!("DB Error storing PositionClosedEvent for tx {}: {}", tx_digest_str, e),
                                        }
                                    },
                                    Err(map_err) => {
                                         error!("Mapping Error for PositionClosedEvent tx {}: {}", tx_digest_str, map_err);
                                    }
                                }
                            },
                            Err(e) => {
                                error!("BCS Deserialization Error for PositionClosedEvent tx {}: {}. Data: {:?}", tx_digest_str, e, &event.contents);
                            }
                        }
                     }
                }
            }
        }
        Ok(())
    }
} 