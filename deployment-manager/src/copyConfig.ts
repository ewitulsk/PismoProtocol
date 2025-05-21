import fs from 'fs/promises';
import path from 'path';
import TOML from '@iarna/toml';

interface DeploymentInfo {
  packageId: string;
  globalObjectId: string;
  programObjectId: string;
  initializationCheckpoint: string;
  network: 'testnet' | 'mainnet' | string; // Allow other network names too
  btc_tcap?: string;
  eth_tcap?: string;
  sui_tcap?: string;
  usdc_tcap?: string;
  tsla_tcap?: string;
  nvda_tcap?: string;
  cmg_tcap?: string;
}

const deploymentInfoPath = path.resolve(__dirname, '../initialized_deployment.json');
const backendConfigPath = path.resolve(__dirname, '../../backend/config/backend_config.json');
const frontendConfigPath = path.resolve(__dirname, '../../frontend/config.toml');
// Assuming indexer config filename might change based on network, but for now updates testnet.toml
// TODO: Potentially adjust logic if indexer needs dynamic filename (e.g., mainnet.toml)
const indexerConfigPath = path.resolve(__dirname, '../../indexer/config/testnet.toml');
const liquidationServiceConfigPath = path.resolve(__dirname, '../../liquidation_transfer_service/config/config.toml');

// URL templates - add more networks if needed
const urlTemplates = {
  suiExplorerBase: 'https://suiscan.xyz/{network}/tx/',
  suiApi: 'https://fullnode.{network}.sui.io:443',
  suiCheckpoints: 'https://checkpoints.{network}.sui.io',
};

function formatUrl(template: string, network: string): string {
  // Simple replacement, handle edge cases like 'devnet' if necessary
  return template.replace('{network}', network);
}

async function updateBackendConfig(info: DeploymentInfo) {
  try {
    const backendConfigFile = await fs.readFile(backendConfigPath, 'utf-8');
    const backendConfig = JSON.parse(backendConfigFile);

    backendConfig.contract_address = info.packageId;
    backendConfig.contract_global = info.globalObjectId;
    backendConfig.program_id = info.programObjectId; // Assuming this maps to programObjectId
    backendConfig.sui_api_url = formatUrl(urlTemplates.suiApi, info.network);

    await fs.writeFile(backendConfigPath, JSON.stringify(backendConfig, null, 2));
    console.log(`Successfully updated ${path.basename(backendConfigPath)}`);
  } catch (error) {
    console.error(`Error updating ${path.basename(backendConfigPath)}:`, error);
  }
}

async function updateFrontendConfig(info: DeploymentInfo) {
  try {
    const suiExplorerUrl = formatUrl(urlTemplates.suiExplorerBase, info.network);
    let configContent = {};

    try {
      const configFile = await fs.readFile(frontendConfigPath, 'utf-8');
      configContent = TOML.parse(configFile);
    } catch (error: any) {
      // If the file doesn't exist or is invalid TOML, start with an empty object
      // but log a warning if it's not a "file not found" error.
      if (error.code !== 'ENOENT') {
        console.warn(`Warning: Could not read or parse existing ${path.basename(frontendConfigPath)}. A new one will be created. Error: ${error.message}`);
      }
      // Initialize with default structure if needed, or let it be created with new values.
    }

    const updatedConfig = {
      ...configContent, // Preserve existing values
      NEXT_PUBLIC_SUI_PACKAGE_ID: info.packageId,
      NEXT_PUBLIC_SUI_GLOBAL_OBJECT_ID: info.globalObjectId,
      NEXT_PUBLIC_SUI_PROGRAM_OBJECT_ID: info.programObjectId,
      NEXT_PUBLIC_SUI_EXPLORER_BASE_URL: suiExplorerUrl,
      // Other NEXT_PUBLIC_ variables from the original .env logic can be added here if they
      // are also meant to be sourced from deploymentInfo and are present in config.toml.
      // For now, we only update those explicitly mentioned.
    };

    // Add tcap values if they exist
    if (info.btc_tcap) (updatedConfig as any).NEXT_PUBLIC_BTC_TCAP = info.btc_tcap;
    if (info.eth_tcap) (updatedConfig as any).NEXT_PUBLIC_ETH_TCAP = info.eth_tcap;
    if (info.sui_tcap) (updatedConfig as any).NEXT_PUBLIC_SUI_TCAP = info.sui_tcap;
    if (info.usdc_tcap) (updatedConfig as any).NEXT_PUBLIC_USDC_TCAP = info.usdc_tcap;
    if (info.tsla_tcap) (updatedConfig as any).NEXT_PUBLIC_TSLA_TCAP = info.tsla_tcap;
    if (info.nvda_tcap) (updatedConfig as any).NEXT_PUBLIC_NVDA_TCAP = info.nvda_tcap;
    if (info.cmg_tcap) (updatedConfig as any).NEXT_PUBLIC_CMG_TCAP = info.cmg_tcap;

    await fs.writeFile(frontendConfigPath, TOML.stringify(updatedConfig as TOML.JsonMap));
    console.log(`Successfully updated ${path.basename(frontendConfigPath)}`);
  } catch (error) {
    console.error(`Error updating ${path.basename(frontendConfigPath)}:`, error);
  }
}

async function updateIndexerConfig(info: DeploymentInfo) {
  try {
    const indexerConfigFile = await fs.readFile(indexerConfigPath, 'utf-8');
    const indexerConfig = TOML.parse(indexerConfigFile) as any; // Use 'any' for simplicity

    indexerConfig.package_id = info.packageId;
    indexerConfig.remote_store_url = formatUrl(urlTemplates.suiCheckpoints, info.network);
    indexerConfig.start_checkpoint = parseInt(info.initializationCheckpoint, 10);

    // Note: This updates the existing testnet.toml. If the network changes,
    // manual adjustment or more complex logic might be needed for the filename
    // and potentially the start_checkpoint.

    await fs.writeFile(indexerConfigPath, TOML.stringify(indexerConfig));
    console.log(`Successfully updated ${path.basename(indexerConfigPath)}`);
  } catch (error) {
    console.error(`Error updating ${path.basename(indexerConfigPath)}:`, error);
  }
}

async function updateLiquidationServiceConfig(info: DeploymentInfo) {
  try {
    const suiApiUrl = formatUrl(urlTemplates.suiApi, info.network);
    let configContent: TOML.JsonMap = {};

    try {
      const configFile = await fs.readFile(liquidationServiceConfigPath, 'utf-8');
      configContent = TOML.parse(configFile) as TOML.JsonMap;
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.warn(`Warning: Could not read or parse existing ${path.basename(liquidationServiceConfigPath)}. A new one will be created. Error: ${error.message}`);
      }
      // Initialize with a default structure or let it be created by new values.
      // For safety, ensure necessary keys are present if creating new or overwriting significantly.
      configContent = {
        PACKAGE_ID: '', // Placeholder, will be overwritten
        SUI_RPC_URL: '', // Placeholder, will be overwritten
        LIQUIDATION_SERVICE_PORT: '3000', // Default, can be preserved or updated if needed
        // Add other expected keys with defaults if the file might be missing them
      };
    }

    const updatedConfig = {
      ...configContent, // Preserve existing values not explicitly updated
      PACKAGE_ID: info.packageId,
      SUI_RPC_URL: suiApiUrl,
      // LIQUIDATION_SERVICE_PORT is managed by the service itself or can be set here if desired.
      // If it has a default in the toml, we can choose to preserve it or override.
      // For now, we only update PACKAGE_ID and SUI_RPC_URL.
    };

    await fs.writeFile(liquidationServiceConfigPath, TOML.stringify(updatedConfig));
    console.log(`Successfully updated ${path.basename(liquidationServiceConfigPath)}`);
  } catch (error) {
    console.error(`Error updating ${path.basename(liquidationServiceConfigPath)}:`, error);
  }
}

async function main() {
  console.log('Starting configuration copy process...');
  try {
    const deploymentInfoFile = await fs.readFile(deploymentInfoPath, 'utf-8');
    const deploymentInfo: DeploymentInfo = JSON.parse(deploymentInfoFile);

    console.log(`Read deployment info for network: ${deploymentInfo.network}`);
    console.log(`  Package ID: ${deploymentInfo.packageId}`);

    await Promise.all([
      updateBackendConfig(deploymentInfo),
      updateFrontendConfig(deploymentInfo),
      updateIndexerConfig(deploymentInfo),
      updateLiquidationServiceConfig(deploymentInfo),
    ]);

    console.log('Configuration copy process finished.');

  } catch (error) {
    console.error('Failed to read deployment info or run update process:', error);
    process.exit(1);
  }
}

main(); 