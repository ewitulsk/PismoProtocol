use std::sync::Arc;

use anyhow::Result;
use futures_util::{SinkExt, StreamExt, stream::{SplitSink, SplitStream}};
use tokio::sync::{mpsc, Mutex};
use tokio::time::{sleep, Duration};
use tokio_tungstenite::{connect_async, tungstenite::Message, WebSocketStream, MaybeTlsStream};
use tracing::{info, error, debug, warn};

use crate::{PriceUpdateSender};
use crate::websockets::pyth::{
    handlers::handler::handle_incoming_message, 
    messages::PythRequest
};

type WsSink = SplitSink<WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>, Message>;
type WsStream = SplitStream<WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>>;

pub struct PythWebSocketClient {
    pub url: String,
    pub reconnect_delay: Duration,
    write_tx: Arc<Mutex<Option<mpsc::UnboundedSender<Message>>>>,
    subscribed_feeds: Arc<Mutex<Vec<String>>>,
    price_update_sender: PriceUpdateSender,
}

impl PythWebSocketClient {
    pub fn new(
        url: String, 
        reconnect_delay: Duration,
        price_update_sender: PriceUpdateSender,
    ) -> Self {
        Self { 
            url,
            reconnect_delay,
            write_tx: Arc::new(Mutex::new(None)),
            subscribed_feeds: Arc::new(Mutex::new(Vec::new())),
            price_update_sender,
        }
    }

    async fn connect(&self) -> Result<()> {
        info!("Connecting to Pyth WebSocket at: {}", &self.url);
        
        let (ws_stream, _) = connect_async(&self.url).await?;
        let (write, read) = ws_stream.split();

        let (write_tx, write_rx) = mpsc::unbounded_channel::<Message>();
        {
            let mut tx_guard = self.write_tx.lock().await;
            *tx_guard = Some(write_tx);
        }

        // Re-subscribe to feeds after connection
        info!("Subscribing");
        self.resubscribe_feeds().await?;
        info!("Done Resubscribing");
        self.handle_websocket_streams(write, read, write_rx).await;
        info!("Done Connecting");
        Ok(())
    }

    async fn handle_websocket_streams(
        &self,
        mut write: WsSink, 
        mut read: WsStream, 
        mut write_rx: mpsc::UnboundedReceiver<Message>
    ) {
        loop {
            tokio::select! {
                Some(message) = write_rx.recv() => {
                    if let Err(e) = write.send(message).await {
                        error!("Error sending WebSocket message: {}", e);
                        break;
                    }
                }
                
                Some(message) = read.next() => {
                    match message {
                        Ok(Message::Text(text)) => {
                            if let Err(e) = handle_incoming_message(&text, self.price_update_sender.clone()).await {
                                error!("Error handling message: {}", e);
                            }
                        }
                        Ok(Message::Close(_)) => {
                            info!("Pyth WebSocket connection closed");
                            break;
                        }
                        Err(e) => {
                            error!("Pyth WebSocket error: {}", e);
                            break;
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    async fn send_message(&self, message: Message) -> Result<()> {
        let tx_guard = self.write_tx.lock().await;
        if let Some(tx) = tx_guard.as_ref() {
            tx.send(message)?;
            Ok(())
        } else {
            Err(anyhow::anyhow!("WebSocket not connected"))
        }
    }

    pub async fn subscribe(&self, feed_id: &str) -> Result<()> {
        // Add to subscribed feeds list
        {
            let mut feeds = self.subscribed_feeds.lock().await;
            if !feeds.contains(&feed_id.to_string()) {
                feeds.push(feed_id.to_string());
            }
        }

        let subscribe_msg = PythRequest::Subscribe {
            ids: vec![feed_id.to_string()],
        };
        
        let subscribe_json = serde_json::to_string(&subscribe_msg)?;
        info!("Subscribing to feed: {}", feed_id);
        debug!("Subscription message: {}", subscribe_json);
        
        self.send_message(Message::Text(subscribe_json)).await?;
        Ok(())
    }

    async fn resubscribe_feeds(&self) -> Result<()> {
        let feeds = self.subscribed_feeds.lock().await;
        if !feeds.is_empty() {
            info!("Re-subscribing to {} feeds", feeds.len());
            
            let subscribe_msg = PythRequest::Subscribe {
                ids: feeds.clone(),
            };
            
            let subscribe_json = serde_json::to_string(&subscribe_msg)?;
            debug!("Re-subscription message: {}", subscribe_json);
            
            self.send_message(Message::Text(subscribe_json)).await?;
        }
        Ok(())
    }

    pub async fn get_subscribed_feeds(&self) -> Vec<String> {
        let feeds = self.subscribed_feeds.lock().await;
        feeds.clone()
    }
}

/// Start the Pyth WebSocket client with automatic reconnection
pub fn start_pyth_client(client: Arc<PythWebSocketClient>) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            match client.connect().await {
                Ok(_) => {
                    warn!("Pyth WebSocket connection closed, reconnecting...");
                }
                Err(e) => {
                    error!("Error connecting to Pyth WebSocket: {}", e);
                }
            }
            
            info!("Reconnecting to Pyth WebSocket in {} seconds...", client.reconnect_delay.as_secs());
            sleep(client.reconnect_delay).await;
        }
    })
} 