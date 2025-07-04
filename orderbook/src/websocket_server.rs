use crate::orderbook::{Orderbook, BookState, TopOfBook};

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, RwLock};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ClientMessage {
    Subscribe {
        subscription_type: SubscriptionType,
        market_id: String,
    },
    Unsubscribe {
        subscription_type: SubscriptionType,
        market_id: String,
    },
    CreateMarket {
        asset: String,
        buy_currency: String,
    },
    CreateBuy {
        market_id: String,
        price: String,
        amount: String,
    },
    CreateSell {
        market_id: String,
        price: String,
        amount: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ServerMessage {
    BookStateUpdate {
        market_id: String,
        book_state: BookState,
    },
    TopOfBookUpdate {
        market_id: String,
        top_of_book: TopOfBook,
    },
    MarketCreated {
        market_id: String,
    },
    OrderCreated {
        market_id: String,
        trades: Vec<crate::orderbook::Trade>,
        book_state: BookState,
    },
    Error {
        message: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum SubscriptionType {
    BookState,
    TopOfBook,
}

pub struct WebSocketServer {
    orderbook: Arc<Orderbook>,
    clients: Arc<RwLock<HashMap<Uuid, ClientConnection>>>,
    book_state_broadcaster: broadcast::Sender<(String, BookState)>,
    top_of_book_broadcaster: broadcast::Sender<(String, TopOfBook)>,
}

struct ClientConnection {
    #[allow(dead_code)]
    id: Uuid,
    sender: tokio::sync::mpsc::UnboundedSender<ServerMessage>,
    subscriptions: HashMap<String, Vec<SubscriptionType>>,
}

impl WebSocketServer {
    pub fn new(orderbook: Arc<Orderbook>) -> Self {
        let (book_state_broadcaster, _) = broadcast::channel(1000);
        let (top_of_book_broadcaster, _) = broadcast::channel(1000);

        Self {
            orderbook,
            clients: Arc::new(RwLock::new(HashMap::new())),
            book_state_broadcaster,
            top_of_book_broadcaster,
        }
    }

    pub async fn start(&self, addr: SocketAddr) -> Result<(), Box<dyn std::error::Error>> {
        let listener = TcpListener::bind(addr).await?;
        tracing::info!("WebSocket server listening on: {}", addr);

        while let Ok((stream, _)) = listener.accept().await {
            let server = self.clone();
            tokio::spawn(async move {
                if let Err(e) = server.handle_connection(stream).await {
                    tracing::error!("Error handling connection: {}", e);
                }
            });
        }

        Ok(())
    }

    async fn handle_connection(&self, stream: TcpStream) -> Result<(), Box<dyn std::error::Error>> {
        let ws_stream = accept_async(stream).await?;
        let (mut ws_sender, mut ws_receiver) = ws_stream.split();

        let client_id = Uuid::new_v4();
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();

        let client = ClientConnection {
            id: client_id,
            sender: tx,
            subscriptions: HashMap::new(),
        };

        self.clients.write().await.insert(client_id, client);

        // Task to send messages to the client
        let _clients = self.clients.clone();
        let send_task = tokio::spawn(async move {
            while let Some(message) = rx.recv().await {
                let json = serde_json::to_string(&message).unwrap();
                if ws_sender.send(Message::Text(json)).await.is_err() {
                    break;
                }
            }
        });

        // Task to handle incoming messages
        let server = self.clone();
        let receive_task = tokio::spawn(async move {
            while let Some(message) = ws_receiver.next().await {
                match message {
                    Ok(Message::Text(text)) => {
                        if let Ok(client_message) = serde_json::from_str::<ClientMessage>(&text) {
                            if let Err(e) = server.handle_client_message(client_id, client_message).await {
                                tracing::error!("Error handling client message: {}", e);
                            }
                        }
                    }
                    Ok(Message::Close(_)) => break,
                    Err(_) => break,
                    _ => {}
                }
            }
        });

        // Wait for either task to complete
        tokio::select! {
            _ = send_task => {},
            _ = receive_task => {},
        }

        // Clean up
        self.clients.write().await.remove(&client_id);
        Ok(())
    }

    async fn handle_client_message(
        &self,
        client_id: Uuid,
        message: ClientMessage,
    ) -> Result<(), Box<dyn std::error::Error>> {
        match message {
            ClientMessage::Subscribe { subscription_type, market_id } => {
                self.subscribe_client(client_id, subscription_type, market_id).await?;
            }
            ClientMessage::Unsubscribe { subscription_type, market_id } => {
                self.unsubscribe_client(client_id, subscription_type, market_id).await?;
            }
            ClientMessage::CreateMarket { asset, buy_currency } => {
                match self.orderbook.create_market(asset, buy_currency) {
                    Ok(market_id) => {
                        self.send_to_client(client_id, ServerMessage::MarketCreated { market_id }).await?;
                    }
                    Err(e) => {
                        self.send_to_client(client_id, ServerMessage::Error { message: e.to_string() }).await?;
                    }
                }
            }
            ClientMessage::CreateBuy { market_id, price, amount } => {
                let price = price.parse().map_err(|_| "Invalid price")?;
                let amount = amount.parse().map_err(|_| "Invalid amount")?;
                
                match self.orderbook.create_buy(market_id.clone(), price, amount).await {
                    Ok((trades, book_state)) => {
                        self.send_to_client(client_id, ServerMessage::OrderCreated { 
                            market_id: market_id.clone(), 
                            trades, 
                            book_state: book_state.clone() 
                        }).await?;
                        
                        // Broadcast updates
                        let _ = self.book_state_broadcaster.send((market_id.clone(), book_state));
                        if let Ok(top_of_book) = self.orderbook.get_top_of_book(&market_id).await {
                            let _ = self.top_of_book_broadcaster.send((market_id, top_of_book));
                        }
                    }
                    Err(e) => {
                        self.send_to_client(client_id, ServerMessage::Error { message: e.to_string() }).await?;
                    }
                }
            }
            ClientMessage::CreateSell { market_id, price, amount } => {
                let price = price.parse().map_err(|_| "Invalid price")?;
                let amount = amount.parse().map_err(|_| "Invalid amount")?;
                
                match self.orderbook.create_sell(market_id.clone(), price, amount).await {
                    Ok((trades, book_state)) => {
                        self.send_to_client(client_id, ServerMessage::OrderCreated { 
                            market_id: market_id.clone(), 
                            trades, 
                            book_state: book_state.clone() 
                        }).await?;
                        
                        // Broadcast updates
                        let _ = self.book_state_broadcaster.send((market_id.clone(), book_state));
                        if let Ok(top_of_book) = self.orderbook.get_top_of_book(&market_id).await {
                            let _ = self.top_of_book_broadcaster.send((market_id, top_of_book));
                        }
                    }
                    Err(e) => {
                        self.send_to_client(client_id, ServerMessage::Error { message: e.to_string() }).await?;
                    }
                }
            }
        }
        Ok(())
    }

    async fn subscribe_client(
        &self,
        client_id: Uuid,
        subscription_type: SubscriptionType,
        market_id: String,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut clients = self.clients.write().await;
        if let Some(client) = clients.get_mut(&client_id) {
            client.subscriptions
                .entry(market_id.clone())
                .or_insert_with(Vec::new)
                .push(subscription_type.clone());

            // Send initial state if subscribing to book state
            if subscription_type == SubscriptionType::BookState {
                if let Ok(book_state) = self.orderbook.get_book_state(&market_id).await {
                    let _ = client.sender.send(ServerMessage::BookStateUpdate { market_id, book_state });
                }
            } else if subscription_type == SubscriptionType::TopOfBook {
                if let Ok(top_of_book) = self.orderbook.get_top_of_book(&market_id).await {
                    let _ = client.sender.send(ServerMessage::TopOfBookUpdate { market_id, top_of_book });
                }
            }
        }
        Ok(())
    }

    async fn unsubscribe_client(
        &self,
        client_id: Uuid,
        subscription_type: SubscriptionType,
        market_id: String,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut clients = self.clients.write().await;
        if let Some(client) = clients.get_mut(&client_id) {
            if let Some(subscriptions) = client.subscriptions.get_mut(&market_id) {
                subscriptions.retain(|s| s != &subscription_type);
                if subscriptions.is_empty() {
                    client.subscriptions.remove(&market_id);
                }
            }
        }
        Ok(())
    }

    async fn send_to_client(
        &self,
        client_id: Uuid,
        message: ServerMessage,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let clients = self.clients.read().await;
        if let Some(client) = clients.get(&client_id) {
            let _ = client.sender.send(message);
        }
        Ok(())
    }

    pub async fn start_broadcasters(&self) {
        let clients = self.clients.clone();
        let mut book_state_receiver = self.book_state_broadcaster.subscribe();
        let book_state_task = tokio::spawn(async move {
            while let Ok((market_id, book_state)) = book_state_receiver.recv().await {
                let clients = clients.read().await;
                for client in clients.values() {
                    if let Some(subscriptions) = client.subscriptions.get(&market_id) {
                        if subscriptions.contains(&SubscriptionType::BookState) {
                            let _ = client.sender.send(ServerMessage::BookStateUpdate {
                                market_id: market_id.clone(),
                                book_state: book_state.clone(),
                            });
                        }
                    }
                }
            }
        });

        let clients = self.clients.clone();
        let mut top_of_book_receiver = self.top_of_book_broadcaster.subscribe();
        let top_of_book_task = tokio::spawn(async move {
            while let Ok((market_id, top_of_book)) = top_of_book_receiver.recv().await {
                let clients = clients.read().await;
                for client in clients.values() {
                    if let Some(subscriptions) = client.subscriptions.get(&market_id) {
                        if subscriptions.contains(&SubscriptionType::TopOfBook) {
                            let _ = client.sender.send(ServerMessage::TopOfBookUpdate {
                                market_id: market_id.clone(),
                                top_of_book: top_of_book.clone(),
                            });
                        }
                    }
                }
            }
        });

        // Wait for both tasks to complete (they shouldn't in normal operation)
        tokio::select! {
            _ = book_state_task => {},
            _ = top_of_book_task => {},
        }
    }
}

impl Clone for WebSocketServer {
    fn clone(&self) -> Self {
        Self {
            orderbook: self.orderbook.clone(),
            clients: self.clients.clone(),
            book_state_broadcaster: self.book_state_broadcaster.clone(),
            top_of_book_broadcaster: self.top_of_book_broadcaster.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio_tungstenite::{connect_async, tungstenite::Message};
    use futures_util::{SinkExt, StreamExt};
    use std::time::Duration;

    #[tokio::test]
    async fn test_websocket_server_basic() {
        let orderbook = Arc::new(Orderbook::new());
        let server = WebSocketServer::new(orderbook.clone());
        
        // Start server in background
        let addr = "127.0.0.1:8081".parse().unwrap();
        let server_clone = server.clone();
        tokio::spawn(async move {
            let _ = server_clone.start(addr).await;
        });
        
        // Start broadcasters
        let server_clone = server.clone();
        tokio::spawn(async move {
            server_clone.start_broadcasters().await;
        });

        // Give the server time to start
        tokio::time::sleep(Duration::from_millis(100)).await;

        // Connect to the server
        let url = "ws://127.0.0.1:8081";
        let (ws_stream, _) = connect_async(url).await.expect("Failed to connect");
        let (mut ws_sender, mut ws_receiver) = ws_stream.split();

        // Create a market
        let create_market = ClientMessage::CreateMarket {
            asset: "BTC".to_string(),
            buy_currency: "USD".to_string(),
        };
        let message = serde_json::to_string(&create_market).unwrap();
        ws_sender.send(Message::Text(message)).await.unwrap();

        // Read the response
        if let Some(Ok(Message::Text(text))) = ws_receiver.next().await {
            let response: ServerMessage = serde_json::from_str(&text).unwrap();
            match response {
                ServerMessage::MarketCreated { market_id } => {
                    assert_eq!(market_id, "BTC_USD");
                }
                _ => panic!("Expected MarketCreated message"),
            }
        } else {
            panic!("Expected a message");
        }

        // Subscribe to book state
        let subscribe = ClientMessage::Subscribe {
            subscription_type: SubscriptionType::BookState,
            market_id: "BTC_USD".to_string(),
        };
        let message = serde_json::to_string(&subscribe).unwrap();
        ws_sender.send(Message::Text(message)).await.unwrap();

        // Read the initial book state
        if let Some(Ok(Message::Text(text))) = ws_receiver.next().await {
            let response: ServerMessage = serde_json::from_str(&text).unwrap();
            match response {
                ServerMessage::BookStateUpdate { market_id, book_state } => {
                    assert_eq!(market_id, "BTC_USD");
                    assert!(book_state.buy_orders.is_empty());
                    assert!(book_state.sell_orders.is_empty());
                }
                _ => panic!("Expected BookStateUpdate message"),
            }
        } else {
            panic!("Expected a message");
        }
    }

    #[tokio::test]
    async fn test_order_creation_broadcast() {
        let orderbook = Arc::new(Orderbook::new());
        let server = WebSocketServer::new(orderbook.clone());
        
        // Start server in background
        let addr = "127.0.0.1:8082".parse().unwrap();
        let server_clone = server.clone();
        tokio::spawn(async move {
            let _ = server_clone.start(addr).await;
        });
        
        // Start broadcasters
        let server_clone = server.clone();
        tokio::spawn(async move {
            server_clone.start_broadcasters().await;
        });

        // Give the server time to start
        tokio::time::sleep(Duration::from_millis(100)).await;

        // Connect to the server
        let url = "ws://127.0.0.1:8082";
        let (ws_stream, _) = connect_async(url).await.expect("Failed to connect");
        let (mut ws_sender, mut ws_receiver) = ws_stream.split();

        // Create a market
        let create_market = ClientMessage::CreateMarket {
            asset: "BTC".to_string(),
            buy_currency: "USD".to_string(),
        };
        let message = serde_json::to_string(&create_market).unwrap();
        ws_sender.send(Message::Text(message)).await.unwrap();

        // Read the response
        if let Some(Ok(Message::Text(_))) = ws_receiver.next().await {
            // Market created
        }

        // Subscribe to book state
        let subscribe = ClientMessage::Subscribe {
            subscription_type: SubscriptionType::BookState,
            market_id: "BTC_USD".to_string(),
        };
        let message = serde_json::to_string(&subscribe).unwrap();
        ws_sender.send(Message::Text(message)).await.unwrap();

        // Read the initial book state
        if let Some(Ok(Message::Text(_))) = ws_receiver.next().await {
            // Initial book state
        }

        // Create a buy order
        let create_buy = ClientMessage::CreateBuy {
            market_id: "BTC_USD".to_string(),
            price: "50000".to_string(),
            amount: "1".to_string(),
        };
        let message = serde_json::to_string(&create_buy).unwrap();
        ws_sender.send(Message::Text(message)).await.unwrap();

        // Should receive OrderCreated message
        if let Some(Ok(Message::Text(text))) = ws_receiver.next().await {
            let response: ServerMessage = serde_json::from_str(&text).unwrap();
            match response {
                ServerMessage::OrderCreated { market_id, trades, book_state } => {
                    assert_eq!(market_id, "BTC_USD");
                    assert!(trades.is_empty());
                    assert_eq!(book_state.buy_orders.len(), 1);
                }
                _ => panic!("Expected OrderCreated message"),
            }
        }

        // Should also receive BookStateUpdate broadcast
        if let Some(Ok(Message::Text(text))) = ws_receiver.next().await {
            let response: ServerMessage = serde_json::from_str(&text).unwrap();
            match response {
                ServerMessage::BookStateUpdate { market_id, book_state } => {
                    assert_eq!(market_id, "BTC_USD");
                    assert_eq!(book_state.buy_orders.len(), 1);
                }
                _ => panic!("Expected BookStateUpdate message"),
            }
        }
    }
}