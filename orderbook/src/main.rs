use orderbook::{
    Orderbook, WebSocketServer, OrderbookTester, TesterConfig
};
use rust_decimal::Decimal;
use std::sync::Arc;
use std::time::Duration;
use tracing::{info, error};
use tracing_subscriber;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter("orderbook=info")
        .init();

    info!("Starting Orderbook Server");

    // Create orderbook instance
    let orderbook = Arc::new(Orderbook::new());

    // Create some test markets
    let btc_market = orderbook.create_market("BTC".to_string(), "USD".to_string())?;
    let eth_market = orderbook.create_market("ETH".to_string(), "USD".to_string())?;
    let sol_market = orderbook.create_market("SOL".to_string(), "USD".to_string())?;

    info!("Created markets: {}, {}, {}", btc_market, eth_market, sol_market);

    // Create WebSocket server
    let ws_server = WebSocketServer::new(orderbook.clone());

    // Start WebSocket server
    let addr = "127.0.0.1:8080".parse()?;
    info!("Starting WebSocket server on {}", addr);
    
    let ws_server_clone = ws_server.clone();
    let server_handle = tokio::spawn(async move {
        if let Err(e) = ws_server_clone.start(addr).await {
            error!("WebSocket server error: {}", e);
        }
    });

    // Start broadcasters
    let ws_server_clone = ws_server.clone();
    let broadcaster_handle = tokio::spawn(async move {
        ws_server_clone.start_broadcasters().await;
    });

    // Wait a bit for server to start
    tokio::time::sleep(Duration::from_millis(100)).await;

    // Start test scenarios
    info!("Starting test scenarios");
    let test_configs = vec![
        TesterConfig::new(
            btc_market,
            Decimal::from(50000),
            Decimal::from(1000),
            Duration::from_millis(1000),
        ),
        TesterConfig::new(
            eth_market,
            Decimal::from(3000),
            Decimal::from(100),
            Duration::from_millis(800),
        ),
        TesterConfig::new(
            sol_market,
            Decimal::from(100),
            Decimal::from(10),
            Duration::from_millis(600),
        ),
    ];

    let tester_handles = OrderbookTester::start_multiple_markets(orderbook.clone(), test_configs).await;

    info!("All services started. Press Ctrl+C to stop.");

    // Wait for Ctrl+C
    tokio::signal::ctrl_c().await?;

    info!("Shutting down...");

    // Stop all testers
    for handle in tester_handles {
        handle.abort();
    }

    // Stop server tasks
    server_handle.abort();
    broadcaster_handle.abort();

    info!("Shutdown complete");

    Ok(())
}

#[cfg(test)]
mod integration_tests {
    use super::*;
    use tokio_tungstenite::{connect_async, tungstenite::Message};
    use futures_util::{SinkExt, StreamExt};
    use serde_json;
    use orderbook::{ClientMessage, ServerMessage, SubscriptionType};

    #[tokio::test]
    async fn test_full_integration() {
        // Initialize tracing for tests
        let _ = tracing_subscriber::fmt()
            .with_env_filter("orderbook=debug")
            .try_init();

        // Create orderbook and server
        let orderbook = Arc::new(Orderbook::new());
        let market_id = orderbook.create_market("BTC".to_string(), "USD".to_string()).unwrap();
        let ws_server = WebSocketServer::new(orderbook.clone());
        
        // Start server
        let addr = "127.0.0.1:8083".parse().unwrap();
        let server_clone = ws_server.clone();
        tokio::spawn(async move {
            let _ = server_clone.start(addr).await;
        });
        
        // Start broadcasters
        let server_clone = ws_server.clone();
        tokio::spawn(async move {
            server_clone.start_broadcasters().await;
        });

        // Give server time to start
        tokio::time::sleep(Duration::from_millis(100)).await;

        // Connect to the server
        let url = "ws://127.0.0.1:8083";
        let (ws_stream, _) = connect_async(url).await.expect("Failed to connect");
        let (mut ws_sender, mut ws_receiver) = ws_stream.split();

        // Subscribe to both book state and top of book
        let subscribe_book = ClientMessage::Subscribe {
            subscription_type: SubscriptionType::BookState,
            market_id: market_id.clone(),
        };
        let message = serde_json::to_string(&subscribe_book).unwrap();
        ws_sender.send(Message::Text(message)).await.unwrap();

        let subscribe_top = ClientMessage::Subscribe {
            subscription_type: SubscriptionType::TopOfBook,
            market_id: market_id.clone(),
        };
        let message = serde_json::to_string(&subscribe_top).unwrap();
        ws_sender.send(Message::Text(message)).await.unwrap();

        // Read initial messages
        let _ = ws_receiver.next().await; // BookStateUpdate
        let _ = ws_receiver.next().await; // TopOfBookUpdate

        // Start a tester
        let tester = OrderbookTester::new(
            orderbook.clone(),
            market_id.clone(),
            Decimal::from(50000),
            Decimal::from(100),
            Duration::from_millis(100),
        );

        let tester_clone = tester.clone();
        let tester_handle = tokio::spawn(async move {
            let _ = tester_clone.start().await;
        });

        // Let it run for a bit and collect some messages
        let mut message_count = 0;
        let start_time = std::time::Instant::now();
        
        while start_time.elapsed() < Duration::from_secs(2) && message_count < 10 {
            if let Some(Ok(Message::Text(text))) = ws_receiver.next().await {
                let _: ServerMessage = serde_json::from_str(&text).unwrap();
                message_count += 1;
            }
        }

        // Stop the tester
        tester.stop().await;
        tester_handle.abort();

        assert!(message_count > 0, "Should have received some messages");
        
        // Verify final book state
        let book_state = orderbook.get_book_state(&market_id).await.unwrap();
        assert!(book_state.buy_orders.len() > 0 || book_state.sell_orders.len() > 0);
    }
}