import express, { Request, Response } from 'express';
import cors from 'cors';
import { Transaction } from '@mysten/sui/transactions';
import { suiClient, keypair } from './sui-client';
import { PACKAGE_ID, LIQUIDATION_SERVICE_PORT, SUI_RPC_URL, PYTH_STATE_OBJECT_ID, WORMHOLE_STATE_ID, HERMES_ENDPOINT } from './config';
// Import necessary types for the sui_queryObjects RPC call parameters
import { SuiObjectDataOptions, SuiObjectResponseQuery, PaginatedObjectsResponse, SuiObjectResponse } from '@mysten/sui/client';
import { SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';
import { SuiPythClient, SuiPriceServiceConnection } from '@pythnetwork/pyth-sui-js';

// Constants moved to config.ts and imported above

const app = express();
app.use(express.json());
app.use(cors());

const PORT = LIQUIDATION_SERVICE_PORT || 3000;

// Health check endpoint for Docker
app.get('/health', (req: Request, res: Response) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        service: 'liquidation-transfer-service',
        version: '1.0.0'
    });
});

// Helper to extract type arguments from a full type string
// Example: "0xPKG::module::Struct<0xTYPEA, 0xTYPEB>" -> ["0xTYPEA", "0xTYPEB"]
function extractTypeArguments(typeString: string): string[] {
    const match = typeString.match(/<(.+)>$/);
    if (!match || !match[1]) {
        return [];
    }
    // This regex handles nested generics to some extent but might need refinement for very complex cases.
    // It aims to split by top-level commas only.
    const params = match[1];
    const args: string[] = [];
    let balance = 0;
    let current_arg = '';
    for (const char of params) {
        if (char === '<') balance++;
        if (char === '>') balance--;
        if (char === ',' && balance === 0) {
            args.push(current_arg.trim());
            current_arg = '';
        } else {
            current_arg += char;
        }
    }
    args.push(current_arg.trim());
    return args;
}

app.post('/execute_vault_transfer', async (req: Request, res: Response) => {
    const { transfer_id, vault_address } = req.body; // Sent by indexer

    if (!transfer_id || !vault_address) {
        return res.status(400).json({ error: 'Missing transfer_id or vault_address' });
    }

    try {
        console.log(`Processing /execute_vault_transfer for vault: ${vault_address}, transfer: ${transfer_id}`);

        // 1. Fetch the Vault object to get its type parameters
        const vaultObject = await suiClient.getObject({
            id: vault_address,
            options: { showType: true },
        });
        if (!vaultObject.data || !vaultObject.data.type) {
            throw new Error(`Vault object not found or type missing for ${vault_address}`);
        }
        const vaultType = vaultObject.data.type;
        const [coinType, lpType] = extractTypeArguments(vaultType);

        if (!coinType || !lpType) {
            throw new Error(`Could not extract CoinType or LPType from vault type: ${vaultType}`);
        }
        
        console.log(`Vault Type: ${vaultType}, CoinType: ${coinType}, LPType: ${lpType}`);

        const txb = new Transaction();
        txb.moveCall({
            target: `${PACKAGE_ID}::lp::execute_vault_transfer`,
            typeArguments: [coinType, lpType],
            arguments: [
                txb.object(vault_address),
                txb.object(transfer_id),
            ],
        });

        const result = await suiClient.signAndExecuteTransaction({
            signer: keypair,
            transaction: txb,
            options: { showEffects: true, showObjectChanges: true },
        });
        
        console.log('Vault transfer execution result:', JSON.stringify(result, null, 2));
        res.json({ success: true, transactionDigest: result.digest });

    } catch (error: any) {
        console.error('Error executing vault transfer:', error);
        res.status(500).json({ error: error.message || 'Failed to execute vault transfer' });
    }
});

app.post('/execute_collateral_transfer', async (req: Request, res: Response) => {
    // Expected from indexer callback based on CollateralTransferCreatedEvent
    const { transfer_id, collateral_address, to_vault_address, vault_marker_id } = req.body;

    if (!transfer_id || !collateral_address || !to_vault_address || !vault_marker_id) {
        return res.status(400).json({ error: 'Missing transfer_id, collateral_address, to_vault_address, or vault_marker_id' });
    }

    try {
        console.log(`Processing /execute_collateral_transfer for collateral: ${collateral_address}, transfer: ${transfer_id}, to_vault: ${to_vault_address}, vault_marker: ${vault_marker_id}`);

        // 1. Fetch Collateral object to get its CoinType
        const collateralObject = await suiClient.getObject({
            id: collateral_address,
            options: { showType: true },
        });
        if (!collateralObject.data || !collateralObject.data.type) {
            throw new Error(`Collateral object not found or type missing for ${collateral_address}`);
        }
        const collateralTypeString = collateralObject.data.type;
        const [collateralCoinType] = extractTypeArguments(collateralTypeString);
        if (!collateralCoinType) {
            throw new Error(`Could not extract CoinType from collateral type: ${collateralTypeString}`);
        }
        console.log(`Collateral Type: ${collateralTypeString}, CollateralCoinType: ${collateralCoinType}`);

        // 2. Fetch target Vault object to get its LPType (and verify its CoinType matches collateral's)
        const targetVaultObject = await suiClient.getObject({
            id: to_vault_address,
            options: { showType: true, showContent: true }, // showContent to find its marker later if needed
        });
        if (!targetVaultObject.data || !targetVaultObject.data.type) {
            throw new Error(`Target Vault object not found or type missing for ${to_vault_address}`);
        }
        const targetVaultTypeString = targetVaultObject.data.type;
        const [targetVaultCoinType, targetLpType] = extractTypeArguments(targetVaultTypeString);

        if (!targetVaultCoinType || !targetLpType) {
            throw new Error(`Could not extract CoinType or LPType from target vault type: ${targetVaultTypeString}`);
        }
        console.log(`Target Vault Type: ${targetVaultTypeString}, VaultCoinType: ${targetVaultCoinType}, LPType: ${targetLpType}`);

        // As per thought process, the CoinType for collateral and vault in execute_collateral_transfer must match.
        if (collateralCoinType !== targetVaultCoinType) {
            throw new Error(`Collateral CoinType (${collateralCoinType}) does not match Vault CoinType (${targetVaultCoinType})`);
        }

        // 3. Find the VaultMarker for the target_vault_address
        // The VaultMarker's `vault_id` field points to the Vault's object ID (to_vault_address)
        const targetVaultMarkerId = vault_marker_id; // Use the ID from the request body
        console.log(`Using Target VaultMarker ID: ${targetVaultMarkerId}`);

        const txb = new Transaction();
        txb.moveCall({
            target: `${PACKAGE_ID}::collateral::execute_collateral_transfer`,
            typeArguments: [collateralCoinType, targetLpType], // [CollateralCoinType, VaultLpType]
            arguments: [
                txb.object(collateral_address),
                txb.object(transfer_id),
                txb.object(to_vault_address),
                txb.object(targetVaultMarkerId),
            ],
        });

        const result = await suiClient.signAndExecuteTransaction({
            signer: keypair,
            transaction: txb,
            options: { showEffects: true, showObjectChanges: true },
        });
        
        console.log('Collateral transfer execution result:', JSON.stringify(result, null, 2));
        res.json({ success: true, transactionDigest: result.digest });

    } catch (error: any) {
        console.error('Error executing collateral transfer:', error);
        res.status(500).json({ error: error.message || 'Failed to execute collateral transfer' });
    }
});

app.post('/liquidate_account', async (req: Request, res: Response) => {
    const { 
        programId,
        accountObjectId,
        accountStatsId,
        positions, // Array<{ id: string, priceFeedIdBytes: string }>
        collaterals, // Array<{ collateralId: string, markerId: string, coinType: string, priceFeedIdBytes: string }>
        vaultMarkerIds // string[]
    } = req.body;

    if (!programId || !accountObjectId || !accountStatsId || !positions || !collaterals || !vaultMarkerIds) {
        return res.status(400).json({ error: 'Missing required parameters for liquidation' });
    }
    
    // Check if essential Pyth config is loaded
    if (!PYTH_STATE_OBJECT_ID || !WORMHOLE_STATE_ID || !HERMES_ENDPOINT) {
        console.error("Pyth/Hermes configuration is missing from environment variables.");
        return res.status(500).json({ error: 'Server configuration error: Pyth/Hermes settings missing.' });
    }

    try {
        console.log(`Processing /liquidate_account for account: ${accountObjectId}`);
        const txb = new Transaction();
        const pythClient = new SuiPythClient(suiClient, PYTH_STATE_OBJECT_ID, WORMHOLE_STATE_ID);
        const priceServiceConnection = new SuiPriceServiceConnection(HERMES_ENDPOINT);

        // 1. Pyth Price Updates
        const uniqueFeedIds = Array.from(new Set([
            ...positions.map((p: any) => p.priceFeedIdBytes),
            ...collaterals.map((c: any) => c.priceFeedIdBytes)
        ]));
        console.log('[Liquidate Account] Unique Pyth Feed IDs:', JSON.stringify(uniqueFeedIds));

        let priceInfoObjectTxArgs: any[] = [];
        const feedToPriceInfoObjectArg = new Map<string, any>();

        if (uniqueFeedIds.length > 0) {
            const vaaHexStrings = await priceServiceConnection.getPriceFeedsUpdateData(uniqueFeedIds);
            if (vaaHexStrings.length !== uniqueFeedIds.length) {
                throw new Error("Mismatch between requested Pyth price feeds and received VAA data.");
            }
            priceInfoObjectTxArgs = await pythClient.updatePriceFeeds(
                txb,
                vaaHexStrings,
                uniqueFeedIds,
            );
            console.log('[Liquidate Account] priceInfoObjectTxArgs from Pyth SDK:', JSON.stringify(priceInfoObjectTxArgs, null, 2));
            uniqueFeedIds.forEach((feedId, index) => {
                feedToPriceInfoObjectArg.set(feedId, priceInfoObjectTxArgs[index]);
            });
        } else {
            // This case should ideally not happen if positions/collaterals requiring price exist
            console.warn("No unique price feed IDs found for Pyth update.");
        }
        
        // 2. Collateral Value Assertion Object (CVAO)
        let cvao = txb.moveCall({
            target: `${PACKAGE_ID}::value_assertion_objects::start_collateral_value_assertion`,
            arguments: [txb.object(accountObjectId), txb.object(accountStatsId), txb.object(programId)],
        });

        for (const collateral of collaterals) {
            const priceInfoObjectStringId = feedToPriceInfoObjectArg.get(collateral.priceFeedIdBytes);
            if (!priceInfoObjectStringId) {
                throw new Error(`PriceInfoObject string ID not found for collateral feed ID: ${collateral.priceFeedIdBytes}`);
            }
            console.log(`[Liquidate Account] Using priceInfoObjectStringId for collateral ${collateral.collateralId} (feed: ${collateral.priceFeedIdBytes}):`, JSON.stringify(priceInfoObjectStringId, null, 2));
            cvao = txb.moveCall({
                target: `${PACKAGE_ID}::value_assertion_objects::set_collateral_value_assertion`,
                typeArguments: [collateral.coinType],
                arguments: [
                    cvao,
                    txb.object(programId),
                    txb.object(collateral.collateralId),
                    txb.object(collateral.markerId),
                    txb.object(priceInfoObjectStringId),
                    txb.object(SUI_CLOCK_OBJECT_ID)
                ],
            });
        }

        // 3. Position Value Assertion Object (PVAO)
        let pvao = txb.moveCall({
            target: `${PACKAGE_ID}::value_assertion_objects::start_position_value_assertion`,
            arguments: [txb.object(accountObjectId), txb.object(accountStatsId), txb.object(programId)],
        });

        for (const position of positions) {
            const priceInfoObjectStringId = feedToPriceInfoObjectArg.get(position.priceFeedIdBytes);
            if (!priceInfoObjectStringId) {
                throw new Error(`PriceInfoObject string ID not found for position feed ID: ${position.priceFeedIdBytes}`);
            }
            console.log(`[Liquidate Account] Using priceInfoObjectStringId for position ${position.id} (feed: ${position.priceFeedIdBytes}):`, JSON.stringify(priceInfoObjectStringId, null, 2));
            pvao = txb.moveCall({
                target: `${PACKAGE_ID}::value_assertion_objects::set_position_value_assertion`,
                arguments: [
                    pvao,
                    txb.object(programId),
                    txb.object(position.id),
                    txb.object(priceInfoObjectStringId),
                    txb.object(SUI_CLOCK_OBJECT_ID)
                ],
            });
        }

        // 4. Prepare arguments for liquidate_account_pyth
        const allPositionsArgs = txb.makeMoveVec({ elements: positions.map((p: any) => txb.object(p.id)) });
        const allCollateralMarkersArgs = txb.makeMoveVec({ elements: collaterals.map((c: any) => txb.object(c.markerId)) });
        const allVaultMarkersArgs = txb.makeMoveVec({ elements: vaultMarkerIds.map((id: string) => txb.object(id)) });

        // 5. Call liquidate_account_pyth
        txb.moveCall({
            target: `${PACKAGE_ID}::liquidation::liquidate_account_pyth`,
            arguments: [
                txb.object(accountStatsId),
                allPositionsArgs,
                cvao, // CollateralValueAssertionObject
                pvao, // PositionValueAssertionObject
                allCollateralMarkersArgs,
                allVaultMarkersArgs,
                txb.object(SUI_CLOCK_OBJECT_ID)
            ],
        });

        // 6. Destroy CollateralValueAssertionObject
        txb.moveCall({
            target: `${PACKAGE_ID}::value_assertion_objects::destroy_collateral_value_assertion`,
            arguments: [cvao], 
        });

        // 7. Destroy PositionValueAssertionObject
        txb.moveCall({
            target: `${PACKAGE_ID}::value_assertion_objects::destroy_position_value_assertion`,
            arguments: [pvao],
        });

        const result = await suiClient.signAndExecuteTransaction({
            signer: keypair,
            transaction: txb,
            options: { showEffects: true, showObjectChanges: true },
        });

        console.log('Account liquidation execution result:', JSON.stringify(result, null, 2));
        res.json({ success: true, transactionDigest: result.digest });

    } catch (error: any) {
        console.error('Error executing account liquidation:', error);
        res.status(500).json({ error: error.message || 'Failed to execute account liquidation' });
    }
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ 
        status: 'healthy', 
        service: 'liquidation-transfer-service',
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`Liquidation Transfer Service listening on port ${PORT}`);
    console.log(`Package ID: ${PACKAGE_ID}`);
    console.log(`RPC URL: ${SUI_RPC_URL}`);
});

// For graceful shutdown
process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    process.exit(0);
});