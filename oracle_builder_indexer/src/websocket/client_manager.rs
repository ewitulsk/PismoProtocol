use std::collections::HashSet;
use std::sync::Arc;
use dashmap::DashMap;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;
use tracing::{info, warn};
use uuid::Uuid;

use crate::websocket::messages::{SubscriptionType, OracleBuilderResponse, InternalBroadcastMessage};

/// Manages WebSocket client connections and their subscriptions
#[derive(Debug)]
pub struct ClientManager {
    /// Map of client_id -> message sender
    pub clients: Arc<DashMap<String, mpsc::UnboundedSender<Message>>>,
    /// Map of client_id -> set of subscriptions
    subscriptions: Arc<DashMap<String, HashSet<SubscriptionType>>>,
}

impl ClientManager {
    pub fn new() -> Self {
        Self {
            clients: Arc::new(DashMap::new()),
            subscriptions: Arc::new(DashMap::new()),
        }
    }

    /// Add a new client connection
    pub fn add_client(&self, sender: mpsc::UnboundedSender<Message>) -> String {
        let client_id = Uuid::new_v4().to_string();
        self.clients.insert(client_id.clone(), sender);
        self.subscriptions.insert(client_id.clone(), HashSet::new());
        info!("New WebSocket client connected: {}", client_id);
        client_id
    }

    /// Remove a client connection
    pub fn remove_client(&self, client_id: &str) {
        self.clients.remove(client_id);
        self.subscriptions.remove(client_id);
        info!("WebSocket client disconnected: {}", client_id);
    }

    /// Add a subscription for a client
    pub fn add_subscription(&self, client_id: &str, subscription: SubscriptionType) -> bool {
        if let Some(mut subs) = self.subscriptions.get_mut(client_id) {
            let inserted = subs.insert(subscription.clone());
            if inserted {
                info!("Client {} subscribed to: {:?}", client_id, subscription);
            }
            inserted
        } else {
            warn!("Attempted to add subscription for non-existent client: {}", client_id);
            false
        }
    }

    /// Remove a subscription for a client
    pub fn remove_subscription(&self, client_id: &str, subscription: &SubscriptionType) -> bool {
        if let Some(mut subs) = self.subscriptions.get_mut(client_id) {
            let removed = subs.remove(subscription);
            if removed {
                info!("Client {} unsubscribed from: {:?}", client_id, subscription);
            }
            removed
        } else {
            warn!("Attempted to remove subscription for non-existent client: {}", client_id);
            false
        }
    }

    /// Send a message to a specific client
    pub fn send_to_client(&self, client_id: &str, response: &OracleBuilderResponse) {
        if let Some(client) = self.clients.get(client_id) {
            if let Ok(message_text) = serde_json::to_string(response) {
                if let Err(e) = client.send(Message::Text(message_text)) {
                    warn!("Failed to send message to client {}: {}", client_id, e);
                    // Client might be disconnected, remove it
                    self.remove_client(client_id);
                }
            }
        }
    }

    /// Broadcast a message to all subscribed clients
    pub fn broadcast(&self, message: &InternalBroadcastMessage) {
        let response = match message {
            InternalBroadcastMessage::OracleCreated(oracle) => {
                OracleBuilderResponse::OracleCreated {
                    oracle: oracle.clone(),
                    timestamp: chrono::Utc::now(),
                }
            }
            InternalBroadcastMessage::OracleInvalidated(oracle_id) => {
                OracleBuilderResponse::OracleInvalidated {
                    oracle_id: oracle_id.clone(),
                    timestamp: chrono::Utc::now(),
                }
            }
            InternalBroadcastMessage::PriceFeedCreated(price_feed) => {
                OracleBuilderResponse::PriceFeedCreated {
                    price_feed: price_feed.clone(),
                    timestamp: chrono::Utc::now(),
                }
            }
            InternalBroadcastMessage::PriceFeedInvalidated { price_feed_id, oracle_id } => {
                OracleBuilderResponse::PriceFeedInvalidated {
                    price_feed_id: price_feed_id.clone(),
                    oracle_id: oracle_id.clone(),
                    timestamp: chrono::Utc::now(),
                }
            }
        };

        // Find all clients that should receive this message
        let mut clients_to_notify = Vec::new();

        for client_entry in self.subscriptions.iter() {
            let client_id = client_entry.key();
            let client_subs = client_entry.value();

            let should_notify = match message {
                InternalBroadcastMessage::OracleCreated(oracle) => {
                    client_subs.contains(&SubscriptionType::AllOracles) ||
                    client_subs.contains(&SubscriptionType::OraclesByOwner(oracle.owner.clone()))
                }
                InternalBroadcastMessage::OracleInvalidated(_) => {
                    client_subs.contains(&SubscriptionType::AllOracles)
                    // Note: We could enhance this to also check owner-specific subscriptions
                    // if we had access to the oracle owner information
                }
                InternalBroadcastMessage::PriceFeedCreated(price_feed) => {
                    client_subs.contains(&SubscriptionType::AllPriceFeeds) ||
                    client_subs.contains(&SubscriptionType::PriceFeedsByOracle(price_feed.oracle_id.clone()))
                }
                InternalBroadcastMessage::PriceFeedInvalidated { oracle_id, .. } => {
                    client_subs.contains(&SubscriptionType::AllPriceFeeds) ||
                    client_subs.contains(&SubscriptionType::PriceFeedsByOracle(oracle_id.clone()))
                }
            };

            if should_notify {
                clients_to_notify.push(client_id.clone());
            }
        }

        // Send the message to all relevant clients
        if let Ok(message_text) = serde_json::to_string(&response) {
            let mut disconnected_clients = Vec::new();

            for client_id in &clients_to_notify {
                if let Some(client) = self.clients.get(client_id) {
                    if let Err(e) = client.send(Message::Text(message_text.clone())) {
                        warn!("Failed to send broadcast message to client {}: {}", client_id, e);
                        disconnected_clients.push(client_id.clone());
                    }
                }
            }

            // Clean up disconnected clients
            for client_id in disconnected_clients {
                self.remove_client(&client_id);
            }

            if !clients_to_notify.is_empty() {
                info!("Broadcasted message to {} clients: {:?}", clients_to_notify.len(), message);
            }
        }
    }

    /// Get the number of connected clients
    pub fn client_count(&self) -> usize {
        self.clients.len()
    }

    /// Get client subscription information for debugging
    pub fn get_client_subscriptions(&self, client_id: &str) -> Option<HashSet<SubscriptionType>> {
        self.subscriptions.get(client_id).map(|subs| subs.clone())
    }
}
