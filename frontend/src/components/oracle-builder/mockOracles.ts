// Centralized mock data for oracles and price feeds
export interface PriceFeed {
  id: string;
  name: string;
  feedId: string;
  underlyingUrl: string;
  responseField: string;
  liveUrl: string;
  isProtected?: boolean;
}

export interface Oracle {
  id: string;
  name: string;
  description?: string;
  type: string;
  status: string;
  createdBy: string;
  usageFee: string;
  trustedBy: string;
  priceFeeds: PriceFeed[];
}

export const mockOracles: Oracle[] = [
  {
    id: "eth_usd_001",
    name: "ETH/USD Price Oracle",
    description: "Tracks ETH/USD price from multiple sources.",
    type: "Price Feed",
    status: "Live",
    createdBy: "0x742d...4f2a",
    usageFee: "0.001 ETH per query",
    trustedBy: "1,247 contracts",
    priceFeeds: [
      {
        id: "coinbase_eth_usd",
        name: "Coinbase ETH/USD",
        feedId: "coinbase_eth_usd",
        underlyingUrl: "https://api.coinbase.com/v2/exchange-rates",
        responseField: "data.rates.USD",
        liveUrl: "https://oracle.example.com/eth-usd",
        isProtected: true,
      },
      {
        id: "binance_eth_usd",
        name: "Binance ETH/USD",
        feedId: "binance_eth_usd",
        underlyingUrl: "https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT",
        responseField: "price",
        liveUrl: "https://oracle.example.com/eth-usd-binance",
        isProtected: true,
      },
      {
        id: "kraken_eth_usd",
        name: "Kraken ETH/USD",
        feedId: "kraken_eth_usd",
        underlyingUrl: "https://api.kraken.com/0/public/Ticker?pair=ETHUSD",
        responseField: "result.XETHZUSD.c[0]",
        liveUrl: "https://oracle.example.com/eth-usd-kraken",
      },
    ],
  },
  {
    id: "btc_usd_001",
    name: "BTC/USD Price Oracle",
    description: "Tracks BTC/USD price from multiple sources.",
    type: "Price Feed",
    status: "Live",
    createdBy: "0x1234...abcd",
    usageFee: "0.001 BTC per query",
    trustedBy: "1,000 contracts",
    priceFeeds: [
      {
        id: "coinbase_btc_usd",
        name: "Coinbase BTC/USD",
        feedId: "coinbase_btc_usd",
        underlyingUrl: "https://api.coinbase.com/v2/exchange-rates",
        responseField: "data.rates.USD",
        liveUrl: "https://oracle.example.com/btc-usd",
        isProtected: true,
      },
      {
        id: "binance_btc_usd",
        name: "Binance BTC/USD",
        feedId: "binance_btc_usd",
        underlyingUrl: "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",
        responseField: "price",
        liveUrl: "https://oracle.example.com/btc-usd-binance",
      },
    ],
  },
  {
    id: "weather_001",
    name: "Weather Data Oracle",
    description: "Provides weather data from OpenWeatherMap.",
    type: "External API",
    status: "Inactive",
    createdBy: "0x5678...efgh",
    usageFee: "0.01 ETH per query",
    trustedBy: "500 contracts",
    priceFeeds: [
      {
        id: "openweather",
        name: "OpenWeatherMap",
        feedId: "openweather",
        underlyingUrl: "https://api.openweathermap.org/data/2.5/weather",
        responseField: "main.temp",
        liveUrl: "https://oracle.example.com/weather-openweather",
      },
    ],
  },
  {
    id: "sports_001",
    name: "Sports Results Oracle",
    description: "Delivers NBA results from ESPN.",
    type: "Event Data",
    status: "Live",
    createdBy: "0x9abc...def0",
    usageFee: "0.005 ETH per query",
    trustedBy: "300 contracts",
    priceFeeds: [
      {
        id: "espn_nba",
        name: "ESPN NBA Results",
        feedId: "espn_nba",
        underlyingUrl: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
        responseField: "events",
        liveUrl: "https://oracle.example.com/sports-espn-nba",
      },
    ],
  },
];
