import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import {
  SuiClient,
  getFullnodeUrl,
  SuiObjectDataOptions,
} from '@mysten/sui/client';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';

// Load environment variables from .env file
dotenv.config();

// --- Configuration ---
const DEPLOYMENT_JSON_PATH = path.resolve(__dirname, '../../contracts/deployment.json');
const OUTPUT_JSON_PATH = path.resolve(__dirname, '../initialized_deployment.json');
const SUI_NETWORK: 'mainnet' | 'testnet' | 'devnet' | 'localnet' = 'testnet'; // Or dynamically set via ENV
const MINT_AMOUNT = 10000000000n; // 10,000 (assuming 6 decimals, adjust if needed)
const RECIPIENT_ADDRESS = () => getSigner().toSuiAddress(); // Mint to self initially

// Placeholders - Adjust these based on your actual setup or configuration source
const PLACEHOLDER_PRICE_FEED_ID_HEX = 'f9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b'; // 32 bytes = 64 hex chars
const PLACEHOLDER_ORACLE_FEED_ID = 0; // 0 for Pyth
const PLACEHOLDER_SHARED_PRICE_DECIMALS = 6; // Example shared decimals
const PLACEHOLDER_MAX_LEVERAGE = 100; // Example leverage

// --- Helper Functions ---

function hexToBytes(hex: string): Uint8Array {
  const hexString = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (hexString.length % 2 !== 0) {
    throw new Error('Hex string must have an even number of digits');
  }
  const bytes = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < hexString.length; i += 2) {
    bytes[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
  }
  return bytes;
}

function getSigner(): Ed25519Keypair {
    const privateKeyString = process.env.SUI_PRIVATE_KEY;
    if (!privateKeyString) {
        throw new Error('SUI_PRIVATE_KEY environment variable not set.');
    }

    try {
        // decodeSuiPrivateKey handles the 'suiprivkey' prefix and Base64 decoding
        const decoded = decodeSuiPrivateKey(privateKeyString);
        // Create the keypair from the decoded secret key bytes
        return Ed25519Keypair.fromSecretKey(decoded.secretKey);
    } catch (error) {
        console.error("Failed to decode SUI_PRIVATE_KEY. Ensure it's a valid Sui private key string (Base64, potentially with 'suiprivkey' prefix).");
        throw error;
    }
}

function findObjectChange(objectChanges: any[], type: 'published' | 'created' | 'mutated', predicate: (change: any) => boolean): any | null {
    return objectChanges.find(change => change.type === type && predicate(change)) || null;
}

function findCreatedObjectIdByTypePrefix(objectChanges: any[], typePrefix: string): string | null {
    const change = findObjectChange(objectChanges, 'created', (c) => c.objectType?.startsWith(typePrefix));
    return change?.objectId || null;
}

function findTreasuryCap(objectChanges: any[], coinType: string): string | null {
    const capType = `0x2::coin::TreasuryCap<${coinType}>`;
    const change = findObjectChange(objectChanges, 'created', (c) => c.objectType === capType);
    return change?.objectId || null;
}

async function findCoinMetadata(
    client: SuiClient,
    objectChanges: any[],
    coinType: string
): Promise<{ id: string; decimals: number } | null> {
    const metadataType = `0x2::coin::CoinMetadata<${coinType}>`;
    const change = findObjectChange(objectChanges, 'created', (c) => c.objectType === metadataType);

    if (!change || !change.objectId) {
        console.warn(`Could not find CoinMetadata object for ${coinType} in deployment changes.`);
        return null;
    }

    const metadataObjectId = change.objectId;

    try {
        // **** ADD DELAY HERE ****
        const WAIT_MS = 5000; // Wait for 2 seconds for metadata object
        console.log(`  Waiting ${WAIT_MS / 1000} seconds for metadata object ${metadataObjectId} to be indexed...`);
        await sleep(WAIT_MS);
        // *************************

        // Define options to fetch content
        const options: SuiObjectDataOptions = { showContent: true };
        const metadataObject = await client.getObject({
            id: metadataObjectId,
            options: options,
        });

        // Type guards and checks
        if (metadataObject.error) {
            // Updated error handling based on SDK structure
            let errorDetails = `Code: ${metadataObject.error.code}`; 
            if ('object_id' in metadataObject.error) {
                errorDetails += `, ObjectId: ${metadataObject.error.object_id}`;
            }
            if ('error' in metadataObject.error && typeof metadataObject.error.error === 'string') {
                errorDetails += `, Details: ${metadataObject.error.error}`;
            }
            console.warn(`Error fetching object ${metadataObjectId}: ${errorDetails}`);
            return null;
        }
        if (!metadataObject.data) {
             console.warn(`No data found for CoinMetadata object ${metadataObjectId}`);
             return null;
        }
         if (metadataObject.data.content?.dataType !== 'moveObject') {
             console.warn(`Fetched object ${metadataObjectId} is not a Move object.`);
             return null;
        }

        // Ensure the type matches what we expect (handle potential package ID variations)
        const expectedTypeSuffix = `::coin::CoinMetadata<${coinType}>`;
         if (!metadataObject.data.content.type.endsWith(expectedTypeSuffix)) {
             console.warn(`Fetched object ${metadataObjectId} type mismatch. Expected suffix ${expectedTypeSuffix}, got ${metadataObject.data.content.type}`);
             return null;
        }

        // Access fields safely
        const fields = metadataObject.data.content.fields as { decimals?: number; [key: string]: any };
        const decimals = fields?.decimals;

        if (typeof decimals !== 'number') {
            console.warn(`Could not extract 'decimals' (number) field from CoinMetadata object ${metadataObjectId}. Found:`, decimals);
            return null;
        }

        return { id: metadataObjectId, decimals: decimals };

    } catch (error) {
        console.error(`Error fetching or processing CoinMetadata object ${metadataObjectId}:`, error);
        return null; // Or rethrow if this should be a fatal error
    }
}

// Add a simple sleep function
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Define a default gas budget (adjust as needed)
const DEFAULT_GAS_BUDGET = 100000000; // Example: 0.1 SUI 


// --- Main Script Logic ---

async function main() {
    console.log('Starting deployment manager script...');

    // 1. Initialize Sui Client & Signer
    const signer = getSigner();
    const client = new SuiClient({ url: getFullnodeUrl(SUI_NETWORK) });
    const signerAddress = signer.toSuiAddress();
    console.log(`Using network: ${SUI_NETWORK}`);
    console.log(`Signer address: ${signerAddress}`);

    // 2. Read and Parse Deployment Data
    console.log(`Reading deployment data from ${DEPLOYMENT_JSON_PATH}...`);
    let deploymentData: any;
    try {
        const fileContent = fs.readFileSync(DEPLOYMENT_JSON_PATH, 'utf-8');
        deploymentData = JSON.parse(fileContent);
    } catch (error) {
        console.error(`Failed to read or parse ${DEPLOYMENT_JSON_PATH}:`, error);
        process.exit(1);
    }

    const objectChanges = deploymentData.objectChanges || [];

    // 3. Extract Key Information
    const publishedChange = findObjectChange(objectChanges, 'published', () => true);
    const packageId = publishedChange?.packageId;
    if (!packageId) throw new Error('Could not find published package ID in deployment data.');

    const globalObjectId = findCreatedObjectIdByTypePrefix(objectChanges, `${packageId}::main::Global`);
    if (!globalObjectId) throw new Error('Could not find Global object ID in deployment data.');

    const adminCapId = findCreatedObjectIdByTypePrefix(objectChanges, `${packageId}::main::AdminCap`);
    if (!adminCapId) throw new Error('Could not find AdminCap object ID in deployment data.');

    const testCoinType = `${packageId}::test_coin::TEST_COIN`;
    const testLpType = `${packageId}::test_lp::TEST_LP`;

    const testCoinTreasuryCapId = findTreasuryCap(objectChanges, testCoinType);
    if (!testCoinTreasuryCapId) throw new Error(`Could not find TreasuryCap for ${testCoinType}.`);

    const testCoinMetadata = await findCoinMetadata(client, objectChanges, testCoinType);
    if (!testCoinMetadata) throw new Error(`Could not find or fetch CoinMetadata details for ${testCoinType}. Check logs for details.`);
    const testCoinDecimals = testCoinMetadata.decimals;

    console.log(`Extracted Info:
      Package ID: ${packageId}
      Global Object ID: ${globalObjectId}
      Admin Cap ID: ${adminCapId}
      Test Coin Type: ${testCoinType}
      Test Coin Treasury Cap ID: ${testCoinTreasuryCapId}
      Test Coin Decimals: ${testCoinDecimals}
      Test LP Type: ${testLpType}
    `);


    // --- Build Single Programmable Transaction Block ---
    console.log('\nBuilding Programmable Transaction Block...');
    const txb = new Transaction();

    // Step 1: Mint Test Coin
    console.log(`  Adding Mint operation...`);
    txb.moveCall({
        target: `${packageId}::test_coin::mint`,
        arguments: [
            txb.object(testCoinTreasuryCapId),
            txb.pure(bcs.u64().serialize(MINT_AMOUNT).toBytes()),
            txb.pure.address(RECIPIENT_ADDRESS()),
        ],
    });

    // Step 2: Add Supported LP (Using TEST_COIN as the first LP)
     console.log(`  Adding Add Supported LP operation...`);
    const priceFeedBytes = hexToBytes(PLACEHOLDER_PRICE_FEED_ID_HEX);
    txb.moveCall({
        target: `${packageId}::main::add_supported_lp`,
        arguments: [
            txb.object(adminCapId),
            txb.object(globalObjectId),
            txb.pure.string(testCoinType),
            txb.pure.u8(testCoinDecimals),
            txb.pure(bcs.vector(bcs.u8()).serialize(priceFeedBytes).toBytes()),
            txb.pure.u16(PLACEHOLDER_ORACLE_FEED_ID),
        ],
    });

    // Step 3: Initialize Vault (For TEST_COIN and TEST_LP)
    console.log(`  Adding Initialize LP Vault operation...`);
    const vaultIndex = 0; // First LP added has index 0
    txb.moveCall({
        target: `${packageId}::lp::init_lp_vault`,
        typeArguments: [testCoinType, testLpType],
        arguments: [
            txb.object(adminCapId),
            txb.object(globalObjectId),
            txb.pure.u64(vaultIndex),
        ],
    });

    // Step 4: Initialize Program
    console.log(`  Adding Initialize Program operation...`);
    // Get the single collateral info from the previously defined arrays
    const collateralType = testCoinType; // Use the already defined testCoinType
    const collateralFeedBytes = hexToBytes(PLACEHOLDER_PRICE_FEED_ID_HEX);
    const collateralOracleId = PLACEHOLDER_ORACLE_FEED_ID;
    const sharedDecimals = PLACEHOLDER_SHARED_PRICE_DECIMALS;

    txb.moveCall({
        target: `${packageId}::programs::init_program_single_token_collateral_and_positions`,
        typeArguments: [collateralType], // Pass the coin type as a type argument
        arguments: [
            txb.object(adminCapId),
            txb.pure(bcs.vector(bcs.u8()).serialize(collateralFeedBytes).toBytes()), // Single feed ID bytes
            txb.pure.u16(collateralOracleId), // Single oracle ID
            txb.pure.u8(sharedDecimals),
        ],
    });

    // --- Execute the Combined Transaction --- 
    console.log('\nExecuting the combined transaction block...');
    try {
        // Fetch gas coins right before execution
        console.log('  Fetching gas coins...');
        const gasCoins = await client.getCoins({
            owner: signer.toSuiAddress(),
            coinType: '0x2::sui::SUI',
        });

        if (!gasCoins.data || gasCoins.data.length === 0) {
            throw new Error('No SUI gas coins found for the signer.');
        }

        // Calculate total balance and prepare refs for all gas coins
        const requiredBudget = BigInt(DEFAULT_GAS_BUDGET * 4);
        let totalGasBalance = 0n;
        const gasPaymentObjects: { objectId: string; version: string; digest: string }[] = [];

        for (const coin of gasCoins.data) {
            totalGasBalance += BigInt(coin.balance);
            gasPaymentObjects.push({
                objectId: coin.coinObjectId,
                version: coin.version,
                digest: coin.digest,
            });
        }

        console.log(`  Found ${gasPaymentObjects.length} gas coin(s) with total balance: ${totalGasBalance} MIST`);

        // Check if the total balance is sufficient
        if (totalGasBalance < requiredBudget) {
             console.error('Found gas coins:', gasCoins.data.map(c => ({id: c.coinObjectId, balance: c.balance})));
             throw new Error(
                 `Total SUI balance (${totalGasBalance} MIST) is less than the required budget (${requiredBudget} MIST). ` +
                 `Please add more SUI to your account or reduce the gas budget.`
            );
        }

        // Explicitly set *all* gas coins for payment
        txb.setGasPayment(gasPaymentObjects);
        // Set gas budget for the entire block
        txb.setGasBudget(DEFAULT_GAS_BUDGET); // Use the reduced budget directly

        console.log(`  Executing with budget: ${DEFAULT_GAS_BUDGET} using ${gasPaymentObjects.length} coin(s)`);
        const result = await client.signAndExecuteTransaction({
            signer,
            transaction: txb,
            options: {
                showEffects: true,
                showObjectChanges: true, // Needed to find the created program object
            },
        });
        console.log(`  Success! Digest: ${result.digest}`);

        if (result.effects?.status.status !== 'success') {
             throw new Error(`Transaction failed with status: ${result.effects?.status.error}`);
        }

        // 5. Extract Program Object ID by searching created shared objects for the correct type
        const createdObjects = result.effects?.created;
        let programObjectId: string | null = null;
        const expectedProgramType = `${packageId}::programs::Program`;
        console.log(`  Searching for Program object with type: ${expectedProgramType}...`);

        if (createdObjects && createdObjects.length > 0) {
            const sharedCreatedObjects = createdObjects.filter(obj =>
                typeof obj.owner === 'object' && obj.owner && 'Shared' in obj.owner
            );

            if (sharedCreatedObjects.length === 0) {
                console.error("No *shared* objects found in transaction effects.created. Effects:", JSON.stringify(result.effects, null, 2));
                throw new Error('Expected created shared objects, but none were found in effects.created.');
            }

            console.log(`  Found ${sharedCreatedObjects.length} created shared object(s). Checking types...`);

            for (const sharedObjRef of sharedCreatedObjects) {
                const objectId = sharedObjRef.reference.objectId;
                console.log(`    Checking object ID: ${objectId}`);
                try {
                    // Small delay might help if indexer is slightly behind
                    await sleep(500);

                    const objectInfo = await client.getObject({
                        id: objectId,
                        options: { showType: true }, // Only fetch type
                    });

                    if (objectInfo.error) {
                        console.warn(`    Warning: Error fetching object ${objectId}: ${objectInfo.error.code}`);
                        continue; // Skip this object
                    }

                    if (objectInfo.data && objectInfo.data.type === expectedProgramType) {
                        programObjectId = objectId;
                        console.log(`    Found Program object: ${programObjectId}`);
                        break; // Exit loop once found
                    } else {
                        // console.log(`    Object ${objectId} type (${objectInfo.data?.type}) doesn't match.`);
                    }
                } catch (error) {
                    console.warn(`    Warning: Failed to query object ${objectId}:`, error);
                    // Continue checking other objects
                }
            }
        } else {
             console.error("No created objects found in transaction effects. Effects:", JSON.stringify(result.effects, null, 2));
             throw new Error('Expected created objects, but none were found in effects.created.');
        }

        if (!programObjectId) {
             // Should not happen if the above logic is correct and 3 shared objects were created
            console.error("Failed to extract Program object ID despite finding created objects. Effects:", JSON.stringify(result.effects, null, 2));
            throw new Error('Internal error: Failed to extract Program object ID from the 3rd created shared object.');
        }

        // **** ADD DELAY HERE ****
        const WAIT_MS = 2000; // Wait for 2 seconds
        console.log(`  Waiting ${WAIT_MS / 1000} seconds for transaction finalization...`);
        await sleep(WAIT_MS);
        // *************************

        // Fetch transaction block details to get the checkpoint
        // console.log(`  Fetching transaction block details for digest: ${result.digest}...`); // Log removed
        const txDetails = await client.getTransactionBlock({
            digest: result.digest,
        });
        const checkpoint = txDetails.checkpoint;
        if (!checkpoint) {
            throw new Error(`Failed to retrieve checkpoint for transaction digest ${result.digest}`);
        }

        console.log(`\nSuccessfully Initialized Program. Program Object ID: ${programObjectId}`);

        // 6. Write Output File
        const outputData = {
            packageId,
            globalObjectId,
            programObjectId,
            initializationCheckpoint: checkpoint, // Use checkpoint from txDetails
            network: SUI_NETWORK,
        };
        try {
            fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(outputData, null, 2));
            console.log(`\nSuccessfully wrote initialized deployment info to ${OUTPUT_JSON_PATH}`);
        } catch (error) {
            console.error(`Failed to write output file ${OUTPUT_JSON_PATH}:`, error);
        }

    } catch (error) {
        console.error('Error executing combined transaction block:', error);
         throw error; // Re-throw to halt the script
    }

    console.log('\nDeployment manager script finished.');
}

main().catch((error) => {
    console.error('\nScript encountered an error:', error);
    process.exit(1);
});