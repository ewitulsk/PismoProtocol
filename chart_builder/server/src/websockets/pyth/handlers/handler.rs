use anyhow::Result;
use tracing::{debug, error, info};

use crate::{PriceUpdateSender};
use crate::websockets::pyth::{
    handlers::{
        connection_established::handle_connection_established,
        price_update::handle_price_update
    }, 
    messages::PythResponse
};

pub async fn handle_incoming_message(
    message: &str,
    price_update_sender: PriceUpdateSender,
) -> Result<()> {
    // info!(message);
    // Try to parse as PythResponse 
    match serde_json::from_str::<PythResponse>(message) {
        Ok(pyth_response) => {
            match pyth_response {
                PythResponse::ConnectionEstablished { client_id, message } => {
                    handle_connection_established(&client_id, &message).await;
                }
                PythResponse::Response { status } => {
                    info!("Pyth Response: {}", status);
                }
                PythResponse::PriceUpdate { price_feed } => {
                    handle_price_update(price_feed, price_update_sender).await?;
                }
            }
        }
        Err(e) => {
            error!("Could not parse message as PythResponse: {}", e);
            debug!("Raw message: {}", message);
        }
    }

    Ok(())
}

 