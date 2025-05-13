import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import TOML from '@iarna/toml';

dotenv.config(); // Load .env from the current directory (liquidation_transfer_service)

// Load TOML config
const configPath = path.resolve(__dirname, '../config/config.toml');
let tomlConfig: TOML.JsonMap = {};
try {
  const configFile = fs.readFileSync(configPath, 'utf-8');
  tomlConfig = TOML.parse(configFile);
} catch (error: any) {
  console.error(`Error reading or parsing TOML config file at ${configPath}: ${error.message}`);
  console.warn('Falling back to environment variables or defaults for TOML-configurable values.');
  // tomlConfig remains {}
}

// Log status of TOML loading for PACKAGE_ID
console.log(`TOML config loading attempt for PACKAGE_ID: Path='${configPath}', FileFound=${fs.existsSync(configPath)}, ParsedTomlPackageId='${tomlConfig.PACKAGE_ID}' (Type: ${typeof tomlConfig.PACKAGE_ID})`);

export const SUI_PRIVATE_KEY = process.env.SUI_PRIVATE_KEY;
export const PACKAGE_ID = (tomlConfig.PACKAGE_ID as string) || process.env.PACKAGE_ID;
export const SUI_RPC_URL = (tomlConfig.SUI_RPC_URL as string) || process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443';
export const LIQUIDATION_SERVICE_PORT = (tomlConfig.LIQUIDATION_SERVICE_PORT as string) || process.env.LIQUIDATION_SERVICE_PORT || '3000';

if (!SUI_PRIVATE_KEY) {
  console.error("Error: SUI_PRIVATE_KEY is not set in .env. Please ensure the .env file exists in the 'liquidation_transfer_service' directory and SUI_PRIVATE_KEY is defined.");
  process.exit(1);
}
if (!PACKAGE_ID) {
  console.error("Error: PACKAGE_ID is not set in .env or config.toml. Please ensure the .env file exists in the 'liquidation_transfer_service' directory or config.toml in 'liquidation_transfer_service/config' and PACKAGE_ID is defined.");
  process.exit(1);
} 