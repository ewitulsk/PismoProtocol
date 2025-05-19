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
use crate::db::repositories::start_collateral_value_assertion_event::StartCollateralValueAssertionEventRepository;
use crate::db::repositories::collateral_transfer::CollateralTransferRepository;
use crate::db::repositories::vault_transfer::VaultTransferRepository;
use crate::db::repositories::position_liquidated_event::PositionLiquidatedEventRepository;
use crate::db::repositories::collateral_marker_liquidated_event::CollateralMarkerLiquidatedEventRepository;

use crate::events::position_created::PositionCreatedEvent as MovePositionCreatedEvent;
use crate::events::position_closed::PositionClosedEvent as MovePositionClosedEvent;
use crate::events::vault_created::VaultCreatedEvent as MoveVaultCreatedEvent;
use crate::events::new_account_event::NewAccountEvent as MoveNewAccountEvent;
use crate::events::collateral_deposit_event::CollateralDepositEvent as MoveCollateralDepositEvent;
use crate::events::start_collateral_value_assertion_event::StartCollateralValueAssertionEvent as MoveStartCollateralValueAssertionEvent;
use crate::events::collateral_transfer_created::CollateralTransferCreatedEvent as MoveCollateralTransferCreatedEvent;
use crate::events::vault_transfer_created::VaultTransferCreatedEvent as MoveVaultTransferCreatedEvent;
use crate::events::position_liquidated::PositionLiquidatedEvent as MovePositionLiquidatedEvent;
use crate::events::collateral_marker_liquidated::CollateralMarkerLiquidatedEvent as MoveCollateralMarkerLiquidatedEvent;

use crate::callbacks::transfers_callbacks;
use crate::config::Config;

pub struct PositionEventWorker {
    open_repo: Arc<OpenPositionEventRepository>,
    close_repo: Arc<ClosePositionEventRepository>,
    vault_repo: Arc<VaultCreatedEventRepository>,
    new_account_repo: Arc<NewAccountEventRepository>,
    collateral_deposit_repo: Arc<CollateralDepositEventRepository>,
    start_collateral_value_assertion_repo: Arc<StartCollateralValueAssertionEventRepository>,
    collateral_transfer_repo: Arc<CollateralTransferRepository>,
    vault_transfer_repo: Arc<VaultTransferRepository>,
    position_liquidated_repo: Arc<PositionLiquidatedEventRepository>,
    collateral_marker_liquidated_repo: Arc<CollateralMarkerLiquidatedEventRepository>,
    position_created_event_type: String,
    position_closed_event_type: String,
    vault_created_event_type: String,
    new_account_event_type: String,
    collateral_deposit_event_type: String,
    start_collateral_value_assertion_event_type: String,
    collateral_transfer_created_event_type: String,
    vault_transfer_created_event_type: String,
    position_liquidated_event_type: String,
    collateral_marker_liquidated_event_type: String,
    liquidation_transfer_service_url: String,
}

impl PositionEventWorker {
    pub fn new(
        open_repo: Arc<OpenPositionEventRepository>,
        close_repo: Arc<ClosePositionEventRepository>,
        vault_repo: Arc<VaultCreatedEventRepository>,
        new_account_repo: Arc<NewAccountEventRepository>,
        collateral_deposit_repo: Arc<CollateralDepositEventRepository>,
        start_collateral_value_assertion_repo: Arc<StartCollateralValueAssertionEventRepository>,
        collateral_transfer_repo: Arc<CollateralTransferRepository>,
        vault_transfer_repo: Arc<VaultTransferRepository>,
        position_liquidated_repo: Arc<PositionLiquidatedEventRepository>,
        collateral_marker_liquidated_repo: Arc<CollateralMarkerLiquidatedEventRepository>,
        app_config: &Config,
    ) -> Self {
        let package_id = &app_config.package_id;
        let vault_created_event_type = format!("{}::lp::VaultCreatedEvent", package_id);
        let position_created_event_type = format!("{}::positions::PositionCreatedEvent", package_id);
        let position_closed_event_type = format!("{}::positions::PositionClosedEvent", package_id);
        let new_account_event_type = format!("{}::accounts::NewAccountEvent", package_id);
        let collateral_deposit_event_type = format!("{}::collateral::CollateralDepositEvent", package_id);
        let start_collateral_value_assertion_event_type = format!("{}::collateral::StartCollateralValueAssertionEvent", package_id);
        let collateral_transfer_created_event_type = format!("{}::collateral::CollateralTransferCreated", package_id);
        let vault_transfer_created_event_type = format!("{}::lp::VaultTransferCreated", package_id);
        let position_liquidated_event_type = format!("{}::positions::PositionLiquidatedEvent", package_id);
        let collateral_marker_liquidated_event_type = format!("{}::collateral::CollateralMarkerLiquidatedEvent", package_id);

        info!("Worker configured for package ID: {}", package_id);
        info!("Listening for event type: {}", position_created_event_type);
        info!("Listening for event type: {}", position_closed_event_type);
        info!("Listening for event type: {}", vault_created_event_type);
        info!("Listening for event type: {}", new_account_event_type);
        info!("Listening for event type: {}", collateral_deposit_event_type);
        info!("Listening for event type: {}", start_collateral_value_assertion_event_type);
        info!("Listening for event type: {}", collateral_transfer_created_event_type);
        info!("Listening for event type: {}", vault_transfer_created_event_type);
        info!("Listening for event type: {}", position_liquidated_event_type);
        info!("Listening for event type: {}", collateral_marker_liquidated_event_type);
        info!("Liquidation transfer service URL: {}", app_config.liquidation_transfer_service_url);

        Self {
            open_repo,
            close_repo,
            vault_repo,
            new_account_repo,
            collateral_deposit_repo,
            start_collateral_value_assertion_repo,
            collateral_transfer_repo,
            vault_transfer_repo,
            position_liquidated_repo,
            collateral_marker_liquidated_repo,
            position_created_event_type,
            position_closed_event_type,
            vault_created_event_type,
            new_account_event_type,
            collateral_deposit_event_type,
            start_collateral_value_assertion_event_type,
            collateral_transfer_created_event_type,
            vault_transfer_created_event_type,
            position_liquidated_event_type,
            collateral_marker_liquidated_event_type,
            liquidation_transfer_service_url: app_config.liquidation_transfer_service_url.clone(),
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
                                            Ok(_) => {
                                                info!("Successfully stored CollateralDepositEvent for tx {}", tx_digest_str);
                                                println!("Successfully stored CollateralDepositEvent for tx {}", tx_digest_str);
                                            },
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
                     } else if event_type_str == self.start_collateral_value_assertion_event_type {
                        match bcs::from_bytes::<MoveStartCollateralValueAssertionEvent>(&event.contents) {
                            Ok(parsed_event) => {
                                match parsed_event.try_map_to_db(tx_digest_str.clone(), checkpoint_time) {
                                    Ok(db_event) => {
                                        match self.start_collateral_value_assertion_repo.create(db_event) {
                                            Ok(_) => info!("Successfully stored StartCollateralValueAssertionEvent for tx {}", tx_digest_str),
                                            Err(e) => error!("DB Error storing StartCollateralValueAssertionEvent for tx {}: {}", tx_digest_str, e),
                                        }
                                    },
                                    Err(map_err) => {
                                        error!("Mapping Error for StartCollateralValueAssertionEvent tx {}: {}", tx_digest_str, map_err);
                                    }
                                }
                            },
                            Err(e) => {
                                error!("BCS Deserialization Error for StartCollateralValueAssertionEvent tx {}: {}. Data: {:?}", tx_digest_str, e, &event.contents);
                            }
                        }
                     } else if event_type_str == self.collateral_transfer_created_event_type {
                        match bcs::from_bytes::<MoveCollateralTransferCreatedEvent>(&event.contents) {
                            Ok(parsed_event) => {
                                transfers_callbacks::on_collateral_transfer_created(&parsed_event, &self.liquidation_transfer_service_url, self.vault_repo.clone()).await;
                                match parsed_event.try_map_to_db(tx_digest_str.clone(), checkpoint_time) {
                                    Ok(db_event) => {
                                        match self.collateral_transfer_repo.create(db_event) {
                                            Ok(_) => info!("Successfully stored CollateralTransferCreatedEvent for tx {}", tx_digest_str),
                                            Err(e) => error!("DB Error storing CollateralTransferCreatedEvent for tx {}: {}", tx_digest_str, e),
                                        }
                                    },
                                    Err(map_err) => {
                                        error!("Mapping Error for CollateralTransferCreatedEvent tx {}: {}", tx_digest_str, map_err);
                                    }
                                }
                            },
                            Err(e) => {
                                error!("BCS Deserialization Error for CollateralTransferCreatedEvent tx {}: {}. Data: {:?}", tx_digest_str, e, &event.contents);
                            }
                        }
                     } else if event_type_str == self.vault_transfer_created_event_type {
                        match bcs::from_bytes::<MoveVaultTransferCreatedEvent>(&event.contents) {
                            Ok(parsed_event) => {
                                transfers_callbacks::on_vault_transfer_created(&parsed_event, &self.liquidation_transfer_service_url).await;
                                match parsed_event.try_map_to_db(tx_digest_str.clone(), checkpoint_time) {
                                    Ok(db_event) => {
                                        match self.vault_transfer_repo.create(db_event) {
                                            Ok(_) => info!("Successfully stored VaultTransferCreatedEvent for tx {}", tx_digest_str),
                                            Err(e) => error!("DB Error storing VaultTransferCreatedEvent for tx {}: {}", tx_digest_str, e),
                                        }
                                    },
                                    Err(map_err) => {
                                        error!("Mapping Error for VaultTransferCreatedEvent tx {}: {}", tx_digest_str, map_err);
                                    }
                                }
                            },
                            Err(e) => {
                                error!("BCS Deserialization Error for VaultTransferCreatedEvent tx {}: {}. Data: {:?}", tx_digest_str, e, &event.contents);
                            }
                        }
                     } else if event_type_str == self.position_liquidated_event_type {
                        match bcs::from_bytes::<MovePositionLiquidatedEvent>(&event.contents) {
                            Ok(parsed_event) => {
                                match parsed_event.try_map_to_db(tx_digest_str.clone(), checkpoint_time) {
                                    Ok(db_event) => {
                                        match self.position_liquidated_repo.create(db_event) {
                                            Ok(_) => info!("Successfully stored PositionLiquidatedEvent for tx {}", tx_digest_str),
                                            Err(e) => error!("DB Error storing PositionLiquidatedEvent for tx {}: {}", tx_digest_str, e),
                                        }
                                    },
                                    Err(map_err) => {
                                        error!("Mapping Error for PositionLiquidatedEvent tx {}: {}", tx_digest_str, map_err);
                                    }
                                }
                            },
                            Err(e) => {
                                error!("BCS Deserialization Error for PositionLiquidatedEvent tx {}: {}. Data: {:?}", tx_digest_str, e, &event.contents);
                            }
                        }
                     } else if event_type_str == self.collateral_marker_liquidated_event_type {
                        match bcs::from_bytes::<MoveCollateralMarkerLiquidatedEvent>(&event.contents) {
                            Ok(parsed_event) => {
                                match parsed_event.try_map_to_db(tx_digest_str.clone(), checkpoint_time) {
                                    Ok(db_event) => {
                                        match self.collateral_marker_liquidated_repo.create(db_event) {
                                            Ok(_) => info!("Successfully stored CollateralMarkerLiquidatedEvent for tx {}", tx_digest_str),
                                            Err(e) => error!("DB Error storing CollateralMarkerLiquidatedEvent for tx {}: {}", tx_digest_str, e),
                                        }
                                    },
                                    Err(map_err) => {
                                        error!("Mapping Error for CollateralMarkerLiquidatedEvent tx {}: {}", tx_digest_str, map_err);
                                    }
                                }
                            },
                            Err(e) => {
                                error!("BCS Deserialization Error for CollateralMarkerLiquidatedEvent tx {}: {}. Data: {:?}", tx_digest_str, e, &event.contents);
                            }
                        }
                     }
                }
            }
        }
        Ok(())
    }
} 