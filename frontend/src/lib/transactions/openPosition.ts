import { SuiClient, SuiTransactionBlockResponse } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { SuiSignAndExecuteTransactionOutput } from '@mysten/wallet-standard';
import { SuiPythClient, SuiPriceServiceConnection } from '@pythnetwork/pyth-sui-js';
import { normalizeSuiObjectId, SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';
import { bcs } from '@mysten/sui/bcs'; // Import bcs
// import { getPublishedObjectChanges } from '@mysten/sui/utils'; // Removed as it might not be available or needed for CVA ID retrieval via indexer

import { parseUnits } from 'viem';
import type { MinimalAccountInfo, NotificationState, SupportedCollateralToken, SignAndExecuteTransactionArgs, SignAndExecuteTransactionError } from './depositCollateral'; // Re-use types

// You updated this manually, it will remain. Remember the TODO for positionMarketPriceFeedId logic.
const DEFAULT_BTC_PRICE_FEED_ID = "0xf9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b";

// Define types specific to opening a position
export type PositionType = "Long" | "Short";

// Type for collateral assets fetched from the indexer
// Example: /v0/:account_id/collateral
export interface DepositedCollateralAsset {
  collateral_id: string; // object ID
  collateral_marker_id: string; // object ID
  account_id: string; // account address or object ID, ensure consistency
  token_id: {
    // Assuming TokenIdentifier from contracts/sources/tokens.move
    token_address: string; // e.g., "0x2::sui::SUI"
  };
  amount: string; // as string from indexer, represents u64
}


export interface OpenPositionParams {
  account: MinimalAccountInfo;
  accountObjectId: string;
  accountStatsId: string;
  packageId: string;
  globalObjectId: string;    // For the Global object
  programId: string;         // New: For the Program object
  pythStateObjectId: string; 
  wormholeStateId: string;  
  hermesEndpoint: string;   
  pythClient: SuiPythClient; 
  positionMarketIndex: number;
  indexerUrl: string;
  positionType: PositionType;
  amount: string;
  leverage: number;
  supportedCollateral: SupportedCollateralToken[];
  suiClient: SuiClient;
  signAndExecuteTransaction: (
    variables: SignAndExecuteTransactionArgs,
    options?: {
        onSuccess?: (result: SuiSignAndExecuteTransactionOutput) => void;
        onError?: (error: SignAndExecuteTransactionError) => void;
    }
  ) => void;
}

export interface OpenPositionCallbacks {
  setNotification: (notification: NotificationState) => void;
  setIsLoadingTx: (isLoading: boolean) => void;
  clearForm?: () => void; // e.g., clear amount, leverage
}

// --- Helper Functions ---

// Placeholder function to get Pyth Price Feed ID for a given token_info string
// TODO: Implement a proper mapping based on your contract's token definitions
function getTokenPriceFeedId(tokenInfo: string, supportedCollateral: SupportedCollateralToken[]): string {
  const selectedToken = supportedCollateral.find(t => t.fields.token_info === tokenInfo); //This should actually work....
  if (selectedToken && selectedToken.fields.price_feed_id_bytes_hex) {
    return selectedToken.fields.price_feed_id_bytes_hex.startsWith('0x')
        ? selectedToken.fields.price_feed_id_bytes_hex
        : '0x' + selectedToken.fields.price_feed_id_bytes_hex;
  }
  console.warn(`Price feed ID not found for ${tokenInfo}, using default BTC.`);
  return DEFAULT_BTC_PRICE_FEED_ID; // Fallback to BTC, replace with error or better logic
}

// Helper to poll the indexer for the CollateralValueAssertionObject ID
async function getCollateralValueAssertionObjectId(
    indexerUrl: string,
    accountId: string, // This should be the account *object ID*
    retryDelayMs = 2000,
    maxRetries = 10
): Promise<string> {
    const accountIdHex = normalizeSuiObjectId(accountId);
    const url = `${indexerUrl}/v0/${accountIdHex.substring(2)}/collateral-assertion`; // remove 0x prefix for URL

    for (let i = 0; i < maxRetries; i++) {
        try {
            console.log(`Fetching CVA object ID, attempt ${i + 1}: ${url}`);
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                if (data && data.cva_id) {
                    // The cva_id from indexer is likely a hex string without 0x and needs to be an array of numbers.
                    // Convert hex string to 0x prefixed ID
                    const objectId = normalizeSuiObjectId(Array.isArray(data.cva_id) ? Buffer.from(data.cva_id).toString('hex') : data.cva_id);
                    console.log("Found CVA Object ID:", objectId);
                    return objectId;
                }
            } else {
                const errorText = await response.text();
                console.warn(`Failed to fetch CVA object ID (status ${response.status}): ${errorText}`);
            }
        } catch (error) {
            console.warn(`Error fetching CVA object ID: ${error}`);
        }
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
    throw new Error(`Max retries reached. Could not fetch CVA Object ID for account ${accountIdHex}.`);
}


export const openPosition = async (
  params: OpenPositionParams,
  callbacks: OpenPositionCallbacks
): Promise<void> => {
  callbacks.setNotification(null);
  callbacks.setIsLoadingTx(true);

  const {
    account,
    accountObjectId,
    accountStatsId,
    packageId,
    globalObjectId,
    programId,
    pythStateObjectId,
    wormholeStateId,
    hermesEndpoint,
    pythClient,
    positionMarketIndex,
    indexerUrl,
    positionType,
    amount,
    leverage,
    supportedCollateral,
    suiClient,
    signAndExecuteTransaction,
  } = params;

  const effectiveGlobalObjectId = globalObjectId || process.env.NEXT_PUBLIC_SUI_GLOBAL_OBJECT_ID;
  const effectiveProgramId = programId || process.env.NEXT_PUBLIC_SUI_PROGRAM_OBJECT_ID;
  const effectivePythStateObjectId = pythStateObjectId || process.env.NEXT_PUBLIC_PYTH_STATE_OBJECT_ID;
  const effectiveWormholeStateId = wormholeStateId || process.env.NEXT_PUBLIC_WORMHOLE_STATE_OBJECT_ID;
  const effectiveHermesEndpoint = hermesEndpoint || process.env.NEXT_PUBLIC_HERMES_ENDPOINT;
  const effectiveIndexerUrl = indexerUrl || process.env.NEXT_PUBLIC_INDEXER_URL;

  if (!account || !accountObjectId || !accountStatsId || !packageId || 
      !effectiveGlobalObjectId || !effectiveProgramId ||
      !effectivePythStateObjectId || !effectiveWormholeStateId || 
      !effectiveHermesEndpoint || !amount || !pythClient || positionMarketIndex === undefined || 
      !effectiveIndexerUrl) {
    callbacks.setNotification({ show: true, message: "Missing required parameters or environment variables for opening position.", type: 'error' });
    callbacks.setIsLoadingTx(false);
    return;
  }
  
  let positionAmountBigInt: bigint;
  try {
    // Amount is the position size, not margin. Assuming it's in the base asset's smallest unit.
    // Decimals for position amount depend on the market's base asset. This info might be part of `supported_positions`
    // For now, let's assume it's passed as a string representing the full amount (e.g., "1000000" for 1 BTC if 6 decimals)
    // Or, if it's human-readable like "0.1", we'd need the market's decimals.
    // Let's assume `amount` is already in the correct raw u64 format as a string.
    positionAmountBigInt = BigInt(amount);
    if (positionAmountBigInt <= BigInt(0)) {
      throw new Error("Position amount must be positive.");
    }
    if (leverage <= 0) {
        throw new Error("Leverage must be positive.");
    }
  } catch (e) {
    callbacks.setNotification({ show: true, message: `Invalid parameters for position: ${e instanceof Error ? e.message : String(e)}`, type: 'error' });
    callbacks.setIsLoadingTx(false);
    return;
  }

  console.log("Initiating open position:", {
    account: account.address,
    positionType,
    positionAmount: positionAmountBigInt.toString(),
    leverage,
  });

  // Helper to wrap signAndExecuteTransaction in a Promise to get the digest
  const executeTransaction = (txb: Transaction): Promise<SuiSignAndExecuteTransactionOutput> => {
    return new Promise((resolve, reject) => {
        signAndExecuteTransaction(
            { transaction: txb },
            {
                onSuccess: (result) => {
                    console.log("Transaction submitted:", result.digest);
                    resolve(result);
                },
                onError: (error) => {
                    console.error("Transaction error:", error);
                    reject(error);
                }
            }
        );
    });
  };

  try {
    // --- Transaction 1: Start Collateral Value Assertion ---
    callbacks.setNotification({ show: true, message: "Step 1: Starting collateral value assertion...", type: 'info' });
    const txb1 = new Transaction();
    txb1.moveCall({
      target: `${packageId}::collateral::start_collateral_value_assertion`,
      arguments: [
        txb1.object(accountObjectId),
        txb1.object(accountStatsId),
        txb1.object(effectiveProgramId),
      ],
    });

    console.log("Preparing Transaction 1 (Start CVA)...");
    const result1 = await executeTransaction(txb1);

    if (!result1 || !result1.digest) {
        callbacks.setNotification({ show: true, message: "Transaction 1 to start CVA was not completed or digest missing.", type: 'error' });
        callbacks.setIsLoadingTx(false);
        return;
    }

    const tx1Response = await suiClient.waitForTransaction({ digest: result1.digest, options: { showEvents: true, showObjectChanges: true } });
    console.log("Transaction 1 (Start CVA) finalized:", tx1Response.digest);

    // --- Add Delay ---
    console.log("Waiting 2 seconds for indexer to potentially catch up...");
    await new Promise(resolve => setTimeout(resolve, 2000));
    // -----------------

    callbacks.setNotification({ show: true, message: "Step 1 completed. Fetching CVA object ID from indexer...", type: 'info' });
    const cvaObjectId = await getCollateralValueAssertionObjectId(effectiveIndexerUrl, accountObjectId);
    if (!cvaObjectId) {
        throw new Error("Collateral Value Assertion Object ID not found after transaction 1.");
    }
    console.log("Collateral Value Assertion Object ID:", cvaObjectId);

    // --- Transaction 2: Set Collateral Values and Open Position ---
    callbacks.setNotification({ show: true, message: "Step 2: Setting collateral values and opening position...", type: 'info' });

    const accountIdHexForCollateralUrl = normalizeSuiObjectId(accountObjectId).substring(2);
    const collateralUrl = `${effectiveIndexerUrl}/v0/${accountIdHexForCollateralUrl}/collateral`;
    console.log("Fetching user's collateral from:", collateralUrl);
    const collateralResponse = await fetch(collateralUrl);
    if (!collateralResponse.ok) {
        const errorText = await collateralResponse.text();
        throw new Error(`Failed to fetch user collateral from indexer: ${collateralResponse.status} - ${errorText}`);
    }
    const depositedCollateralAssets: DepositedCollateralAsset[] = await collateralResponse.json();
    console.log("User's deposited collateral assets:", depositedCollateralAssets);

    if (!depositedCollateralAssets || depositedCollateralAssets.length === 0) {
        callbacks.setNotification({ show: true, message: "No collateral found for the account. Cannot open position.", type: 'error' });
        callbacks.setIsLoadingTx(false);
        return;
    }

    const txb2 = new Transaction();
    const priceFeedIdsForUpdate: string[] = [];

    for (const asset of depositedCollateralAssets) {
        const collateralTokenInfo = asset.token_id.token_address;
        const collateralPriceFeedId = getTokenPriceFeedId(collateralTokenInfo, supportedCollateral);
        if (!priceFeedIdsForUpdate.includes(collateralPriceFeedId)) {
            priceFeedIdsForUpdate.push(collateralPriceFeedId);
        }
    }

    // TODO: Get the actual price feed ID for the `positionMarketIndex`.
    const positionMarketPriceFeedId = DEFAULT_BTC_PRICE_FEED_ID; // CRITICAL TODO: Replace with actual logic
    if (!priceFeedIdsForUpdate.includes(positionMarketPriceFeedId)) {
        priceFeedIdsForUpdate.push(positionMarketPriceFeedId);
    }

    // Fetch VAA hex strings from Pyth network
    console.log("Fetching Pyth VAA data for feeds:", priceFeedIdsForUpdate);
    const priceServiceConnection = new SuiPriceServiceConnection(effectiveHermesEndpoint);
    const vaaHexStrings = await priceServiceConnection.getPriceFeedsUpdateData(priceFeedIdsForUpdate);
    if (vaaHexStrings.length !== priceFeedIdsForUpdate.length) throw new Error("Mismatch between requested price feeds and received VAA data.");

    // Passing VAA hex strings (string[]) directly to updatePriceFeeds as per the user-provided example.
    // The Buffer conversion has been removed.
    console.log("Submitting Pyth VAAs to updatePriceFeeds...");
    const priceInfoObjectIds = await pythClient.updatePriceFeeds(
        txb2,
        vaaHexStrings, 
        priceFeedIdsForUpdate 
    );
    // --- Add Log ---
    console.log("Raw priceInfoObjectIds from updatePriceFeeds:", JSON.stringify(priceInfoObjectIds, null, 2));
    // ---------------

    console.log("Got PriceInfoObjects: ", priceInfoObjectIds);

    const feedIdToPriceInfoObjectId: Record<string, string> = {};
    priceFeedIdsForUpdate.forEach((feedId, index) => { 
         const objectIdResult = priceInfoObjectIds[index];
         if (typeof objectIdResult !== 'string') {
            console.warn(`Expected string object ID at index ${index} from updatePriceFeeds, but got:`, typeof objectIdResult, objectIdResult);
            // Handle error or assign a default? For now, let's try assigning it anyway if it looks like an object ID string property might exist
            // This is speculative, ideally the type should be string.
            // If it's an object maybe it has an 'objectId' property? const potentialId = (objectIdResult as any)?.objectId;
            // feedIdToPriceInfoObjectId[feedId] = typeof potentialId === 'string' ? potentialId : 'INVALID_ID_TYPE';
            feedIdToPriceInfoObjectId[feedId] = 'INVALID_ID_TYPE'; // Assign placeholder to avoid downstream errors using non-strings
         } else if (!objectIdResult.startsWith('0x')) {
             console.warn(`Object ID at index ${index} from updatePriceFeeds does not start with 0x:`, objectIdResult);
             feedIdToPriceInfoObjectId[feedId] = normalizeSuiObjectId(objectIdResult); // Try normalizing
         } else {
            feedIdToPriceInfoObjectId[feedId] = objectIdResult; // Assign the string ID
         }
    });

    console.log("feedIdToPriceInfoObjectId mapping:", feedIdToPriceInfoObjectId);

    for (const asset of depositedCollateralAssets) {
        
        console.log("Asset: ", asset);

        let collateralTokenInfo = asset.token_id.token_address;
        
        // Ensure token info type string starts with 0x
        const normalizedCollateralTokenInfo = collateralTokenInfo.startsWith('0x') 
            ? collateralTokenInfo 
            : '0x' + collateralTokenInfo;
            
        // Use the original (non-normalized for now) token info for fetching price feed ID, 
        // assuming getTokenPriceFeedId handles potential missing 0x if needed, or uses a map.
        const collateralPriceFeedId = getTokenPriceFeedId(collateralTokenInfo, supportedCollateral); //This is bad but should be working...
        const priceInfoObjectIdForCollateral = feedIdToPriceInfoObjectId[collateralPriceFeedId];
        
        if (!priceInfoObjectIdForCollateral || priceInfoObjectIdForCollateral === 'INVALID_ID_TYPE') { 
            console.error(`Skipping collateral asset ${collateralTokenInfo} because its PriceInfoObject ID was not found or invalid after Pyth update.`);
            continue; 
        }

        const normalizedCollateralId = normalizeSuiObjectId(Buffer.from(asset.collateral_id).toString('hex'));
        const normalizedMarkerId = normalizeSuiObjectId(Buffer.from(asset.collateral_marker_id).toString('hex'));

        console.log("--- Adding set_collateral_value_assertion for asset ---");
        console.log("Token Info (Normalized for Type Arg):", normalizedCollateralTokenInfo);
        console.log("CVAObject: ", cvaObjectId);
        console.log("ProgramId: ", effectiveProgramId);
        console.log("CollateralId: ", normalizedCollateralId); 
        console.log("CollateraMarkerlId: ", normalizedMarkerId); 
        console.log("PriceInfoObject: ", priceInfoObjectIdForCollateral);
        console.log("Clock: ", SUI_CLOCK_OBJECT_ID);
        console.log("----------------------------------------------------");
        
        txb2.moveCall({
            target: `${packageId}::collateral::set_collateral_value_assertion`,
            typeArguments: [normalizedCollateralTokenInfo], // Use normalized string for Type Argument
            arguments: [
                txb2.object(cvaObjectId),
                txb2.object(effectiveProgramId),
                txb2.object(normalizedCollateralId), 
                txb2.object(normalizedMarkerId),     
                txb2.object(priceInfoObjectIdForCollateral),
                txb2.object(SUI_CLOCK_OBJECT_ID)
            ],
        });
    }

    const priceInfoObjectIdForPosition = feedIdToPriceInfoObjectId[positionMarketPriceFeedId];
    if (!priceInfoObjectIdForPosition) throw new Error(`PriceInfoObject ID not found for position market feed ${positionMarketPriceFeedId} after Pyth update.`);

    txb2.moveCall({
      target: `${packageId}::position_functions::open_position_pyth`,
      arguments: [
        txb2.object(accountObjectId),
        txb2.object(accountStatsId),
        txb2.object(effectiveProgramId),
        txb2.pure(bcs.u64().serialize(BigInt(positionType === "Long" ? 0 : 1)).toBytes()), 
        txb2.pure(bcs.u64().serialize(positionAmountBigInt).toBytes()), 
        txb2.pure(bcs.u16().serialize(leverage).toBytes()), 
        txb2.pure(bcs.u64().serialize(BigInt(positionMarketIndex)).toBytes()), 
        txb2.object(priceInfoObjectIdForPosition),
        txb2.object(cvaObjectId),
        txb2.object(SUI_CLOCK_OBJECT_ID),
      ],
    });

    console.log("Preparing Transaction 2 (Set CVA & Open Position)...");
    const result2 = await executeTransaction(txb2);
    
    if (!result2 || !result2.digest) {
        callbacks.setNotification({ show: true, message: "Transaction 2 to set CVA and open position was not completed or digest missing.", type: 'error' });
        callbacks.setIsLoadingTx(false);
        return;
    }

    const tx2Response = await suiClient.waitForTransaction({ digest: result2.digest, options: { showEvents: true } });
    console.log("Transaction 2 (Set CVA & Open Position) finalized:", tx2Response.digest);
    
    callbacks.setNotification({
        show: true,
        message: `Successfully opened ${positionType} position. Digest: ${tx2Response.digest.slice(0,10)}...`,
        type: 'success',
        digest: tx2Response.digest
    });
    if (callbacks.clearForm) callbacks.clearForm();

  } catch (error) {
    console.error('Error in openPosition:', error);
    callbacks.setNotification({
      show: true,
      message: `Error opening position: ${error instanceof Error ? error.message : String(error)}`,
      type: 'error',
    });
  } finally {
    callbacks.setIsLoadingTx(false);
  }
}; 