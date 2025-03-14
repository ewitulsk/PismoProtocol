// Mock vault data - will be replaced with API data later

export interface VaultData {
  id: string;
  name: string;
  symbol: string;
  icon: string; // For future implementation with actual icons
  totalValueLocked: {
    amount: number;
    currency: string;
  };
  userDeposit: {
    amount: number;
    currency: string;
  };
  apy: number;
  chartData?: number[]; // For future implementation with real chart data
}

export const vaultsData: VaultData[] = [
  {
    id: "eth-vault",
    name: "Ethereum Vault",
    symbol: "ETH",
    icon: "eth-icon", // Placeholder for future icon
    totalValueLocked: {
      amount: 45230.85,
      currency: "USD"
    },
    userDeposit: {
      amount: 12.45,
      currency: "ETH"
    },
    apy: 4.5,
    chartData: [10, 12, 15, 18, 20, 22, 25, 23, 21, 22, 19, 18]
  },
  {
    id: "btc-vault",
    name: "Bitcoin Vault",
    symbol: "BTC",
    icon: "btc-icon", // Placeholder for future icon
    totalValueLocked: {
      amount: 62540.12,
      currency: "USD"
    },
    userDeposit: {
      amount: 0.75,
      currency: "BTC"
    },
    apy: 3.8,
    chartData: [15, 14, 16, 18, 21, 20, 19, 22, 25, 28, 30, 32]
  },
  {
    id: "usdc-vault",
    name: "USDC Vault",
    symbol: "USDC",
    icon: "usdc-icon", // Placeholder for future icon
    totalValueLocked: {
      amount: 124750.00,
      currency: "USD"
    },
    userDeposit: {
      amount: 5000,
      currency: "USDC"
    },
    apy: 6.2,
    chartData: [30, 32, 34, 33, 35, 36, 38, 40, 41, 40, 42, 44]
  },
  {
    id: "sol-vault",
    name: "Solana Vault",
    symbol: "SOL",
    icon: "sol-icon",
    totalValueLocked: {
      amount: 33450.75,
      currency: "USD"
    },
    userDeposit: {
      amount: 125.5,
      currency: "SOL"
    },
    apy: 5.1,
    chartData: [22, 24, 26, 28, 25, 22, 20, 24, 28, 30, 32, 35]
  },
  {
    id: "avax-vault",
    name: "Avalanche Vault",
    symbol: "AVAX",
    icon: "avax-icon",
    totalValueLocked: {
      amount: 28670.33,
      currency: "USD"
    },
    userDeposit: {
      amount: 210.75,
      currency: "AVAX"
    },
    apy: 7.2,
    chartData: [18, 20, 22, 25, 28, 30, 33, 35, 32, 30, 28, 25]
  },
  {
    id: "dai-vault",
    name: "DAI Vault",
    symbol: "DAI",
    icon: "dai-icon",
    totalValueLocked: {
      amount: 98240.50,
      currency: "USD"
    },
    userDeposit: {
      amount: 7500,
      currency: "DAI"
    },
    apy: 5.8,
    chartData: [25, 27, 29, 30, 32, 34, 36, 38, 37, 36, 35, 33]
  },
  {
    id: "matic-vault",
    name: "Polygon Vault",
    symbol: "MATIC",
    icon: "matic-icon",
    totalValueLocked: {
      amount: 19850.25,
      currency: "USD"
    },
    userDeposit: {
      amount: 4200,
      currency: "MATIC"
    },
    apy: 8.5,
    chartData: [15, 18, 20, 22, 25, 28, 30, 32, 35, 38, 40, 42]
  },
  {
    id: "link-vault",
    name: "Chainlink Vault",
    symbol: "LINK",
    icon: "link-icon",
    totalValueLocked: {
      amount: 15320.45,
      currency: "USD"
    },
    userDeposit: {
      amount: 630,
      currency: "LINK"
    },
    apy: 6.9,
    chartData: [20, 22, 24, 26, 28, 30, 32, 31, 30, 28, 26, 25]
  }
];

// Helper function to calculate total TVL across all vaults
export const calculateTotalTVL = (): number => {
  return vaultsData.reduce((acc, vault) => acc + vault.totalValueLocked.amount, 0);
};