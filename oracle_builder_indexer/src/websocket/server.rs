use std::sync::Arc;
use axum::{
    extract::{ws::{WebSocket, Message}, State, WebSocketUpgrade},
    response::Response,
};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tracing::{info, warn, error};

use crate::websocket::{
    client_manager::ClientManager,
    messages::{OracleBuilderMessage, OracleBuilderResponse, SubscriptionType, InternalBroadcastMessage},
};

/// WebSocket server state
#[derive(Debug, Clone)]
pub struct WebSocketState {
    pub client_manager: Arc<ClientManager>,
    pub broadcast_sender: mpsc::UnboundedSender<InternalBroadcastMessage>,
}

impl WebSocketState {
    pub fn new() -> (Self, mpsc::UnboundedReceiver<InternalBroadcastMessage>) {
        let client_manager = Arc::new(ClientManager::new());
        let (broadcast_sender, broadcast_receiver) = mpsc::unbounded_channel();

        let state = Self {
            client_manager,
            broadcast_sender,
        };

        (state, broadcast_receiver)
    }

    /// Broadcast a message to all relevant clients
    pub fn broadcast(&self, message: InternalBroadcastMessage) {
        if let Err(e) = self.broadcast_sender.send(message) {
            error!("Failed to send broadcast message: {}", e);
        }
    }
}

/// WebSocket upgrade handler
pub async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(state): State<WebSocketState>,
) -> Response {
    info!("WebSocket connection attempt");
    ws.on_upgrade(move |socket| handle_websocket_connection(socket, state))
}

/// Handle individual WebSocket connection
async fn handle_websocket_connection(socket: WebSocket, state: WebSocketState) {
    let (mut ws_sender, mut ws_receiver) = socket.split();
    
    // Create a channel for sending messages to this client
    let (client_sender, mut client_receiver) = mpsc::unbounded_channel::<tokio_tungstenite::tungstenite::Message>();
    
    // Add client to the manager
    let client_id = state.client_manager.add_client(client_sender);
    
    // Task to handle outgoing messages to the client
    let client_manager_for_sender = state.client_manager.clone();
    let client_id_for_sender = client_id.clone();
    let sender_task = tokio::spawn(async move {
        while let Some(message) = client_receiver.recv().await {
            match message {
                tokio_tungstenite::tungstenite::Message::Text(text) => {
                    if let Err(e) = ws_sender.send(Message::Text(text)).await {
                        error!("Failed to send WebSocket message: {}", e);
                        break;
                    }
                }
                tokio_tungstenite::tungstenite::Message::Binary(data) => {
                    if let Err(e) = ws_sender.send(Message::Binary(data)).await {
                        error!("Failed to send WebSocket binary message: {}", e);
                        break;
                    }
                }
                tokio_tungstenite::tungstenite::Message::Close(_) => {
                    let _ = ws_sender.send(Message::Close(None)).await;
                    break;
                }
                _ => {} // Handle other message types if needed
            }
        }
        
        // Clean up client when sender task ends
        client_manager_for_sender.remove_client(&client_id_for_sender);
    });
    
    // Send welcome message
    let welcome_response = OracleBuilderResponse::SubscriptionConfirmed {
        subscription_type: "connection".to_string(),
        message: "Connected to Oracle Builder WebSocket".to_string(),
    };
    state.client_manager.send_to_client(&client_id, &welcome_response);
    
    // Handle incoming messages from the client
    while let Some(message_result) = ws_receiver.next().await {
        match message_result {
            Ok(Message::Text(text)) => {
                if let Err(e) = handle_client_message(&state, &client_id, &text).await {
                    error!("Error handling client message: {}", e);
                    let error_response = OracleBuilderResponse::Error {
                        message: format!("Error processing message: {}", e),
                        code: "PROCESSING_ERROR".to_string(),
                    };
                    state.client_manager.send_to_client(&client_id, &error_response);
                }
            }
            Ok(Message::Close(_)) => {
                info!("WebSocket client {} requested close", client_id);
                break;
            }
            Ok(Message::Ping(data)) => {
                // Respond to ping with pong
                if let Some(client) = state.client_manager.clients.get(&client_id) {
                    let _ = client.send(tokio_tungstenite::tungstenite::Message::Pong(data));
                }
            }
            Ok(_) => {
                // Handle other message types if needed
            }
            Err(e) => {
                error!("WebSocket error for client {}: {}", client_id, e);
                break;
            }
        }
    }
    
    // Clean up when connection ends
    info!("WebSocket connection ended for client: {}", client_id);
    state.client_manager.remove_client(&client_id);
    sender_task.abort();
}

/// Handle incoming messages from clients
async fn handle_client_message(
    state: &WebSocketState,
    client_id: &str,
    message_text: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let message: OracleBuilderMessage = serde_json::from_str(message_text)?;
    
    info!("Received message from client {}: {:?}", client_id, message);
    
    let response = match message {
        OracleBuilderMessage::SubscribeOracles => {
            state.client_manager.add_subscription(client_id, SubscriptionType::AllOracles);
            OracleBuilderResponse::SubscriptionConfirmed {
                subscription_type: "all_oracles".to_string(),
                message: "Subscribed to all oracle updates".to_string(),
            }
        }
        
        OracleBuilderMessage::SubscribePriceFeeds => {
            state.client_manager.add_subscription(client_id, SubscriptionType::AllPriceFeeds);
            OracleBuilderResponse::SubscriptionConfirmed {
                subscription_type: "all_price_feeds".to_string(),
                message: "Subscribed to all price feed updates".to_string(),
            }
        }
        
        OracleBuilderMessage::SubscribeOraclesByOwner { owner_id } => {
            state.client_manager.add_subscription(client_id, SubscriptionType::OraclesByOwner(owner_id.clone()));
            OracleBuilderResponse::SubscriptionConfirmed {
                subscription_type: "oracles_by_owner".to_string(),
                message: format!("Subscribed to oracle updates for owner: {}", owner_id),
            }
        }
        
        OracleBuilderMessage::SubscribePriceFeedsByOracle { oracle_id } => {
            state.client_manager.add_subscription(client_id, SubscriptionType::PriceFeedsByOracle(oracle_id.clone()));
            OracleBuilderResponse::SubscriptionConfirmed {
                subscription_type: "price_feeds_by_oracle".to_string(),
                message: format!("Subscribed to price feed updates for oracle: {}", oracle_id),
            }
        }
        
        OracleBuilderMessage::UnsubscribeOracles => {
            state.client_manager.remove_subscription(client_id, &SubscriptionType::AllOracles);
            OracleBuilderResponse::SubscriptionConfirmed {
                subscription_type: "unsubscribe_all_oracles".to_string(),
                message: "Unsubscribed from all oracle updates".to_string(),
            }
        }
        
        OracleBuilderMessage::UnsubscribePriceFeeds => {
            state.client_manager.remove_subscription(client_id, &SubscriptionType::AllPriceFeeds);
            OracleBuilderResponse::SubscriptionConfirmed {
                subscription_type: "unsubscribe_all_price_feeds".to_string(),
                message: "Unsubscribed from all price feed updates".to_string(),
            }
        }
        
        OracleBuilderMessage::UnsubscribeOraclesByOwner { owner_id } => {
            state.client_manager.remove_subscription(client_id, &SubscriptionType::OraclesByOwner(owner_id.clone()));
            OracleBuilderResponse::SubscriptionConfirmed {
                subscription_type: "unsubscribe_oracles_by_owner".to_string(),
                message: format!("Unsubscribed from oracle updates for owner: {}", owner_id),
            }
        }
        
        OracleBuilderMessage::UnsubscribePriceFeedsByOracle { oracle_id } => {
            state.client_manager.remove_subscription(client_id, &SubscriptionType::PriceFeedsByOracle(oracle_id.clone()));
            OracleBuilderResponse::SubscriptionConfirmed {
                subscription_type: "unsubscribe_price_feeds_by_oracle".to_string(),
                message: format!("Unsubscribed from price feed updates for oracle: {}", oracle_id),
            }
        }
    };
    
    state.client_manager.send_to_client(client_id, &response);
    Ok(())
}

/// Background task to handle broadcast messages
pub async fn run_broadcast_handler(
    client_manager: Arc<ClientManager>,
    mut broadcast_receiver: mpsc::UnboundedReceiver<InternalBroadcastMessage>,
) {
    info!("Starting WebSocket broadcast handler");
    
    while let Some(message) = broadcast_receiver.recv().await {
        client_manager.broadcast(&message);
    }
    
    warn!("WebSocket broadcast handler stopped");
}
