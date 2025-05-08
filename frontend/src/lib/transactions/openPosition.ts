import { SuiClient, SuiTransactionBlockResponse } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { SuiSignAndExecuteTransactionOutput } from '@mysten/wallet-standard';
import { SuiPythClient, SuiPriceServiceConnection } from '@pythnetwork/pyth-sui-js';
import { normalizeSuiObjectId, SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';
import { bcs } from '@mysten/sui/bcs'; // Import bcs

import type { MinimalAccountInfo, NotificationState, SupportedCollateralToken, SignAndExecuteTransactionArgs, SignAndExecuteTransactionError } from './depositCollateral';

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

export interface ExistingPositionAsset {
  position_id: string; // object ID (hex string)
  price_feed_id_bytes: string; // Hex string of the price feed ID for this position's market
  // Add other fields if absolutely necessary for set_position_value_assertion logic if it evolves.
  // For now, only position_id (for the Position object) and its market's price_feed_id_bytes are critical.
}

export interface OpenPositionParams {
  account: MinimalAccountInfo;
  accountObjectId: string;
  accountStatsId: string;
  packageId: string;
  globalObjectId: string;    
  programId: string;        
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
  selectedMarketPriceFeedId?: string; 
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

function getTokenPriceFeedId(tokenInfo: string, supportedCollateral: SupportedCollateralToken[]): string {
  const selectedToken = supportedCollateral.find(t => t.fields.token_info === tokenInfo); //This should actually work....
  if (selectedToken && selectedToken.fields.price_feed_id_bytes_hex) {
    return selectedToken.fields.price_feed_id_bytes_hex.startsWith('0x')
        ? selectedToken.fields.price_feed_id_bytes_hex
        : '0x' + selectedToken.fields.price_feed_id_bytes_hex;
  }
  console.warn(`Price feed ID not found for ${tokenInfo}, using default BTC.`);
  return DEFAULT_BTC_PRICE_FEED_ID; 
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
    programId,
    hermesEndpoint,
    pythClient,
    positionMarketIndex,
    selectedMarketPriceFeedId, 
    indexerUrl,
    positionType,
    amount,
    leverage,
    supportedCollateral,
    suiClient,
    signAndExecuteTransaction,
  } = params;

  const effectiveGlobalObjectId = params.globalObjectId || process.env.NEXT_PUBLIC_SUI_GLOBAL_OBJECT_ID;
  const effectiveProgramId = programId || process.env.NEXT_PUBLIC_SUI_PROGRAM_OBJECT_ID;
  const effectivePythStateObjectId = params.pythStateObjectId || process.env.NEXT_PUBLIC_PYTH_STATE_OBJECT_ID;
  const effectiveWormholeStateId = params.wormholeStateId || process.env.NEXT_PUBLIC_WORMHOLE_STATE_OBJECT_ID;
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
    callbacks.setNotification({ show: true, message: "Preparing to open position...", type: 'info' });

    const txb = new Transaction();

    // Step 1: Start Collateral Value Assertion (returns the CVA struct)
    // This result (cvaHotPotato) is the actual CVA struct, not an ID.
    let cvaHotPotato = txb.moveCall({
      target: `${packageId}::value_assertion_objects::start_collateral_value_assertion`,
      arguments: [
        txb.object(accountObjectId),
        txb.object(accountStatsId),
        txb.object(effectiveProgramId),
        // ctx is automatically passed
      ],
    });
    console.log("Transaction command added: start_collateral_value_assertion");

    // Fetch user's collateral from indexer
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
        // Note: This behavior might change. Opening a position might be possible without existing collateral
        // if the new position itself meets margin requirements against $0 collateral (e.g. if it's a cash-backed future).
        // For now, keeping the check as it was.
        callbacks.setNotification({ show: true, message: "No collateral found for the account. Cannot open position without collateral.", type: 'error' });
        callbacks.setIsLoadingTx(false);
        return;
    }
    
    // Step 1.5: Start Position Value Assertion (returns the PVA struct)
    let pvaHotPotato = txb.moveCall({
      target: `${packageId}::value_assertion_objects::start_position_value_assertion`,
      arguments: [
        txb.object(accountObjectId),
        txb.object(accountStatsId),
        txb.object(effectiveProgramId),
        // ctx is automatically passed
      ],
    });
    console.log("Transaction command added: start_position_value_assertion");

    // Fetch user's existing positions from indexer
    const positionsUrl = `${effectiveIndexerUrl}/v0/${normalizeSuiObjectId(accountIdHexForCollateralUrl)}/positions`;
    console.log("Fetching user's existing positions from:", positionsUrl);
    const positionsResponse = await fetch(positionsUrl);
    if (!positionsResponse.ok) {
        const errorText = await positionsResponse.text();
        throw new Error(`Failed to fetch user existing positions from indexer: ${positionsResponse.status} - ${errorText}`);
    }
    const existingPositionAssets: ExistingPositionAsset[] = await positionsResponse.json();
    console.log("User's existing position assets:", existingPositionAssets);


    const priceFeedIdsForUpdate: string[] = [];
    for (const asset of depositedCollateralAssets) {
        const collateralTokenInfo = asset.token_id.token_address;
        const collateralPriceFeedId = getTokenPriceFeedId(collateralTokenInfo, supportedCollateral);
        if (collateralPriceFeedId && !priceFeedIdsForUpdate.includes(collateralPriceFeedId)) {
            priceFeedIdsForUpdate.push(collateralPriceFeedId);
        }
    }

    // Add price feed IDs for existing positions
    for (const position of existingPositionAssets) {
        const positionHexPriceFeedId = position.price_feed_id_bytes.startsWith('0x')
            ? position.price_feed_id_bytes
            : '0x' + position.price_feed_id_bytes;
        if (positionHexPriceFeedId && positionHexPriceFeedId !== '0x' && !priceFeedIdsForUpdate.includes(positionHexPriceFeedId)) {
            priceFeedIdsForUpdate.push(positionHexPriceFeedId);
        }
    }

    const newPositionMarketFeedId = selectedMarketPriceFeedId || DEFAULT_BTC_PRICE_FEED_ID; // Use prop or fallback
    if (newPositionMarketFeedId && !priceFeedIdsForUpdate.includes(newPositionMarketFeedId)) {
        priceFeedIdsForUpdate.push(newPositionMarketFeedId);
    }

    console.log("Fetching Pyth VAA data for feeds:", priceFeedIdsForUpdate);
    const priceServiceConnection = new SuiPriceServiceConnection(effectiveHermesEndpoint);
    const vaaHexStrings = await priceServiceConnection.getPriceFeedsUpdateData(priceFeedIdsForUpdate);
    if (vaaHexStrings.length !== priceFeedIdsForUpdate.length) throw new Error("Mismatch between requested price feeds and received VAA data.");

    console.log("Submitting Pyth VAAs to updatePriceFeeds...");
    // Assuming pythClient.updatePriceFeeds is compatible with being called this way and returns object IDs.
    // The TransactionResult from this is an array of PriceInfoObject IDs.
    const priceInfoObjectStringIds: string[] = await pythClient.updatePriceFeeds(
        txb, // Pass the transaction block
        vaaHexStrings, 
        priceFeedIdsForUpdate,
        // effectivePythStateObjectId // Assuming pythClient.updatePriceFeeds handles this internally or via its setup
    );
    console.log("Raw priceInfoObjectStringIds from updatePriceFeeds:", JSON.stringify(priceInfoObjectStringIds, null, 2));

    // Map feed IDs to their corresponding PriceInfoObject TransactionResult from the array
    const feedIdToPriceInfoObjectId: Record<string, string> = {}; // Stores string object IDs
    priceFeedIdsForUpdate.forEach((feedId, index) => {
        // IMPORTANT: priceInfoObjectIdsResult is an array of TransactionResult, each representing a PriceInfoObject.
        // We need to use these results directly as arguments if they are objects, or specific object IDs if that's what updatePriceFeeds makes available.
        // For now, assuming it provides results that can be passed as object arguments.
        feedIdToPriceInfoObjectId[feedId] = priceInfoObjectStringIds[index]; 
    });
    console.log("feedIdToPriceInfoObjectId mapping (string IDs):", feedIdToPriceInfoObjectId);


    // Step 2: Set Collateral Values
    for (const asset of depositedCollateralAssets) {
        console.log("Processing asset for CVA: ", asset);

        let collateralTokenInfo = asset.token_id.token_address;
        const normalizedCollateralTokenInfo = collateralTokenInfo.startsWith('0x') 
            ? collateralTokenInfo 
            : '0x' + collateralTokenInfo;
            
        const collateralPriceFeedId = getTokenPriceFeedId(collateralTokenInfo, supportedCollateral);
        const priceInfoObjectIdForCollateral = feedIdToPriceInfoObjectId[collateralPriceFeedId];
        
        if (!priceInfoObjectIdForCollateral) { 
            console.error(`Skipping collateral asset ${collateralTokenInfo} because its PriceInfoObject ID was not found after Pyth update.`);
            continue; 
        }

        const normalizedCollateralId = normalizeSuiObjectId(Buffer.from(asset.collateral_id).toString('hex'));
        const normalizedMarkerId = normalizeSuiObjectId(Buffer.from(asset.collateral_marker_id).toString('hex'));

        console.log("--- Adding set_collateral_value_assertion for asset ---");
        console.log("Token Info (Normalized for Type Arg):", normalizedCollateralTokenInfo);
        console.log("CVA Hot Potato (Input): ", cvaHotPotato); // This is a TransactionResult
        console.log("ProgramId: ", effectiveProgramId);
        console.log("CollateralId: ", normalizedCollateralId); 
        console.log("CollateralMarkerId: ", normalizedMarkerId); 
        console.log("PriceInfoObject ID (string): ", priceInfoObjectIdForCollateral);
        console.log("Clock: ", SUI_CLOCK_OBJECT_ID);
        console.log("----------------------------------------------------");
        
        // Each call to set_collateral_value_assertion takes the CVA struct (as TransactionResult)
        // and returns the updated CVA struct (as a new TransactionResult).
        cvaHotPotato = txb.moveCall({
            target: `${packageId}::value_assertion_objects::set_collateral_value_assertion`,
            typeArguments: [normalizedCollateralTokenInfo],
            arguments: [
                cvaHotPotato, // Pass the TransactionResult from previous step
                txb.object(effectiveProgramId),
                txb.object(normalizedCollateralId), 
                txb.object(normalizedMarkerId),     
                txb.object(priceInfoObjectIdForCollateral), // Wrap the string ID with txb.object()
                txb.object(SUI_CLOCK_OBJECT_ID)
            ],
        });
        console.log("Transaction command added: set_collateral_value_assertion for", normalizedCollateralTokenInfo);
    }

    // Step 2.5: Set Position Values for existing positions
    for (const position of existingPositionAssets) {
        console.log("Processing existing position for PVA: ", position);

        const positionMarketHexFeedId = position.price_feed_id_bytes.startsWith('0x')
            ? position.price_feed_id_bytes
            : '0x' + position.price_feed_id_bytes;
        
        const priceInfoObjectIdForExistingPosition = feedIdToPriceInfoObjectId[positionMarketHexFeedId];

        if (!priceInfoObjectIdForExistingPosition) {
            throw new Error(`Critical error: PriceInfoObject ID not found for existing position ${position.position_id} (market feed ${positionMarketHexFeedId}) after Pyth update. Cannot proceed with PVA.`);
        }
        
        // Assuming position.position_id from indexer is already a hex string like "0x..."
        // If it's a byte array string, it would need Buffer.from(...).toString('hex') first.
        // For consistency with how collateral_id was handled (assuming it could be byte array):
        // Let's ensure it's a hex string and then normalize.
        // However, if indexer guarantees hex string for position_id, Buffer.from is not needed.
        // Assuming `position.position_id` is a hex string from indexer.
        const normalizedPositionId = normalizeSuiObjectId(position.position_id);


        console.log("--- Adding set_position_value_assertion for existing position ---");
        console.log("PVA Hot Potato (Input): ", pvaHotPotato);
        console.log("ProgramId: ", effectiveProgramId);
        console.log("PositionId (Normalized): ", normalizedPositionId);
        console.log("PriceInfoObject ID (string): ", priceInfoObjectIdForExistingPosition);
        console.log("Clock: ", SUI_CLOCK_OBJECT_ID);
        console.log("----------------------------------------------------");

        pvaHotPotato = txb.moveCall({
            target: `${packageId}::value_assertion_objects::set_position_value_assertion`,
            // typeArguments: [], // set_position_value_assertion does not have type arguments
            arguments: [
                pvaHotPotato,
                txb.object(effectiveProgramId),
                txb.object(normalizedPositionId), 
                txb.object(priceInfoObjectIdForExistingPosition), 
                txb.object(SUI_CLOCK_OBJECT_ID)
            ],
        });
        console.log("Transaction command added: set_position_value_assertion for existing position", position.position_id);
    }

    const priceInfoObjectIdForPositionMarket = feedIdToPriceInfoObjectId[newPositionMarketFeedId];
    if (!priceInfoObjectIdForPositionMarket) {
      throw new Error(`PriceInfoObject ID not found for position market feed ${newPositionMarketFeedId} after Pyth update.`);
    }

    // Step 3: Open Position
    // open_position_pyth takes CVA as 8th arg, PVA as 9th arg.
    txb.moveCall({
      target: `${packageId}::position_functions::open_position_pyth`,
      arguments: [
        txb.object(accountObjectId),                        // Arg 0
        txb.object(accountStatsId),                         // Arg 1
        txb.object(effectiveProgramId),                     // Arg 2
        txb.pure(bcs.u64().serialize(BigInt(positionType === "Long" ? 0 : 1)).toBytes()), // Arg 3
        txb.pure(bcs.u64().serialize(positionAmountBigInt).toBytes()), // Arg 4
        txb.pure(bcs.u16().serialize(leverage).toBytes()),    // Arg 5
        txb.pure(bcs.u64().serialize(BigInt(positionMarketIndex)).toBytes()), // Arg 6
        txb.object(priceInfoObjectIdForPositionMarket),     // Arg 7: position_price_info
        cvaHotPotato,                                       // Arg 8: collateral_value_assertion
        pvaHotPotato,                                       // Arg 9: position_value_assertion
        txb.object(SUI_CLOCK_OBJECT_ID),                    // Arg 10: clock
      ],
    });
    console.log("Transaction command added: open_position_pyth");

    // Step 4: Destroy Collateral Value Assertion Object
    txb.moveCall({
        target: `${packageId}::value_assertion_objects::destroy_collateral_value_assertion`,
        arguments: [cvaHotPotato], // Pass the final TransactionResult for CVA
    });
    console.log("Transaction command added: destroy_collateral_value_assertion");

    // Step 5: Destroy Position Value Assertion Object
    txb.moveCall({
        target: `${packageId}::value_assertion_objects::destroy_position_value_assertion`,
        arguments: [pvaHotPotato], // Pass the final TransactionResult for PVA
    });
    console.log("Transaction command added: destroy_position_value_assertion");


    console.log("Preparing single transaction for execution...");
    const result = await executeTransaction(txb);
    
    if (!result || !result.digest) {
        callbacks.setNotification({ show: true, message: "Transaction to open position was not completed or digest missing.", type: 'error' });
        callbacks.setIsLoadingTx(false);
        return;
    }

    callbacks.setNotification({ show: true, message: "Processing transaction...", type: 'info' });
    const txResponse = await suiClient.waitForTransaction({ digest: result.digest, options: { showEvents: true, showObjectChanges: true } }); // Added showObjectChanges for debugging
    console.log("Full transaction finalized:", txResponse.digest);
    
    callbacks.setNotification({
        show: true,
        message: `Successfully opened ${positionType} position. Digest: ${txResponse.digest.slice(0,10)}...`,
        type: 'success',
        digest: txResponse.digest
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