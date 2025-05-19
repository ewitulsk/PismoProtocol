// frontend/src/types/index.ts

// Data structure for vault assets fetched from the indexer
// Originally from /v0/vaults endpoint (see indexer/src/db/models/vault_created_events.rs)
// Also used in closePosition.ts
export interface VaultAssetData {
  vault_address: string; // Object ID of the Vault struct
  vault_marker_address: string; // Object ID of the VaultMarker struct (this is what we pass to the contract)
  coin_token_info: string; // Full token type string for the vault's underlying asset, e.g., "0x2::sui::SUI"
}

// Existing PositionData from old types.ts, including it here for consolidation if desired
// Or it can remain in a separate file if that's preferred.
export interface PositionData {
  position_id: string;
  account_id: string;
  account_stats_id: string;
  supported_positions_token_i: number;
  position_type: "Long" | "Short";
  amount: string; // u256 as string
  entry_price: string; // u256 as string
  entry_price_decimals: number; // u8
  leverage_multiplier: string; // u16 as string 
  timestamp_ms: string; // u64 as string
  price_feed_id_bytes: string; // Hex string (potentially 0x prefixed or not from indexer)
} 