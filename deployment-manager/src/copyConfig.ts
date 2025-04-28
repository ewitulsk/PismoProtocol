import fs from 'fs/promises';
import path from 'path';
import TOML from '@iarna/toml';

interface DeploymentInfo {
  packageId: string;
  globalObjectId: string;
  programObjectId: string;
  initializationCheckpoint: string;
  network: 'testnet' | 'mainnet' | string; // Allow other network names too
}

const deploymentInfoPath = path.resolve(__dirname, '../initialized_deployment.json');
const backendConfigPath = path.resolve(__dirname, '../../backend/config/backend_config.json');
const frontendEnvPath = path.resolve(__dirname, '../../frontend/.env');
// Assuming indexer config filename might change based on network, but for now updates testnet.toml
// TODO: Potentially adjust logic if indexer needs dynamic filename (e.g., mainnet.toml)
const indexerConfigPath = path.resolve(__dirname, '../../indexer/config/testnet.toml');

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

async function updateFrontendEnv(info: DeploymentInfo) {
  try {
    const frontendEnvFile = await fs.readFile(frontendEnvPath, 'utf-8');
    const lines = frontendEnvFile.split('\n');
    const newLines: string[] = [];

    const suiExplorerUrl = formatUrl(urlTemplates.suiExplorerBase, info.network);

    const replacements: Record<string, string> = {
      NEXT_PUBLIC_SUI_PACKAGE_ID: info.packageId,
      NEXT_PUBLIC_SUI_GLOBAL_OBJECT_ID: info.globalObjectId,
      NEXT_PUBLIC_SUI_PROGRAM_OBJECT_ID: info.programObjectId,
      NEXT_PUBLIC_SUI_EXPLORER_BASE_URL: suiExplorerUrl,
      // Keep other variables like NEXT_PUBLIC_PRICE_FEED_AGGREGATOR_URL, NEXT_PUBLIC_BACKEND_API_URL, NEXT_PUBLIC_INDEXER_URL
    };

    for (const line of lines) {
      if (line.trim() === '' || line.startsWith('#')) {
        newLines.push(line);
        continue;
      }
      const [key] = line.split('=');
      if (key in replacements) {
        newLines.push(`${key}=${replacements[key]}`);
      } else {
        newLines.push(line); // Keep existing line if not targeted for replacement
      }
    }

    await fs.writeFile(frontendEnvPath, newLines.join('\n'));
    console.log(`Successfully updated ${path.basename(frontendEnvPath)}`);
  } catch (error) {
    console.error(`Error updating ${path.basename(frontendEnvPath)}:`, error);
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

async function main() {
  console.log('Starting configuration copy process...');
  try {
    const deploymentInfoFile = await fs.readFile(deploymentInfoPath, 'utf-8');
    const deploymentInfo: DeploymentInfo = JSON.parse(deploymentInfoFile);

    console.log(`Read deployment info for network: ${deploymentInfo.network}`);
    console.log(`  Package ID: ${deploymentInfo.packageId}`);

    await Promise.all([
      updateBackendConfig(deploymentInfo),
      updateFrontendEnv(deploymentInfo),
      updateIndexerConfig(deploymentInfo),
    ]);

    console.log('Configuration copy process finished.');

  } catch (error) {
    console.error('Failed to read deployment info or run update process:', error);
    process.exit(1);
  }
}

main(); 