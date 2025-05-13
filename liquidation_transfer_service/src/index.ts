import express, { Request, Response } from 'express';
import { Transaction } from '@mysten/sui/transactions';
import { suiClient, keypair } from './sui-client';
import { PACKAGE_ID, LIQUIDATION_SERVICE_PORT, SUI_RPC_URL } from './config';
// Import necessary types for the sui_queryObjects RPC call parameters
import { SuiObjectDataOptions, SuiObjectResponseQuery, PaginatedObjectsResponse, SuiObjectResponse } from '@mysten/sui/client';

const app = express();
app.use(express.json());

const PORT = LIQUIDATION_SERVICE_PORT || 3000;

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