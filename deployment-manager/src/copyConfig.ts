import fs from 'fs/promises';
import path from 'path';
import { Command } from 'commander';
import TOML from '@iarna/toml';

// --- Interface Definitions ---

interface PerpsDeploymentInfo {
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

interface OracleBuilderDeploymentInfo {
  packageId: string;
  adminCapId: string;
  initializationCheckpoint: string;
  network: 'testnet' | 'mainnet' | string;
}

// --- Configuration Paths ---

const perpsDeploymentInfoPath = path.resolve(__dirname, '../initialized_deployment.json');
const oracleBuilderDeploymentInfoPath = path.resolve(__dirname, '../initialized_oracle_builder_deployment.json');

// Perps Protocol Config Paths
const backendConfigPath = path.resolve(__dirname, '../../backend/config/backend_config.json');
const frontendConfigPath = path.resolve(__dirname, '../../frontend/config.toml');
const indexerConfigPath = path.resolve(__dirname, '../../indexer/config/testnet.toml');
const liquidationServiceConfigPath = path.resolve(__dirname, '../../liquidation_transfer_service/config/config.toml');

// Oracle Builder Config Paths
const oracleBuilderIndexerConfigPath = path.resolve(__dirname, '../../oracle_builder_indexer/config/testnet.toml');

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

// --- Perps Protocol Configuration Updates ---

async function updateBackendConfig(info: PerpsDeploymentInfo) {
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

async function updateFrontendConfig(info: PerpsDeploymentInfo) {
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

async function updateIndexerConfig(info: PerpsDeploymentInfo) {
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

async function updateLiquidationServiceConfig(info: PerpsDeploymentInfo) {
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

// --- Oracle Builder Configuration Updates ---

async function updateFrontendConfigForOracleBuilder(info: OracleBuilderDeploymentInfo) {
  try {
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
    }

    const updatedConfig = {
      ...configContent, // Preserve existing values
      NEXT_PUBLIC_ORACLE_BUILDER_PACKAGE_ID: info.packageId,
    };

    await fs.writeFile(frontendConfigPath, TOML.stringify(updatedConfig as TOML.JsonMap));
    console.log(`Successfully updated ${path.basename(frontendConfigPath)} with oracle builder package ID`);
  } catch (error) {
    console.error(`Error updating ${path.basename(frontendConfigPath)} for oracle builder:`, error);
  }
}

async function updateOracleBuilderIndexerConfig(info: OracleBuilderDeploymentInfo) {
  try {
    const configFile = await fs.readFile(oracleBuilderIndexerConfigPath, 'utf-8');
    const config = TOML.parse(configFile) as any;

    // Update the indexer section
    if (!config.indexer) {
      config.indexer = {};
    }

    config.indexer.package_id = info.packageId;
    config.indexer.remote_store_url = formatUrl(urlTemplates.suiCheckpoints, info.network);
    config.indexer.start_checkpoint = parseInt(info.initializationCheckpoint, 10);

    // Preserve other existing values like concurrency
    if (!config.indexer.concurrency) {
      config.indexer.concurrency = 5; // Default value
    }

    await fs.writeFile(oracleBuilderIndexerConfigPath, TOML.stringify(config));
    console.log(`Successfully updated ${path.basename(oracleBuilderIndexerConfigPath)}`);
  } catch (error) {
    console.error(`Error updating ${path.basename(oracleBuilderIndexerConfigPath)}:`, error);
  }
}

// --- Main Protocol Functions ---

async function copyPerpsConfig() {
  console.log('Starting perps protocol configuration copy process...');
  try {
    const deploymentInfoFile = await fs.readFile(perpsDeploymentInfoPath, 'utf-8');
    const deploymentInfo: PerpsDeploymentInfo = JSON.parse(deploymentInfoFile);

    console.log(`Read perps deployment info for network: ${deploymentInfo.network}`);
    console.log(`  Package ID: ${deploymentInfo.packageId}`);

    await Promise.all([
      updateBackendConfig(deploymentInfo),
      updateFrontendConfig(deploymentInfo),
      updateIndexerConfig(deploymentInfo),
      updateLiquidationServiceConfig(deploymentInfo),
    ]);

    console.log('Perps protocol configuration copy process finished.');

  } catch (error) {
    console.error('Failed to read perps deployment info or run update process:', error);
    throw error;
  }
}

async function copyOracleBuilderConfig() {
  console.log('Starting oracle builder configuration copy process...');
  try {
    const deploymentInfoFile = await fs.readFile(oracleBuilderDeploymentInfoPath, 'utf-8');
    const deploymentInfo: OracleBuilderDeploymentInfo = JSON.parse(deploymentInfoFile);

    console.log(`Read oracle builder deployment info for network: ${deploymentInfo.network}`);
    console.log(`  Package ID: ${deploymentInfo.packageId}`);

    await Promise.all([
      updateFrontendConfigForOracleBuilder(deploymentInfo),
      updateOracleBuilderIndexerConfig(deploymentInfo),
    ]);

    console.log('Oracle builder configuration copy process finished.');

  } catch (error) {
    console.error('Failed to read oracle builder deployment info or run update process:', error);
    throw error;
  }
}

// --- Main Script Logic ---

async function main() {
  const program = new Command();
  
  program
    .name('copyConfig')
    .description('Copy deployment configuration for PismoSynthetics protocols')
    .version('1.0.0')
    .requiredOption('--protocol <type>', 'Protocol to copy config for: perps or oracle_builder')
    .parse();

  const options = program.opts();
  const protocol = options.protocol;

  if (!['perps', 'oracle_builder'].includes(protocol)) {
    console.error('Error: Protocol must be either "perps" or "oracle_builder"');
    process.exit(1);
  }

  console.log(`Starting configuration copy for ${protocol} protocol...`);

  try {
    if (protocol === 'perps') {
      await copyPerpsConfig();
    } else if (protocol === 'oracle_builder') {
      await copyOracleBuilderConfig();
    }
  } catch (error) {
    console.error(`\n${protocol} configuration copy encountered an error:`, error);
    process.exit(1);
  }
}

main(); 