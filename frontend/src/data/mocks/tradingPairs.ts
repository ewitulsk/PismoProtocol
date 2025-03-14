export interface TradingPair {
  id: string;
  baseAsset: string;
  quoteAsset: string;
  displayName: string;
  price: number;
  change24h: number;
  volume24h: number;
  icon: string;
}

export const tradingPairs: TradingPair[] = [
  {
    id: "eth-usd",
    baseAsset: "ETH",
    quoteAsset: "USD",
    displayName: "ETH-USD",
    price: 3521.45,
    change24h: 2.35,
    volume24h: 1250000000,
    icon: "/images/crypto/eth.svg"
  },
  {
    id: "btc-usd",
    baseAsset: "BTC",
    quoteAsset: "USD",
    displayName: "BTC-USD",
    price: 62145.78,
    change24h: 1.05,
    volume24h: 3450000000,
    icon: "/images/crypto/btc.svg"
  },
  {
    id: "sol-usd",
    baseAsset: "SOL",
    quoteAsset: "USD",
    displayName: "SOL-USD",
    price: 153.22,
    change24h: 4.87,
    volume24h: 950000000,
    icon: "/images/crypto/sol.svg"
  },
  {
    id: "avax-usd",
    baseAsset: "AVAX",
    quoteAsset: "USD",
    displayName: "AVAX-USD",
    price: 34.56,
    change24h: -1.23,
    volume24h: 345000000,
    icon: "/images/crypto/avax.svg"
  },
  {
    id: "link-usd",
    baseAsset: "LINK",
    quoteAsset: "USD",
    displayName: "LINK-USD",
    price: 18.79,
    change24h: 3.41,
    volume24h: 198000000,
    icon: "/images/crypto/link.svg"
  },
  {
    id: "doge-usd",
    baseAsset: "DOGE",
    quoteAsset: "USD",
    displayName: "DOGE-USD",
    price: 0.1234,
    change24h: 8.75,
    volume24h: 876000000,
    icon: "/images/crypto/doge.svg"
  },
  {
    id: "matic-usd",
    baseAsset: "MATIC",
    quoteAsset: "USD",
    displayName: "MATIC-USD",
    price: 0.87,
    change24h: -2.34,
    volume24h: 432000000,
    icon: "/images/crypto/matic.svg"
  },
  {
    id: "uni-usd",
    baseAsset: "UNI",
    quoteAsset: "USD",
    displayName: "UNI-USD",
    price: 11.23,
    change24h: 1.89,
    volume24h: 276000000,
    icon: "/images/crypto/uni.svg"
  }
];