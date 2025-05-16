import { SuiClient, SuiTransactionBlockResponse } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { SuiSignAndExecuteTransactionOutput } from '@mysten/wallet-standard';
import { SuiPythClient, SuiPriceServiceConnection } from '@pythnetwork/pyth-sui-js';
import { normalizeSuiObjectId, SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';
import { bcs } from '@mysten/sui/bcs';

import type { 
    MinimalAccountInfo, 
    NotificationState, 
    SupportedCollateralToken as ExtSupportedCollateralToken, 
    SignAndExecuteTransactionArgs,  // Ensure this is imported
    SignAndExecuteTransactionError // Ensure this is imported
} from './depositCollateral'; 

// --- Type Definitions ---

// Data for the specific position being closed
export interface PositionDataForClose {
  position_id: string; // Object ID of the Position struct
  price_feed_id_bytes: string; // Hex string, 0x prefixed, for the position's market
  // Add other fields from the Position struct if needed by the UI or logic later
  // For example, to display details in notifications or confirm dialogs.
  // For the transaction itself, position_id and its market's price_feed_id_bytes are primary.
}

// Data structure for collateral assets fetched from the indexer
// Derived from /v0/:account_id/collateral endpoint (see ActionTabs.tsx DepositedCollateralResponse)
export interface CollateralAssetData {
  collateral_id: string; // Object ID of the Collateral struct itself
  collateral_marker_id: string; // Object ID of the CollateralMarker struct (this is what we pass to the contract)
  token_info: string; // Full token type string, e.g., "0x2::sui::SUI"
  // We will use token_info to find the price_feed_id_bytes via supportedCollateral
}

// Data structure for vault assets fetched from the indexer
// Derived from /v0/vaults endpoint (see indexer/src/db/models/vault_created_events.rs)
export interface VaultAssetData {
  vault_address: string; // Object ID of the Vault struct
  vault_marker_address: string; // Object ID of the VaultMarker struct (this is what we pass to the contract)
  coin_token_info: string; // Full token type string for the vault's underlying asset, e.g., "0x2::sui::SUI"
  // We will use coin_token_info to find the price_feed_id_bytes via supportedCollateral (or a similar mapping for vault tokens)
}

// Explicit type for assets fetched from /v0/:account_id/collateral
interface FetchedCollateralAsset {
  collateral_id: number[]; // Assuming byte array from log, adjust if it's hex string directly
  collateral_marker_id: number[]; // byte array
  account_id: number[];         // Assuming byte array from log
  token_id: {
    token_address: string;      // Correct field name based on logs
    // creation_num?: number;    // Optional if not always present from this endpoint
  };
  amount: string | number;        // Can be string or number from JSON
}

export interface ClosePositionParams {
  accountObjectId: string;
  accountStatsId: string;
  packageId: string;
  programId: string; // For the Program object
  pythStateObjectId: string;
  wormholeStateId: string;
  hermesEndpoint: string;
  pythClient: SuiPythClient;
  indexerUrl: string;
  positionToClose: PositionDataForClose; // The specific position object/data
  supportedCollateral: ExtSupportedCollateralToken[]; // Used to map token_info strings to price_feed_id_bytes
  suiClient: SuiClient;
  signAndExecuteTransaction: (
    variables: SignAndExecuteTransactionArgs,
    options?: {
        onSuccess?: (result: SuiSignAndExecuteTransactionOutput) => void;
        onError?: (error: SignAndExecuteTransactionError) => void;
    }
  ) => void;
}

export interface ClosePositionCallbacks {
  setNotification: (notification: NotificationState) => void;
  setIsLoadingTx: (isLoading: boolean) => void;
  onSuccess?: (digest: string) => void; // Callback on successful transaction, e.g., to refresh UI
}

// Helper function to get Pyth Price Feed ID for a given token_info string
// Adapted from openPosition.ts - ensure supportedCollateral has price_feed_id_bytes_hex or derive it
const getTokenPriceFeedId = (tokenInfo: string, supportedTokens: ExtSupportedCollateralToken[]): string | null => {
  const selectedToken = supportedTokens.find(t => t.fields.token_info === tokenInfo);
  if (selectedToken) {
    if (selectedToken.fields.price_feed_id_bytes_hex) {
      return selectedToken.fields.price_feed_id_bytes_hex.startsWith('0x')
        ? selectedToken.fields.price_feed_id_bytes_hex
        : '0x' + selectedToken.fields.price_feed_id_bytes_hex;
    }
    if (selectedToken.fields.price_feed_id_bytes && selectedToken.fields.price_feed_id_bytes.length > 0) {
        return '0x' + Buffer.from(selectedToken.fields.price_feed_id_bytes).toString('hex');
    }
    console.warn(`[getTokenPriceFeedId] Token found for '${tokenInfo}', but missing price_feed_id_bytes_hex or price_feed_id_bytes.`);
  }
  if (!selectedToken) {
    console.warn(`[getTokenPriceFeedId] Token info '${tokenInfo}' NOT FOUND in the provided supportedTokens list.`);
  }
  return null;
};


// Main function to close a position
export const closePosition = async (
  params: ClosePositionParams,
  callbacks: ClosePositionCallbacks
): Promise<void> => {
  callbacks.setNotification(null);
  callbacks.setIsLoadingTx(true);

  const {
    accountObjectId,
    accountStatsId,
    packageId,
    programId,
    pythStateObjectId,
    wormholeStateId,
    hermesEndpoint,
    pythClient,
    indexerUrl,
    positionToClose,
    supportedCollateral,
    suiClient,
    signAndExecuteTransaction,
  } = params;

  console.log("[closePosition] PYTH_STATE_OBJECT_ID being used by pythClient (passed as pythStateObjectId prop):", pythStateObjectId);
  // Log the received supportedCollateral prop
  console.log("[closePosition] Received supportedCollateral prop:", JSON.stringify(supportedCollateral, null, 2));

  // Validate essential parameters
  if (!accountObjectId || !accountStatsId || !packageId || !programId ||
      !pythStateObjectId || !hermesEndpoint || !pythClient || !indexerUrl || !positionToClose) {
    callbacks.setNotification({ show: true, message: "Missing required parameters for closing position.", type: 'error' });
    callbacks.setIsLoadingTx(false);
    return;
  }

  console.log("Initiating close position:", {
    accountObjectId: accountObjectId,
    positionId: positionToClose.position_id,
  });
  
  const executeTransaction = (txb: Transaction): Promise<SuiSignAndExecuteTransactionOutput> => {
    return new Promise((resolve, reject) => {
        signAndExecuteTransaction(
            { transaction: txb },
            {
                onSuccess: (result) => {
                    console.log("Close Position Transaction submitted:", result.digest);
                    resolve(result);
                },
                onError: (error) => {
                    console.error("Close Position Transaction error:", error);
                    reject(error);
                }
            }
        );
    });
  };

  try {
    callbacks.setNotification({ show: true, message: "Preparing to close position...", type: 'info' });
    const txb = new Transaction();

    // Step 1: Fetch all_collateral_markers and their price feed IDs
    const accountIdHexForCollateralUrl = normalizeSuiObjectId(accountObjectId).substring(2);
    const collateralUrl = `${indexerUrl}/v0/${accountIdHexForCollateralUrl}/collateral`;
    console.log("Fetching user's collateral from:", collateralUrl);
    const collateralResponse = await fetch(collateralUrl);
    if (!collateralResponse.ok) {
      const errorText = await collateralResponse.text();
      throw new Error(`Failed to fetch user collateral: ${collateralResponse.status} - ${errorText}`);
    }
    // Use the explicitly defined FetchedCollateralAsset type
    const fetchedCollateralAssets: FetchedCollateralAsset[] = await collateralResponse.json();
    
    console.log("Fetched collateral assets:", fetchedCollateralAssets);

    const activeCollateralMarkers: { markerId: string; feedId: string }[] = [];
    console.log("[closePosition] Processing fetchedCollateralAssets:", fetchedCollateralAssets);
    for (const asset of fetchedCollateralAssets) { 
        console.log("[closePosition] Full collateral asset object:", JSON.stringify(asset, null, 2)); 
        const markerId = normalizeSuiObjectId(Buffer.from(asset.collateral_marker_id).toString('hex'));
        
        // Access token_address, which is now type-correct due to FetchedCollateralAsset interface
        let tokenInfo = asset && asset.token_id && typeof asset.token_id.token_address === 'string' 
            ? asset.token_id.token_address 
            : ''; 
        
        // Ensure tokenInfo starts with 0x
        if (tokenInfo && !tokenInfo.startsWith('0x')) {
            tokenInfo = '0x' + tokenInfo;
            console.log(`[closePosition] Collateral: Prepended '0x' to tokenInfo, now: '${tokenInfo}'`);
        }
        
        // console.log(`[closePosition] Collateral: Attempting to find feed for tokenInfo (using account_address for linter): '${tokenInfo}' (Marker: ${markerId})`);
        // Revert to original log now that type is fixed:
        console.log(`[closePosition] Collateral: Attempting to find feed for tokenInfo: '${tokenInfo}' (Marker: ${markerId})`);
        if (!tokenInfo) { 
            console.warn(`[closePosition] Collateral: tokenInfo is empty or invalid for asset (Marker: ${markerId}). Skipping. Asset dump:`, asset);
            continue;
        }
        const feedId = getTokenPriceFeedId(tokenInfo, supportedCollateral);
        if (feedId) {
            activeCollateralMarkers.push({ markerId, feedId });
        } else {
            console.warn(`Could not find price feed ID for collateral token ${tokenInfo} (marker ${markerId}). This collateral will be skipped for price updates.`);
            // Potentially throw an error if all collateral must have price feeds:
            // throw new Error(`Missing price feed for collateral token ${tokenInfo}`);
        }
    }
    console.log("Active collateral markers for price updates:", activeCollateralMarkers);

    // Step 2: Fetch all_vault_markers and their price feed IDs
    const vaultsUrl = `${indexerUrl}/v0/vaults`;
    console.log("Fetching vaults from:", vaultsUrl);
    const vaultsResponse = await fetch(vaultsUrl);
    if (!vaultsResponse.ok) {
      const errorText = await vaultsResponse.text();
      throw new Error(`Failed to fetch vaults: ${vaultsResponse.status} - ${errorText}`);
    }
    const fetchedVaults: VaultAssetData[] = await vaultsResponse.json(); // Assuming VaultAssetData matches the response
    console.log("Fetched vaults:", fetchedVaults);

    const activeVaultMarkers: { markerId: string; feedId: string }[] = [];
    console.log("[closePosition] Processing fetchedVaults:", fetchedVaults);
    for (const vault of fetchedVaults) {
        const markerId = normalizeSuiObjectId(vault.vault_marker_address);
        const originalTokenInfo = vault.coin_token_info; // Original value from indexer
        let tokenInfoForLookup = originalTokenInfo;

        console.log(`[closePosition] Vault: Original tokenInfo: '${originalTokenInfo}' (Marker: ${markerId})`);
        
        let feedId = getTokenPriceFeedId(tokenInfoForLookup, supportedCollateral);
        
        // If not found and starts with 0x, try stripping 0x and looking up again
        // This assumes supportedCollateral stores package IDs in type strings without the 0x prefix.
        if (!feedId && tokenInfoForLookup && tokenInfoForLookup.startsWith('0x')) {
            const withoutPrefix = tokenInfoForLookup.substring(2);
            console.log(`[closePosition] Vault: '${tokenInfoForLookup}' not found, trying without 0x prefix: '${withoutPrefix}'`);
            feedId = getTokenPriceFeedId(withoutPrefix, supportedCollateral);
            if (feedId) {
                tokenInfoForLookup = withoutPrefix; // Update if match found with stripped prefix
            }
        }

        console.log(`[closePosition] Vault: Attempting to use feed for (final) tokenInfo: '${tokenInfoForLookup}' (Marker: ${markerId})`);
        
        if (!tokenInfoForLookup) { // Check the final tokenInfoForLookup used for the successful/attempted feedId get
            console.warn(`[closePosition] Vault: tokenInfo is effectively empty or invalid for vault (Marker: ${markerId}). Skipping. Vault dump:`, vault);
            continue;
        }

        if (feedId) {
            activeVaultMarkers.push({ markerId, feedId });
        } else {
            console.warn(`Could not find price feed ID for vault token ${tokenInfoForLookup} (marker ${markerId}). This vault will be skipped for price updates.`);
            // Potentially throw an error:
            // throw new Error(`Missing price feed for vault token ${tokenInfoForLookup}`);
        }
    }
    console.log("Active vault markers for price updates:", activeVaultMarkers);

    // Step 3: Collect all unique price feed IDs for Pyth update
    const priceFeedIdsForUpdate = new Set<string>();
    
    // Add position's market feed ID
    const positionMarketFeedId = positionToClose.price_feed_id_bytes.startsWith('0x')
        ? positionToClose.price_feed_id_bytes
        : '0x' + positionToClose.price_feed_id_bytes;
    if (positionMarketFeedId && positionMarketFeedId !== '0x') {
        priceFeedIdsForUpdate.add(positionMarketFeedId);
    } else {
        throw new Error(`Invalid or missing price_feed_id_bytes for the position being closed: ${positionToClose.position_id}`);
    }

    activeCollateralMarkers.forEach(cm => priceFeedIdsForUpdate.add(cm.feedId));
    activeVaultMarkers.forEach(vm => priceFeedIdsForUpdate.add(vm.feedId));

    const uniquePriceFeedIds = Array.from(priceFeedIdsForUpdate);
    if (uniquePriceFeedIds.length === 0 && (!positionMarketFeedId || positionMarketFeedId === '0x')) {
      // This case should ideally be caught by the positionMarketFeedId check,
      // but as a safeguard if there are no other feeds.
      console.warn("No valid price feed IDs found for Pyth update. This might be an issue if prices are expected.");
      // Depending on contract requirements, this might be an error or acceptable if no price updates are strictly needed.
      // For closing a position, the position's market price is essential.
    }
    console.log("Unique Price Feed IDs for Pyth update:", uniquePriceFeedIds);

    // Step 4: Fetch Pyth VAA data and update price feeds in the transaction
    let priceInfoObjectStringIds: string[] = [];
    if (uniquePriceFeedIds.length > 0) {
        console.log(`[closePosition] Number of unique price feeds to update (U): ${uniquePriceFeedIds.length}`);
        const priceServiceConnection = new SuiPriceServiceConnection(hermesEndpoint);
        const vaaHexStrings = await priceServiceConnection.getPriceFeedsUpdateData(uniquePriceFeedIds);
        if (vaaHexStrings.length !== uniquePriceFeedIds.length) {
            throw new Error("Mismatch between requested Pyth price feeds and received VAA data.");
        }
        
        priceInfoObjectStringIds = await pythClient.updatePriceFeeds(
            txb,
            vaaHexStrings,
            uniquePriceFeedIds,
        );
        console.log("Pyth updatePriceFeeds submitted. PriceInfoObject IDs:", priceInfoObjectStringIds);
    } else {
         throw new Error("No price feed IDs to update, cannot get position market price.");
    }
    
    // Step 5: Prepare arguments for the close_position_pyth contract call

    // 5.1 Master vector of all PriceInfoObjects
    const allPriceInfoObjectsArg = txb.makeMoveVec({ 
        elements: priceInfoObjectStringIds.map(id => txb.object(id)) 
    });

    // 5.2 Position's PriceInfoObject index
    const positionPriceInfoIndex = uniquePriceFeedIds.indexOf(positionMarketFeedId);
    if (positionPriceInfoIndex === -1) {
        throw new Error(`PriceInfoObject index not found for position's market feed ID: ${positionMarketFeedId}`);
    }
    const positionPriceInfoIArg = txb.pure(bcs.u64().serialize(BigInt(positionPriceInfoIndex)));

    // 5.3 All Collateral Markers and their PriceInfoObject indices
    const collateralMarkerObjectArgs = activeCollateralMarkers.map(cm => txb.object(cm.markerId));
    const allCollateralPriceInfoIndices = activeCollateralMarkers.map(cm => {
        const index = uniquePriceFeedIds.indexOf(cm.feedId);
        if (index === -1) {
            throw new Error(`PriceInfoObject index not found for collateral feed ID: ${cm.feedId}`);
        }
        return index;
    });

    const allCollateralMarkersArg = txb.makeMoveVec({ elements: collateralMarkerObjectArgs });
    const allCollateralPriceInfoIsArg = txb.makeMoveVec({ 
        elements: allCollateralPriceInfoIndices.map(idx => txb.pure(bcs.u64().serialize(BigInt(idx))))
        // No type property, rely on inference from elements
    });

    // 5.4 All Vault Markers and their PriceInfoObject indices
    const vaultMarkerObjectArgs = activeVaultMarkers.map(vm => txb.object(vm.markerId));
    const allVaultPriceInfoIndices = activeVaultMarkers.map(vm => {
        const index = uniquePriceFeedIds.indexOf(vm.feedId);
        if (index === -1) {
            throw new Error(`PriceInfoObject index not found for vault feed ID: ${vm.feedId}`);
        }
        return index;
    });

    const allVaultMarkersArg = txb.makeMoveVec({ elements: vaultMarkerObjectArgs });
    const allVaultPriceInfoIsArg = txb.makeMoveVec({ 
        elements: allVaultPriceInfoIndices.map(idx => txb.pure(bcs.u64().serialize(BigInt(idx))))
        // No type property, rely on inference from elements
    });

    // Step 6: Add the close_position_pyth move call
    console.log("--- Preparing for close_position_pyth moveCall ---");
    console.log("Package ID used for target:", packageId); 
    console.log("Program ID for arg0 (txb.object(programId)):", programId); 
    console.log("accountObjectId:", accountObjectId);
    console.log("accountStatsId:", accountStatsId);
    console.log("positionToClose.position_id:", positionToClose.position_id);
    console.log("positionPriceInfoIndex (for position_price_info_i):", positionPriceInfoIndex);
    console.log("SUI_CLOCK_OBJECT_ID:", SUI_CLOCK_OBJECT_ID);
    
    console.log("--- All PriceInfoObject IDs (in order for all_price_info_objects vector) ---");
    priceInfoObjectStringIds.forEach((id, index) => {
        console.log(`all_price_info_objects[${index}]: ${id} (corresponds to uniquePriceFeedIds[${index}]: ${uniquePriceFeedIds[index]})`);
    });

    console.log("--- Collateral Markers & Price Indices ---");
    activeCollateralMarkers.forEach((cm, i) => {
        console.log(`CollateralMarker[${i}].markerId:`, cm.markerId, `| Corresponding PriceInfoIndex:`, allCollateralPriceInfoIndices[i]);
    });
    console.log("collateralMarkerObjectArgs (IDs being wrapped by txb.object):", collateralMarkerObjectArgs.map(arg => String(arg))); 
    console.log("allCollateralPriceInfoIs (indices passed to txb.pure):", allCollateralPriceInfoIndices);

    console.log("--- Vault Markers & Price Indices ---");
    activeVaultMarkers.forEach((vm, i) => {
        console.log(`VaultMarker[${i}].markerId:`, vm.markerId, `| Corresponding PriceInfoIndex:`, allVaultPriceInfoIndices[i]);
    });
    console.log("vaultMarkerObjectArgs (IDs being wrapped by txb.object):", vaultMarkerObjectArgs.map(arg => String(arg)));
    console.log("allVaultPriceInfoIs (indices passed to txb.pure):", allVaultPriceInfoIndices);
    console.log("------------------------------------------------------");

    txb.moveCall({
      target: `${packageId}::position_functions::close_position_pyth`,
      arguments: [
        txb.object(programId),                        
        txb.object(accountObjectId),                  
        txb.object(accountStatsId),                   
        txb.object(positionToClose.position_id),      
        positionPriceInfoIArg,      // u64 index for position's price info
        allCollateralMarkersArg,                      
        allCollateralPriceInfoIsArg,                  
        allVaultMarkersArg,                           
        allVaultPriceInfoIsArg,                       
        allPriceInfoObjectsArg,                       
        txb.object(SUI_CLOCK_OBJECT_ID),              
      ],
    });
    console.log("Move call for close_position_pyth added to transaction.");

    // Step 7: Execute the transaction
    callbacks.setNotification({ show: true, message: "Submitting close position transaction...", type: 'info' });
    const result = await executeTransaction(txb);

    if (!result || !result.digest) {
      callbacks.setNotification({ show: true, message: "Transaction to close position failed or digest missing.", type: 'error' });
      callbacks.setIsLoadingTx(false);
      return;
    }

    callbacks.setNotification({ show: true, message: "Processing transaction...", type: 'info', digest: result.digest });
    const txResponse = await suiClient.waitForTransaction({ digest: result.digest, options: { showEvents: true } });
    console.log("Close position transaction finalized:", txResponse.digest);

    callbacks.setNotification({
      show: true,
      message: `Position closed successfully. Digest: ${txResponse.digest.slice(0, 10)}...`,
      type: 'success',
      digest: txResponse.digest,
    });

    if (callbacks.onSuccess) {
      callbacks.onSuccess(txResponse.digest);
    }

  } catch (error) {
    console.error("Error in closePosition:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    callbacks.setNotification({
      show: true,
      message: `Error closing position: ${errorMessage}`,
      type: 'error',
    });
  } finally {
    callbacks.setIsLoadingTx(false);
  }
};
