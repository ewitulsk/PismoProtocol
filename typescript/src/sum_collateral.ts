import { SuiPythClient, SuiPriceServiceConnection } from "@pythnetwork/pyth-sui-js";
// import { SuiPriceServiceConnection } from './SuiPriceServiceConnection';
import { getFullnodeUrl, SuiClient, SuiParsedData } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { bcs } from '@mysten/bcs';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({ path: '.env' });

const SUI_PACKAGE_ID = "0x65c0b64f9bd0958037232e009618f8a2a3fc1410c80f7f6cde5ba00832406e40"
const SUI_PROGRAM_ID = "0x3bf4039cd73cd0c9b76a8b387d07aac7763d797fe2c8ef313189dc561e3c07aa" // This will change after every deployment.

// Pyth contract addresses for Sui testnet
// These values should be updated based on the network you're using
// See https://docs.pyth.network/price-feeds/contract-addresses/sui
const PYTH_STATE_ID = "0x243759059f4c3111179da5878c12f68d612c21a8d54d85edc86164bb18be1c7c";
const WORMHOLE_STATE_ID = "0x31358d198147da50db32eda2562951d53973a0c0ad5ed738e9b17d88b213d790";
const HERMES_ENDPOINT = "https://hermes-beta.pyth.network";

// Sui system clock object ID
const CLOCK_OBJECT_ID = "0x6";

// Define enum for Oracle types
enum OracleType {
    Pyth = 0,
    Supra = 1,
    Switchboard = 2,
    // Add other oracle types as needed
    Unknown = 999
}

// Define types for TokenIdentifier structure based on the actual response
interface TokenIdentifierFields {
    deprecated: boolean;
    price_feed_id_bytes: number[];
    token_decimals: number;
    token_info: string;
    oracle_feed?: number; // Raw numeric value from the contract, might be missing
}

interface TokenIdentifier {
    type: string;
    fields: TokenIdentifierFields;
    // Enhanced fields added during processing
    parsedOracleType?: OracleType;
    oracleTypeName?: string;
}

// Define type for Program fields
interface ProgramFields {
    id: { id: string };
    supported_collateral: TokenIdentifier[];
    shared_price_decimals: number;
    supported_positions: TokenIdentifier[];
}

// Define interface for simplified token data
interface SimplifiedToken {
    token_info: string;
    price_feed_id: string;
    oracle_type: string; // Human-readable oracle type
}

// Function to convert numeric oracle_feed to OracleType enum
function getOracleType(oracleFeed: number): OracleType {
    // Check if the value is a valid enum value
    if (Object.values(OracleType).includes(oracleFeed)) {
        return oracleFeed as OracleType;
    }
    
    // Handle special cases
    if (oracleFeed === 0) {
        return OracleType.Pyth;
    } else if (oracleFeed === 1) {
        return OracleType.Supra;
    } else if (oracleFeed === 2) {
        return OracleType.Switchboard;
    }
    
    return OracleType.Unknown;
}

// Function to get the Program object data
async function getProgramData(client: SuiClient, programId: string): Promise<ProgramFields | null> {
    try {
        const programObject = await client.getObject({
            id: programId,
            options: {
                showContent: true,
                showType: true,
            }
        });
        
        if (programObject.data?.content?.dataType === 'moveObject') {
            return programObject.data.content.fields as unknown as ProgramFields;
        }
        
        return null;
    } catch (error) {
        console.error(`Error fetching program data for ${programId}:`, error);
        return null;
    }
}

// Function to enhance TokenIdentifier with parsed oracle type
function enhanceTokenIdentifier(token: TokenIdentifier): TokenIdentifier {
    // Default to Pyth (0) if oracle_feed is undefined
    const oracleFeedValue = token.fields.oracle_feed !== undefined ? token.fields.oracle_feed : 0;
    const oracleType = getOracleType(oracleFeedValue);
    
    // Add the parsed oracle type directly to the token object
    token.parsedOracleType = oracleType;
    token.oracleTypeName = OracleType[oracleType];
    
    return token;
}

// Function to get simplified collateral data from a Program object
async function getCollateralTokensInfo(client: SuiClient, programId: string): Promise<SimplifiedToken[]> {
    const programData = await getProgramData(client, programId);
    
    if (programData && programData.supported_collateral && programData.supported_collateral.length > 0) {
        return programData.supported_collateral.map(token => {
            // Enhance the token with parsed oracle type
            enhanceTokenIdentifier(token);
            
            const hexBytes = Buffer.from(token.fields.price_feed_id_bytes).toString('hex');
            
            return {
                token_info: token.fields.token_info,
                price_feed_id: `0x${hexBytes}`,
                oracle_type: token.oracleTypeName || 'Unknown'
            };
        });
    }
    
    return [];
}

// Define interface for price info result
interface PriceInfoResult {
    index: number;
    priceId: string;
    idObject: string;
}

// Function to create and execute a transaction to update Pyth price feeds
async function prepUpdatePythPriceFeeds(
    client: SuiClient, 
    tx: Transaction,
    tokens: [number, SimplifiedToken][]
): Promise<PriceInfoResult[] | undefined> {
    const pythTokens = tokens.filter(([_, token]) => token.oracle_type === 'Pyth');
    
    if (pythTokens.length === 0) {
        console.log("No Pyth oracle tokens found. Skipping price update.");
        return [];
    }

    try {
        // Extract price feed IDs from the tokens, maintaining the original indices
        const priceIdsWithIndices = pythTokens.map(([index, token]) => ({
            index,
            priceId: token.price_feed_id
        }));
        
        const priceIds = priceIdsWithIndices.map(item => item.priceId.replace("0x", ""));
        console.log(priceIds)

        const connection = new SuiPriceServiceConnection(HERMES_ENDPOINT);
        
        console.log("Fetching price update data from Pyth...");
        const priceUpdateData = await connection.getPriceFeedsUpdateData(priceIds);

        const pythClient = new SuiPythClient(client, PYTH_STATE_ID, WORMHOLE_STATE_ID);    
        
        const idObjects = await pythClient.updatePriceFeeds(tx, priceUpdateData, priceIds);
        
        if (idObjects) {
            return idObjects.map((idObject, arrayIndex) => {
                return {
                    index: priceIdsWithIndices[arrayIndex].index,
                    priceId: priceIdsWithIndices[arrayIndex].priceId,
                    idObject
                };
            });
        }
        
        return [];
    } catch (error) {
        console.error("Error updating Pyth price feeds:", error);
        return [];
    }
}

// Function to update collateral values for accounts using Pyth oracle
async function updateCollateralValuesPyth(
    client: SuiClient,
    tx: Transaction,
    priceInfoResults: PriceInfoResult[],
    programId: string,
    sender: string
): Promise<string[]> {
    // Get user accounts
    const accounts = await client.getOwnedObjects({
        owner: sender,
        filter: {
            MatchAll: [
                {
                    StructType: `${SUI_PACKAGE_ID}::accounts::Account`
                }
            ]
        }
    });
    
    // Find accounts that match the program ID
    let accountIds = [];
    for (let account of accounts.data) {
        let accountObj = (account.data?.objectId as string);
        let accountData = await client.getObject({id: accountObj, options: {showContent: true}});
        let accountProgramId = (accountData.data?.content as any)['fields']['program_id'];
        if (accountProgramId === programId) {
            accountIds.push(accountObj);
        }
    }
    
    if (accountIds.length > 0) {
        console.log(`Found ${accountIds.length} accounts for program ${programId}`);
        
        // For each Pyth price info object, call set_collateral_value_pyth for each account
        for (const priceInfo of priceInfoResults) {
            for (let accountId of accountIds) {
                console.log(`Setting collateral value for account ${accountId}, token index ${priceInfo.index}`);
                
                // Add move call to set collateral value
                tx.moveCall({
                    target: `${SUI_PACKAGE_ID}::collateral::set_collateral_value_pyth`,
                    arguments: [
                        tx.object(CLOCK_OBJECT_ID), // Clock object
                        tx.object(priceInfo.idObject), // PriceInfoObject
                        tx.pure(bcs.u64().serialize(priceInfo.index).toBytes()), // collateral_i - using the original token index
                        tx.object(accountId), // account
                        tx.object(programId) // program
                    ],
                });
            }
        }
        
        return accountIds;
    } else {
        console.log(`No accounts found for program ${programId}`);
        return [];
    }
}

// Function to sum collateral values for accounts
async function sumCollateralValuesForAccounts(
    tx: Transaction,
    accountIds: string[]
): Promise<void> {
    if (accountIds.length === 0) {
        return;
    }
    
    for (let accountId of accountIds) {
        console.log(`Summing collateral values for account ${accountId}`);
        
        // Add move call to sum collateral values
        tx.moveCall({
            target: `${SUI_PACKAGE_ID}::collateral::sum_collateral_values`,
            arguments: [
                tx.object(accountId), // account
                tx.object(CLOCK_OBJECT_ID)   // clock
            ],
        });
    }
}

async function main() {
    // Load private key from environment variables
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        console.error("PRIVATE_KEY environment variable is not set");
        return;
    }

    // Create keypair from private key
    const keypair = Ed25519Keypair.fromSecretKey(privateKey);
    const sender = keypair.getPublicKey().toSuiAddress();
    console.log(`Using address: ${sender}`);

    // Use getFullnodeUrl to define Testnet RPC location
    const rpcUrl = getFullnodeUrl('testnet');
     
    // Create a client connected to testnet
    const client = new SuiClient({ url: rpcUrl });
    
    // Process the program ID
    console.log(`\nQuerying Program object with ID: ${SUI_PROGRAM_ID}`);
    
    // Get the full program data to access both collateral and raw token data
    const programData = await getProgramData(client, SUI_PROGRAM_ID);
    
    if (programData && programData.supported_collateral && programData.supported_collateral.length > 0) {
        console.log(`\nProgram ${SUI_PROGRAM_ID} supported collateral tokens:`);
        console.log('----------------------------------------');
        
        // Map to simplified format for display
        const tokensRaw = await getCollateralTokensInfo(client, SUI_PROGRAM_ID);
        
        // Map tokens to tuples of (index, token)
        const tokens = tokensRaw.map((token, index) => [index, token] as [number, SimplifiedToken]);
        
        console.log(JSON.stringify(tokens.map(([_, token]) => token), null, 2));
        console.log(`\nTotal number of supported collateral tokens: ${tokens.length}`);
        
        // Create a new transaction
        const tx = new Transaction();
        
        // Update Pyth price feeds
        const priceInfoResults = await prepUpdatePythPriceFeeds(client, tx, tokens);
        
        if (priceInfoResults && priceInfoResults.length > 0) {
            // Add collateral value update calls to the transaction
            // const accountIds = await updateCollateralValuesPyth(client, tx, priceInfoResults, SUI_PROGRAM_ID, sender);
            
            // After updating all collateral values, sum them up for each account
            // await sumCollateralValuesForAccounts(tx, accountIds);
            
            // Sign and execute the transaction
            try {
                const txResult = await client.signAndExecuteTransaction({
                    transaction: tx,
                    signer: keypair,
                });
                console.log(`Transaction executed successfully. Digest: ${txResult.digest}`);
            } catch (error) {
                console.error("Error executing transaction:", error);
            }
        }
    } else {
        console.log(`No supported collateral found for program ${SUI_PROGRAM_ID}.`);
    }
}

// Execute the main function
main().catch(console.error);
