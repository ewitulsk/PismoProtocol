export interface BookState {
  market_id: string;
  buy_orders: [string, string][]; // [price, amount]
  sell_orders: [string, string][]; // [price, amount]
}

export interface TopOfBook {
  market_id: string;
  highest_buy?: string;
  lowest_sell?: string;
}

export interface Trade {
  id: string;
  market_id: string;
  price: string;
  amount: string;
  buy_order_id: string;
  sell_order_id: string;
  timestamp: number;
}

export interface ServerMessage {
  type: 'BookStateUpdate' | 'TopOfBookUpdate' | 'MarketCreated' | 'OrderCreated' | 'Error';
  market_id?: string;
  book_state?: BookState;
  top_of_book?: TopOfBook;
  trades?: Trade[];
  message?: string;
}

export interface ClientMessage {
  type: 'Subscribe' | 'Unsubscribe' | 'CreateMarket' | 'CreateBuy' | 'CreateSell';
  subscription_type?: 'BookState' | 'TopOfBook';
  market_id?: string;
  asset?: string;
  buy_currency?: string;
  price?: string;
  amount?: string;
}

export interface OrderbookEntry {
  price: number;
  amount: number;
  total: number;
  percentage: number;
}