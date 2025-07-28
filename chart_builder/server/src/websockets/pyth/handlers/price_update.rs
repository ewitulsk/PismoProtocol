use anyhow::Result;
use chrono::{DateTime, Utc};

use crate::{PriceUpdate, PriceUpdateSender};

pub async fn handle_price_update(
    price_feed: crate::websockets::pyth::messages::PythPriceFeed,
    price_update_sender: PriceUpdateSender,
) -> Result<()> {
    // Calculate actual price considering expo
    if let Ok(price_value) = price_feed.price.price.parse::<f64>() {
        let actual_price = price_value * (10.0_f64.powi(price_feed.price.expo));
        
        // Convert publish_time to DateTime<Utc>
        let timestamp = DateTime::from_timestamp(price_feed.price.publish_time, 0)
            .unwrap_or_else(|| Utc::now());
        
        // info!("Price update for feed {}: ${:.2} at {}", price_feed.id, actual_price, timestamp);
        
        // Send price update through channel
        let update = PriceUpdate {
            feed_id: price_feed.id,
            price: actual_price,
            timestamp,
        };
        
        if let Err(e) = price_update_sender.send(update) {
            tracing::error!("Failed to send price update: {}", e);
        }
    }

    Ok(())
}
