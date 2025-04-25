use async_trait::async_trait;
use chrono::{DateTime, Utc, TimeZone};
use std::sync::Arc;
use anyhow::{Result, anyhow};
use tracing::{info, error, debug};

use sui_data_ingestion_core::Worker;
use sui_types::full_checkpoint_content::CheckpointData;

use crate::db::repositories::open_position_events::OpenPositionEventRepository;
use crate::db::repositories::close_position_events::ClosePositionEventRepository;
use crate::db::repositories::vault_created_events::VaultCreatedEventRepository;
use crate::db::repositories::new_account_event::NewAccountEventRepository;
use crate::db::repositories::collateral_deposit_event::CollateralDepositEventRepository;
use crate::events::position_created::PositionCreatedEvent as MovePositionCreatedEvent;
use crate::events::position_closed::PositionClosedEvent as MovePositionClosedEvent;
use crate::events::vault_created::VaultCreatedEvent as MoveVaultCreatedEvent;
use crate::events::new_account_event::NewAccountEvent as MoveNewAccountEvent;
use crate::events::collateral_deposit_event::CollateralDepositEvent as MoveCollateralDepositEvent;

pub struct PositionEventWorker {
    open_repo: Arc<OpenPositionEventRepository>,
    close_repo: Arc<ClosePositionEventRepository>,
    vault_repo: Arc<VaultCreatedEventRepository>,
    new_account_repo: Arc<NewAccountEventRepository>,
    collateral_deposit_repo: Arc<CollateralDepositEventRepository>,
    position_created_event_type: String,
    position_closed_event_type: String,
    vault_created_event_type: String,
    new_account_event_type: String,
    collateral_deposit_event_type: String,
}

impl PositionEventWorker {
    pub fn new(
        open_repo: Arc<OpenPositionEventRepository>,
        close_repo: Arc<ClosePositionEventRepository>,
        vault_repo: Arc<VaultCreatedEventRepository>,
        new_account_repo: Arc<NewAccountEventRepository>,
        collateral_deposit_repo: Arc<CollateralDepositEventRepository>,
        package_id: String,
    ) -> Self {
        let vault_created_event_type = format!("{}::vaults::VaultCreatedEvent", package_id);
        let position_created_event_type = format!("{}::positions::PositionCreatedEvent", package_id);
        let position_closed_event_type = format!("{}::positions::PositionClosedEvent", package_id);
        let new_account_event_type = format!("{}::positions::NewAccountEvent", package_id);
        let collateral_deposit_event_type = format!("{}::collateral::CollateralDepositEvent", package_id);

        info!("Worker configured for package ID: {}", package_id);
        info!("Listening for event type: {}", position_created_event_type);
        info!("Listening for event type: {}", position_closed_event_type);
        info!("Listening for event type: {}", vault_created_event_type);
        info!("Listening for event type: {}", new_account_event_type);
        info!("Listening for event type: {}", collateral_deposit_event_type);

        Self {
            open_repo,
            close_repo,
            vault_repo,
            new_account_repo,
            collateral_deposit_repo,
            position_created_event_type,
            position_closed_event_type,
            vault_created_event_type,
            new_account_event_type,
            collateral_deposit_event_type,
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
                     } else if event_type_str == self.vault_created_event_type {
                         match bcs::from_bytes::<MoveVaultCreatedEvent>(&event.contents) {
                            Ok(parsed_event) => {
                                match parsed_event.try_map_to_db(tx_digest_str.clone(), checkpoint_time) {
                                    Ok(new_db_event) => {
                                        match self.vault_repo.create(new_db_event) {
                                            Ok(_) => info!("Successfully stored VaultCreatedEvent for tx {}", tx_digest_str),
                                            Err(e) => error!("DB Error storing VaultCreatedEvent for tx {}: {}", tx_digest_str, e),
                                        }
                                    },
                                    Err(map_err) => {
                                         error!("Mapping Error for VaultCreatedEvent tx {}: {}", tx_digest_str, map_err);
                                    }
                                }
                            },
                            Err(e) => {
                                error!("BCS Deserialization Error for VaultCreatedEvent tx {}: {}. Data: {:?}", tx_digest_str, e, &event.contents);
                            }
                        }
                     } else if event_type_str == self.new_account_event_type {
                         match bcs::from_bytes::<MoveNewAccountEvent>(&event.contents) {
                            Ok(parsed_event) => {
                                match parsed_event.try_map_to_db(tx_digest_str.clone(), checkpoint_time) {
                                    Ok(db_event) => {
                                        match self.new_account_repo.create(db_event) {
                                            Ok(_) => info!("Successfully stored NewAccountEvent for tx {}", tx_digest_str),
                                            Err(e) => error!("DB Error storing NewAccountEvent for tx {}: {}", tx_digest_str, e),
                                        }
                                    },
                                    Err(map_err) => {
                                        error!("Mapping Error for NewAccountEvent tx {}: {}", tx_digest_str, map_err);
                                    }
                                }
                            },
                            Err(e) => {
                                error!("BCS Deserialization Error for NewAccountEvent tx {}: {}. Data: {:?}", tx_digest_str, e, &event.contents);
                            }
                        }
                     } else if event_type_str == self.collateral_deposit_event_type {
                         match bcs::from_bytes::<MoveCollateralDepositEvent>(&event.contents) {
                            Ok(parsed_event) => {
                                match parsed_event.try_map_to_db(tx_digest_str.clone(), checkpoint_time) {
                                    Ok(db_event) => {
                                         match self.collateral_deposit_repo.create(db_event) {
                                            Ok(_) => info!("Successfully stored CollateralDepositEvent for tx {}", tx_digest_str),
                                            Err(e) => error!("DB Error storing CollateralDepositEvent for tx {}: {}", tx_digest_str, e),
                                        }
                                    },
                                    Err(map_err) => {
                                         error!("Mapping Error for CollateralDepositEvent tx {}: {}", tx_digest_str, map_err);
                                    }
                                }
                            },
                            Err(e) => {
                                error!("BCS Deserialization Error for CollateralDepositEvent tx {}: {}. Data: {:?}", tx_digest_str, e, &event.contents);
                            }
                        }
                     }
                }
            }
        }
        Ok(())
    }
} 