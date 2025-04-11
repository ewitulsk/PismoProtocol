// Defines the structure of vault data returned by the backend API
export interface VaultData {
  type: string;       // Full type of the vault, e.g., 0x...::lp::Vault<0x...::btc::BTC, 0x...::lp_token::LP_BTC>
  coin: number;       // Amount of the underlying coin held in the vault
  coin_type: string;  // Type of the underlying coin, e.g., 0x...::btc::BTC
  value: number;      // USD value of the coins held in the vault
}
