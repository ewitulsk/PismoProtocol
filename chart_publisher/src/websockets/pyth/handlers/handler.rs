use anyhow::Result;
use tracing::{debug, error, info};

use crate::websockets::pyth::{handlers::connection_established::handle_connection_established, messages::PythMessage};

pub async fn handle_incoming_message(message: &str) -> Result<()> {
    debug!("Received message: {}", message);
        
    match serde_json::from_str::<PythMessage>(message) {
        Ok(pyth_msg) => {
            match pyth_msg {
                PythMessage::ConnectionEstablished { client_id, message } => {
                    handle_connection_established(&client_id, &message).await;
                }
                PythMessage::Response { status} => {
                    info!("Response: {}", status);
                }
                _ => {
                    debug!("Received unexpected message");
                }
            }
        }
        Err(e) => {
            // Try to handle as generic JSON for unknown message types
            error!("Could not parse as PythMessage: {}, treating as raw data", e);
        }
    }

    Ok(())
}