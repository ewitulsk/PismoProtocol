use crate::events::vault_transfer_created::VaultTransferCreatedEvent as MoveVaultTransferCreatedEvent;
use crate::events::collateral_transfer_created::CollateralTransferCreatedEvent as MoveCollateralTransferCreatedEvent;
use tracing::{info, error, warn};
use reqwest::Client;
use std::sync::Arc;
use crate::db::repositories::vault_created_events::VaultCreatedEventRepository;

// The event structs already derive Serialize, and SuiAddress serializes to hex string by default.

pub async fn on_vault_transfer_created(event: &MoveVaultTransferCreatedEvent, service_url: &str) {
    info!("Received VaultTransferCreatedEvent event: {:?}. Forwarding to liquidation service.", event);
    let client = Client::new();
    let endpoint = format!("{}/execute_vault_transfer", service_url);
    
    // Construct a payload that the service expects. The service expects direct fields.
    // The event struct can be serialized directly if its field names match what the service expects.
    // Service expects: { transfer_id, vault_address, ... other relevant fields for query if any }
    // Our MoveVaultTransferCreatedEvent has: transfer_id, vault_marker_id, vault_address, amount, to_user_address
    // The service /execute_vault_transfer takes { transfer_id, vault_address }
    // We should send what the service needs to perform its query and subsequent action.
    let payload = serde_json::json!({
        "transfer_id": event.transfer_id.to_string(), // SuiAddress to string
        "vault_address": event.vault_address.to_string(),
        // Add other fields from event if the service needs them for context or logging
        "vault_marker_id": event.vault_marker_id.to_string(),
        "amount": event.amount.to_string(), // u64 to string for JSON robustness, service can parse
        "to_user_address": event.to_user_address.to_string()
    });

    match client.post(&endpoint).json(&payload).send().await {
        Ok(response) => {
            if response.status().is_success() {
                info!("Successfully notified liquidation service for vault transfer: {}", event.transfer_id);
            } else {
                error!("Failed to notify liquidation service for vault transfer {}. Status: {}. Body: {:?}", 
                       event.transfer_id, response.status(), response.text().await);
            }
        }
        Err(e) => {
            error!("Error calling liquidation service for vault transfer {}: {}", event.transfer_id, e);
        }
    }
}

pub async fn on_collateral_transfer_created(
    event: &MoveCollateralTransferCreatedEvent, 
    service_url: &str,
    vault_repo: Arc<VaultCreatedEventRepository> // Added repository parameter
) {
    info!("Received CollateralTransferCreatedEvent event: {:?}. Forwarding to liquidation service.", event);

    // Fetch the VaultCreatedEvent to get the vault_marker_address
    let vault_marker_id = match vault_repo.find_by_vault_address(event.to_vault_address.to_string()) {
        Ok(Some(vault_event)) => vault_event.vault_marker_address,
        Ok(None) => {
            error!(
                "Could not find VaultCreatedEvent for vault_address: {} while processing collateral transfer {}", 
                event.to_vault_address,
                event.transfer_id
            );
            // Depending on requirements, you might want to return or handle this error differently.
            // For now, we'll proceed without it, and the service will likely fail if it strictly requires it.
            // Or, you could decide not to call the service at all.
            // Sending an empty string or a specific placeholder if the service can handle it might be another option.
            return; // Stop processing if vault marker cannot be found
        }
        Err(e) => {
            error!(
                "Database error fetching VaultCreatedEvent for vault_address: {} while processing collateral transfer {}: {}",
                event.to_vault_address,
                event.transfer_id,
                e
            );
            return; // Stop processing on DB error
        }
    };

    let client = Client::new();
    let endpoint = format!("{}/execute_collateral_transfer", service_url);

    // Service /execute_collateral_transfer takes { transfer_id, collateral_address, to_vault_address, vault_marker_id }
    let payload = serde_json::json!({
        "transfer_id": event.transfer_id.to_string(),
        "collateral_address": event.collateral_address.to_string(),
        "to_vault_address": event.to_vault_address.to_string(),
        "vault_marker_id": vault_marker_id, // Added vault_marker_id
        // Add other fields from event if the service needs them for context or logging
        "collateral_marker_id": event.collateral_marker_id.to_string(),
        "amount": event.amount.to_string()
    });

    match client.post(&endpoint).json(&payload).send().await {
        Ok(response) => {
            if response.status().is_success() {
                info!("Successfully notified liquidation service for collateral transfer: {}", event.transfer_id);
            } else {
                error!("Failed to notify liquidation service for collateral transfer {}. Status: {}. Body: {:?}", 
                       event.transfer_id, response.status(), response.text().await);
            }
        }
        Err(e) => {
            error!("Error calling liquidation service for collateral transfer {}: {}", event.transfer_id, e);
        }
    }
} 