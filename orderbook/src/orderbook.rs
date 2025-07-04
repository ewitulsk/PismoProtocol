use crate::error::OrderbookError;
use dashmap::DashMap;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use std::collections::BTreeMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Order {
    pub id: Uuid,
    pub price: Decimal,
    pub amount: Decimal,
    pub side: OrderSide,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OrderSide {
    Buy,
    Sell,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Market {
    pub id: String,
    pub asset: String,
    pub buy_currency: String,
    pub buy_orders: BTreeMap<Decimal, Vec<Order>>, // Price -> Orders (highest price first)
    pub sell_orders: BTreeMap<Decimal, Vec<Order>>, // Price -> Orders (lowest price first)
}

impl Market {
    pub fn new(id: String, asset: String, buy_currency: String) -> Self {
        Self {
            id,
            asset,
            buy_currency,
            buy_orders: BTreeMap::new(),
            sell_orders: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookState {
    pub market_id: String,
    pub buy_orders: Vec<(Decimal, Decimal)>, // (price, total_amount)
    pub sell_orders: Vec<(Decimal, Decimal)>, // (price, total_amount)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopOfBook {
    pub market_id: String,
    pub highest_buy: Option<Decimal>,
    pub lowest_sell: Option<Decimal>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trade {
    pub id: Uuid,
    pub market_id: String,
    pub price: Decimal,
    pub amount: Decimal,
    pub buy_order_id: Uuid,
    pub sell_order_id: Uuid,
    pub timestamp: u64,
}

pub struct Orderbook {
    markets: Arc<DashMap<String, Arc<RwLock<Market>>>>,
    trades: Arc<RwLock<Vec<Trade>>>,
}

impl Orderbook {
    pub fn new() -> Self {
        Self {
            markets: Arc::new(DashMap::new()),
            trades: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub fn create_market(&self, asset: String, buy_currency: String) -> Result<String, OrderbookError> {
        let market_id = format!("{}_{}", asset, buy_currency);
        
        if self.markets.contains_key(&market_id) {
            return Err(OrderbookError::MarketAlreadyExists(market_id));
        }

        let market = Market::new(market_id.clone(), asset, buy_currency);
        self.markets.insert(market_id.clone(), Arc::new(RwLock::new(market)));
        
        Ok(market_id)
    }

    pub async fn create_buy(&self, market_id: String, price: Decimal, amount: Decimal) -> Result<(Vec<Trade>, BookState), OrderbookError> {
        if amount <= Decimal::ZERO {
            return Err(OrderbookError::InvalidAmount("Amount must be positive".to_string()));
        }

        let market_arc = self.markets.get(&market_id)
            .ok_or_else(|| OrderbookError::MarketNotFound(market_id.clone()))?;
        
        let mut market = market_arc.write().await;
        
        let order = Order {
            id: Uuid::new_v4(),
            price,
            amount,
            side: OrderSide::Buy,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        };

        let trades = self.match_buy_order(&mut market, order).await?;
        let book_state = self.get_book_state_internal(&market);
        
        Ok((trades, book_state))
    }

    pub async fn create_sell(&self, market_id: String, price: Decimal, amount: Decimal) -> Result<(Vec<Trade>, BookState), OrderbookError> {
        if amount <= Decimal::ZERO {
            return Err(OrderbookError::InvalidAmount("Amount must be positive".to_string()));
        }

        let market_arc = self.markets.get(&market_id)
            .ok_or_else(|| OrderbookError::MarketNotFound(market_id.clone()))?;
        
        let mut market = market_arc.write().await;
        
        let order = Order {
            id: Uuid::new_v4(),
            price,
            amount,
            side: OrderSide::Sell,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        };

        let trades = self.match_sell_order(&mut market, order).await?;
        let book_state = self.get_book_state_internal(&market);
        
        Ok((trades, book_state))
    }

    async fn match_buy_order(&self, market: &mut Market, mut order: Order) -> Result<Vec<Trade>, OrderbookError> {
        let mut trades = Vec::new();
        let mut remaining_amount = order.amount;

        // Try to match with existing sell orders (lowest price first)
        let mut prices_to_remove = Vec::new();
        
        for (sell_price, sell_orders) in market.sell_orders.iter_mut() {
            if order.price < *sell_price {
                break; // No more matches possible
            }

            let mut orders_to_remove = Vec::new();
            
            for (i, sell_order) in sell_orders.iter_mut().enumerate() {
                let trade_amount = remaining_amount.min(sell_order.amount);
                
                let trade = Trade {
                    id: Uuid::new_v4(),
                    market_id: market.id.clone(),
                    price: *sell_price,
                    amount: trade_amount,
                    buy_order_id: order.id,
                    sell_order_id: sell_order.id,
                    timestamp: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_secs(),
                };

                trades.push(trade);
                remaining_amount -= trade_amount;
                sell_order.amount -= trade_amount;

                if sell_order.amount == Decimal::ZERO {
                    orders_to_remove.push(i);
                }

                if remaining_amount == Decimal::ZERO {
                    break;
                }
            }

            // Remove filled orders (in reverse order to maintain indices)
            for &index in orders_to_remove.iter().rev() {
                sell_orders.remove(index);
            }

            if sell_orders.is_empty() {
                prices_to_remove.push(*sell_price);
            }

            if remaining_amount == Decimal::ZERO {
                break;
            }
        }

        // Remove empty price levels
        for price in prices_to_remove {
            market.sell_orders.remove(&price);
        }

        // Add remaining amount to buy orders
        if remaining_amount > Decimal::ZERO {
            order.amount = remaining_amount;
            market.buy_orders.entry(order.price).or_insert_with(Vec::new).push(order);
        }

        // Store trades
        {
            let mut all_trades = self.trades.write().await;
            all_trades.extend(trades.clone());
        }

        Ok(trades)
    }

    async fn match_sell_order(&self, market: &mut Market, mut order: Order) -> Result<Vec<Trade>, OrderbookError> {
        let mut trades = Vec::new();
        let mut remaining_amount = order.amount;

        // Try to match with existing buy orders (highest price first)
        let mut prices_to_remove = Vec::new();
        
        for (buy_price, buy_orders) in market.buy_orders.iter_mut().rev() {
            if order.price > *buy_price {
                break; // No more matches possible
            }

            let mut orders_to_remove = Vec::new();
            
            for (i, buy_order) in buy_orders.iter_mut().enumerate() {
                let trade_amount = remaining_amount.min(buy_order.amount);
                
                let trade = Trade {
                    id: Uuid::new_v4(),
                    market_id: market.id.clone(),
                    price: *buy_price,
                    amount: trade_amount,
                    buy_order_id: buy_order.id,
                    sell_order_id: order.id,
                    timestamp: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_secs(),
                };

                trades.push(trade);
                remaining_amount -= trade_amount;
                buy_order.amount -= trade_amount;

                if buy_order.amount == Decimal::ZERO {
                    orders_to_remove.push(i);
                }

                if remaining_amount == Decimal::ZERO {
                    break;
                }
            }

            // Remove filled orders (in reverse order to maintain indices)
            for &index in orders_to_remove.iter().rev() {
                buy_orders.remove(index);
            }

            if buy_orders.is_empty() {
                prices_to_remove.push(*buy_price);
            }

            if remaining_amount == Decimal::ZERO {
                break;
            }
        }

        // Remove empty price levels
        for price in prices_to_remove {
            market.buy_orders.remove(&price);
        }

        // Add remaining amount to sell orders
        if remaining_amount > Decimal::ZERO {
            order.amount = remaining_amount;
            market.sell_orders.entry(order.price).or_insert_with(Vec::new).push(order);
        }

        // Store trades
        {
            let mut all_trades = self.trades.write().await;
            all_trades.extend(trades.clone());
        }

        Ok(trades)
    }

    pub async fn get_book_state(&self, market_id: &str) -> Result<BookState, OrderbookError> {
        let market_arc = self.markets.get(market_id)
            .ok_or_else(|| OrderbookError::MarketNotFound(market_id.to_string()))?;
        
        let market = market_arc.read().await;
        Ok(self.get_book_state_internal(&market))
    }

    fn get_book_state_internal(&self, market: &Market) -> BookState {
        let buy_orders = market.buy_orders.iter()
            .map(|(price, orders)| {
                let total_amount = orders.iter().map(|o| o.amount).sum();
                (*price, total_amount)
            })
            .collect();

        let sell_orders = market.sell_orders.iter()
            .map(|(price, orders)| {
                let total_amount = orders.iter().map(|o| o.amount).sum();
                (*price, total_amount)
            })
            .collect();

        BookState {
            market_id: market.id.clone(),
            buy_orders,
            sell_orders,
        }
    }

    pub async fn get_top_of_book(&self, market_id: &str) -> Result<TopOfBook, OrderbookError> {
        let market_arc = self.markets.get(market_id)
            .ok_or_else(|| OrderbookError::MarketNotFound(market_id.to_string()))?;
        
        let market = market_arc.read().await;
        
        let highest_buy = market.buy_orders.keys().last().copied();
        let lowest_sell = market.sell_orders.keys().next().copied();

        Ok(TopOfBook {
            market_id: market_id.to_string(),
            highest_buy,
            lowest_sell,
        })
    }

    pub fn get_markets(&self) -> Vec<String> {
        self.markets.iter().map(|entry| entry.key().clone()).collect()
    }

    pub async fn get_trades(&self, market_id: &str) -> Vec<Trade> {
        let trades = self.trades.read().await;
        trades.iter()
            .filter(|t| t.market_id == market_id)
            .cloned()
            .collect()
    }
}

impl Default for Orderbook {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    #[tokio::test]
    async fn test_create_market() {
        let orderbook = Orderbook::new();
        let market_id = orderbook.create_market("BTC".to_string(), "USD".to_string()).unwrap();
        assert_eq!(market_id, "BTC_USD");
        
        // Test duplicate market creation
        let result = orderbook.create_market("BTC".to_string(), "USD".to_string());
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_create_buy_order() {
        let orderbook = Orderbook::new();
        let market_id = orderbook.create_market("BTC".to_string(), "USD".to_string()).unwrap();
        
        let (trades, book_state) = orderbook.create_buy(market_id.clone(), dec!(50000), dec!(1)).await.unwrap();
        
        assert!(trades.is_empty()); // No matching sell orders
        assert_eq!(book_state.buy_orders.len(), 1);
        assert_eq!(book_state.buy_orders[0], (dec!(50000), dec!(1)));
    }

    #[tokio::test]
    async fn test_create_sell_order() {
        let orderbook = Orderbook::new();
        let market_id = orderbook.create_market("BTC".to_string(), "USD".to_string()).unwrap();
        
        let (trades, book_state) = orderbook.create_sell(market_id.clone(), dec!(50000), dec!(1)).await.unwrap();
        
        assert!(trades.is_empty()); // No matching buy orders
        assert_eq!(book_state.sell_orders.len(), 1);
        assert_eq!(book_state.sell_orders[0], (dec!(50000), dec!(1)));
    }

    #[tokio::test]
    async fn test_order_matching() {
        let orderbook = Orderbook::new();
        let market_id = orderbook.create_market("BTC".to_string(), "USD".to_string()).unwrap();
        
        // Create a buy order
        let (trades, _) = orderbook.create_buy(market_id.clone(), dec!(50000), dec!(1)).await.unwrap();
        assert!(trades.is_empty());
        
        // Create a matching sell order
        let (trades, book_state) = orderbook.create_sell(market_id.clone(), dec!(50000), dec!(0.5)).await.unwrap();
        assert_eq!(trades.len(), 1);
        assert_eq!(trades[0].amount, dec!(0.5));
        assert_eq!(trades[0].price, dec!(50000));
        
        // Check remaining buy order
        assert_eq!(book_state.buy_orders.len(), 1);
        assert_eq!(book_state.buy_orders[0], (dec!(50000), dec!(0.5)));
        assert_eq!(book_state.sell_orders.len(), 0);
    }

    #[tokio::test]
    async fn test_top_of_book() {
        let orderbook = Orderbook::new();
        let market_id = orderbook.create_market("BTC".to_string(), "USD".to_string()).unwrap();
        
        // Create orders
        orderbook.create_buy(market_id.clone(), dec!(49000), dec!(1)).await.unwrap();
        orderbook.create_buy(market_id.clone(), dec!(50000), dec!(1)).await.unwrap();
        orderbook.create_sell(market_id.clone(), dec!(51000), dec!(1)).await.unwrap();
        orderbook.create_sell(market_id.clone(), dec!(52000), dec!(1)).await.unwrap();
        
        let top_of_book = orderbook.get_top_of_book(&market_id).await.unwrap();
        assert_eq!(top_of_book.highest_buy, Some(dec!(50000)));
        assert_eq!(top_of_book.lowest_sell, Some(dec!(51000)));
    }

    #[tokio::test]
    async fn test_invalid_amount() {
        let orderbook = Orderbook::new();
        let market_id = orderbook.create_market("BTC".to_string(), "USD".to_string()).unwrap();
        
        let result = orderbook.create_buy(market_id.clone(), dec!(50000), dec!(0)).await;
        assert!(result.is_err());
        
        let result = orderbook.create_sell(market_id.clone(), dec!(50000), dec!(-1)).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_nonexistent_market() {
        let orderbook = Orderbook::new();
        
        let result = orderbook.create_buy("NONEXISTENT".to_string(), dec!(50000), dec!(1)).await;
        assert!(result.is_err());
    }
}