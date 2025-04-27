// Defines the structure of vault data returned by the backend API
export interface VaultData {
  type: string;       // Full type of the vault, e.g., 0x...::lp::Vault<0x...::btc::BTC, 0x...::lp_token::LP_BTC>
  object_id: string;  // The Sui object ID of the vault
  coin: number;       // Amount of the underlying coin held in the vault
  coin_type: string;  // Type of the underlying coin, e.g., 0x...::btc::BTC
  value: number;      // USD value of the coins held in the vault
}

export interface PositionData {
  transaction_hash: string;
  position_id: string;
  position_type: "Long" | "Short";
  amount: string; // Amount is likely a large integer string
  leverage_multiplier: string; // Leverage is a string
  entry_price: string; // Entry price is a string
  entry_price_decimals: number; // Decimals for entry price
  supported_positions_token_i: number; // Index for the token
  price_feed_id_bytes: string;
  account_id: string;
  timestamp: string;
}
