use crate::orderbook::Orderbook;
use rust_decimal::Decimal;
use std::sync::Arc;
use std::time::Duration;
use tokio::time;
use rand::{Rng, SeedableRng};

pub struct OrderbookTester {
    orderbook: Arc<Orderbook>,
    market_id: String,
    base_price: Decimal,
    price_volatility: Decimal,
    order_frequency: Duration,
    running: Arc<tokio::sync::RwLock<bool>>,
}

impl OrderbookTester {
    pub fn new(
        orderbook: Arc<Orderbook>,
        market_id: String,
        base_price: Decimal,
        price_volatility: Decimal,
        order_frequency: Duration,
    ) -> Self {
        Self {
            orderbook,
            market_id,
            base_price,
            price_volatility,
            order_frequency,
            running: Arc::new(tokio::sync::RwLock::new(false)),
        }
    }

    pub async fn start(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        {
            let mut running = self.running.write().await;
            *running = true;
        }

        let mut interval = time::interval(self.order_frequency);
        let mut rng = rand::rngs::StdRng::from_entropy();

        while *self.running.read().await {
            interval.tick().await;

            // Generate random price around base price
            let price_variation = (rng.gen::<f64>() - 0.5) * 2.0; // -1.0 to 1.0
            let price_change = self.price_volatility * Decimal::from_f64_retain(price_variation).unwrap_or(Decimal::ZERO);
            let price = self.base_price + price_change;

            // Generate random amount
            let amount = Decimal::from_f64_retain(rng.gen_range(0.1..10.0)).unwrap_or(Decimal::ONE);

            // Randomly choose buy or sell
            let is_buy = rng.gen_bool(0.5);

            let result = if is_buy {
                self.orderbook.create_buy(self.market_id.clone(), price, amount).await
            } else {
                self.orderbook.create_sell(self.market_id.clone(), price, amount).await
            };

            match result {
                Ok((trades, _)) => {
                    if !trades.is_empty() {
                        tracing::info!("Generated {} trades for {} order at price {}", 
                            trades.len(), 
                            if is_buy { "buy" } else { "sell" }, 
                            price
                        );
                    }
                }
                Err(e) => {
                    tracing::error!("Error creating order: {}", e);
                }
            }
        }

        Ok(())
    }

    pub async fn stop(&self) {
        let mut running = self.running.write().await;
        *running = false;
    }

    pub async fn is_running(&self) -> bool {
        *self.running.read().await
    }

    pub async fn start_multiple_markets(
        orderbook: Arc<Orderbook>,
        configs: Vec<TesterConfig>,
    ) -> Vec<tokio::task::JoinHandle<Result<(), Box<dyn std::error::Error + Send + Sync>>>> {
        let mut handles = Vec::new();

        for config in configs {
            let tester = OrderbookTester::new(
                orderbook.clone(),
                config.market_id,
                config.base_price,
                config.price_volatility,
                config.order_frequency,
            );

            let handle = tokio::spawn(async move {
                if let Err(e) = tester.start().await {
                    return Err(format!("Tester error: {}", e).into());
                }
                Ok(())
            });

            handles.push(handle);
        }

        handles
    }
}

#[derive(Debug, Clone)]
pub struct TesterConfig {
    pub market_id: String,
    pub base_price: Decimal,
    pub price_volatility: Decimal,
    pub order_frequency: Duration,
}

impl TesterConfig {
    pub fn new(
        market_id: String,
        base_price: Decimal,
        price_volatility: Decimal,
        order_frequency: Duration,
    ) -> Self {
        Self {
            market_id,
            base_price,
            price_volatility,
            order_frequency,
        }
    }
}

// Helper function to create common test scenarios
pub fn create_test_scenarios() -> Vec<TesterConfig> {
    vec![
        TesterConfig::new(
            "BTC_USD".to_string(),
            Decimal::from(50000),
            Decimal::from(1000),
            Duration::from_millis(500),
        ),
        TesterConfig::new(
            "ETH_USD".to_string(),
            Decimal::from(3000),
            Decimal::from(100),
            Duration::from_millis(300),
        ),
        TesterConfig::new(
            "SOL_USD".to_string(),
            Decimal::from(100),
            Decimal::from(10),
            Duration::from_millis(200),
        ),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;
    use std::time::Duration;

    #[tokio::test]
    async fn test_tester_creation() {
        let orderbook = Arc::new(Orderbook::new());
        let market_id = orderbook.create_market("BTC".to_string(), "USD".to_string()).unwrap();
        
        let tester = OrderbookTester::new(
            orderbook.clone(),
            market_id,
            dec!(50000),
            dec!(1000),
            Duration::from_millis(100),
        );

        assert!(!tester.is_running().await);
    }

    #[tokio::test]
    async fn test_tester_generates_orders() {
        let orderbook = Arc::new(Orderbook::new());
        let market_id = orderbook.create_market("BTC".to_string(), "USD".to_string()).unwrap();
        
        let tester = OrderbookTester::new(
            orderbook.clone(),
            market_id.clone(),
            dec!(50000),
            dec!(1000),
            Duration::from_millis(50),
        );

        // Start the tester in a background task
        let tester_clone = tester.clone();
        let handle = tokio::spawn(async move {
            tester_clone.start().await
        });

        // Let it run for a short time
        tokio::time::sleep(Duration::from_millis(200)).await;

        // Stop the tester
        tester.stop().await;
        
        // Wait for the task to complete
        let _ = handle.await;

        // Check that orders were created
        let book_state = orderbook.get_book_state(&market_id).await.unwrap();
        assert!(book_state.buy_orders.len() > 0 || book_state.sell_orders.len() > 0);
    }

    #[tokio::test]
    async fn test_multiple_market_testing() {
        let orderbook = Arc::new(Orderbook::new());
        
        // Create markets
        let btc_market = orderbook.create_market("BTC".to_string(), "USD".to_string()).unwrap();
        let eth_market = orderbook.create_market("ETH".to_string(), "USD".to_string()).unwrap();
        
        let configs = vec![
            TesterConfig::new(
                btc_market.clone(),
                dec!(50000),
                dec!(1000),
                Duration::from_millis(100),
            ),
            TesterConfig::new(
                eth_market.clone(),
                dec!(3000),
                dec!(100),
                Duration::from_millis(100),
            ),
        ];

        let handles = OrderbookTester::start_multiple_markets(orderbook.clone(), configs).await;

        // Let them run for a short time
        tokio::time::sleep(Duration::from_millis(300)).await;

        // Stop all testers by aborting the handles
        for handle in handles {
            handle.abort();
        }

        // Check that both markets have orders
        let btc_book = orderbook.get_book_state(&btc_market).await.unwrap();
        let eth_book = orderbook.get_book_state(&eth_market).await.unwrap();
        
        assert!(btc_book.buy_orders.len() > 0 || btc_book.sell_orders.len() > 0);
        assert!(eth_book.buy_orders.len() > 0 || eth_book.sell_orders.len() > 0);
    }

    #[tokio::test]
    async fn test_tester_config_creation() {
        let config = TesterConfig::new(
            "BTC_USD".to_string(),
            dec!(50000),
            dec!(1000),
            Duration::from_millis(100),
        );

        assert_eq!(config.market_id, "BTC_USD");
        assert_eq!(config.base_price, dec!(50000));
        assert_eq!(config.price_volatility, dec!(1000));
        assert_eq!(config.order_frequency, Duration::from_millis(100));
    }

    #[tokio::test]
    async fn test_create_test_scenarios() {
        let scenarios = create_test_scenarios();
        assert_eq!(scenarios.len(), 3);
        
        assert_eq!(scenarios[0].market_id, "BTC_USD");
        assert_eq!(scenarios[1].market_id, "ETH_USD");
        assert_eq!(scenarios[2].market_id, "SOL_USD");
    }
}

impl Clone for OrderbookTester {
    fn clone(&self) -> Self {
        Self {
            orderbook: self.orderbook.clone(),
            market_id: self.market_id.clone(),
            base_price: self.base_price,
            price_volatility: self.price_volatility,
            order_frequency: self.order_frequency,
            running: self.running.clone(),
        }
    }
}