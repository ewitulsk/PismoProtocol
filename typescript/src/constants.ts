/**
 * Constants used throughout the application
 */

// Sui Package and Program IDs
export const SUI_PACKAGE_ID = "0xaf05e950da30954a3c13a93d122390ecf8db1d26ff1de9ab6ada403f78bc84b4";
export const SUI_PROGRAM_ID = ""; // This will change after every deployment.

// Object IDs
export const GLOBAL_OBJECT_ID = "0xf1905820b04efdc3b4284482304bb5091567359a91ae72402a1d038a6d36ab54"; // Replace with actual Global object ID

// Network configuration
export const NETWORK = "testnet"; // Options: "testnet", "mainnet", "devnet", "localnet"

// Other constants can be added here as needed
export const DEFAULT_GAS_BUDGET = 10000000; // Default gas budget for transactions

// LP token types
export const LP_TOKEN_TYPES = {
  TEST_LP: `${SUI_PACKAGE_ID}::lp_token::LP_TOKEN`,
  BTC_LP: `${SUI_PACKAGE_ID}::lp_token::LP_TOKEN`
};

// Coin types
export const COIN_TYPES = {
  TEST_COIN: `${SUI_PACKAGE_ID}::test_coin::TEST_COIN`,
  BTC: `${SUI_PACKAGE_ID}::test_coin::TEST_COIN`
};

// Price feed IDs
export const PRICE_FEED_IDS = {
  TEST_COIN: "23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744",
  BTC: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43"
};

// Vault Ids
export const VAULt_IDS = {
  BTC: "0x815436a2eac2aa5e7dcb93c8c61df0c21c19afb9569f5f2128d85773525510bd"
}

// Object types
export const OBJECT_TYPES = {
  ADMIN_CAP: `${SUI_PACKAGE_ID}::main::AdminCap`,
  GLOBAL: `${SUI_PACKAGE_ID}::lp::Global`,
  ACCOUNT: `${SUI_PACKAGE_ID}::accounts::Account`
}; 