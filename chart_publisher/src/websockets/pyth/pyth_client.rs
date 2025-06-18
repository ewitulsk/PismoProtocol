use anyhow::Result;
use futures_util::{SinkExt, StreamExt, stream::{SplitSink, SplitStream}};
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message, WebSocketStream, MaybeTlsStream};
use tracing::{info, error, debug};
use crate::websockets::pyth::{handlers::handler::handle_incoming_message, messages::PythMessage};

type WsSink = SplitSink<WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>, Message>;
type WsStream = SplitStream<WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>>;

pub struct PythWebSocketClient {
    pub url: String,
    write_tx: Option<mpsc::UnboundedSender<Message>>,
}

impl PythWebSocketClient {
    pub fn new(url: String) -> Self {
        Self { 
            url,
            write_tx: None,
        }
    }

    pub async fn connect(&mut self) -> Result<tokio::task::JoinHandle<()>> {
        info!("Connecting to Pyth WebSocket at: {}", &self.url);
        
        let (ws_stream, _) = connect_async(&self.url).await?;
        let (write, read) = ws_stream.split();

        let (write_tx, write_rx) = mpsc::unbounded_channel::<Message>();
        self.write_tx = Some(write_tx);

        let handle = tokio::spawn(async move {
            Self::handle_websocket_streams(write, read, write_rx).await;
        });

        Ok(handle)
    }

    async fn handle_websocket_streams(
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
                            if let Err(e) = handle_incoming_message(&text).await {
                                error!("Error handling message: {}", e);
                            }
                        }
                        Ok(Message::Close(_)) => {
                            info!("WebSocket connection closed");
                            break;
                        }
                        Err(e) => {
                            error!("WebSocket error: {}", e);
                            break;
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    async fn send_message(&self, message: Message) -> Result<()> {
        if let Some(tx) = &self.write_tx {
            tx.send(message)?;
            Ok(())
        } else {
            Err(anyhow::anyhow!("WebSocket not connected"))
        }
    }

    pub async fn subscribe(&mut self, feed_id: &str) -> Result<()> {
        let subscribe_msg = PythMessage::Subscribe {
            ids: vec![feed_id.to_string()],
        };
        
        let subscribe_json = serde_json::to_string(&subscribe_msg)?;
        info!("Sending subscription for feed_id: {}", feed_id);
        debug!("Subscription message: {}", subscribe_json);
        
        self.send_message(Message::Text(subscribe_json)).await?;
        Ok(())
    }

    pub async fn handle_message(&self, message: &str) -> Result<()> {
        handle_incoming_message(message).await?;
        Ok(())
    }
} 