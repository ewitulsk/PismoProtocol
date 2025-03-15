import { SuiPriceServiceConnection, SuiPythClient } from "@pythnetwork/pyth-sui-js";
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/bcs';
import { 
    SUI_PACKAGE_ID, 
    GLOBAL_OBJECT_ID,
    COIN_TYPES, 
    LP_TOKEN_TYPES,
    PRICE_FEED_IDS,
    VAULt_IDS
} from './constants';
import {
    createClient,
    createKeypair,
    fetchAdminCap,
    fetchCoins
} from './utils';

/**
 * Initializes a new LP vault for a specific coin type
 * @param coinType The type of coin for the vault (e.g., "0x...::btc::BTC")
 * @param lpType The type of LP token to create (e.g., "0x...::lp_token::BTC_LP")
 * @param priceFeedId The Pyth price feed ID for the coin
 * @returns The transaction result
 */
export async function initLPVault(coinType: string, lpType: string, priceFeedId: string) {
    // Get the client and keypair
    const client = createClient();
    const keypair = createKeypair();
    
    // Fetch the AdminCap and Global object
    const adminCapId = await fetchAdminCap();    
    // Convert price feed ID to bytes
    const priceFeedBytes = Buffer.from(priceFeedId, 'hex');
    
    // Create a transaction to initialize the LP vault
    const tx = new Transaction();
    
    // Call the init_lp_vault function
    tx.moveCall({
        target: `${SUI_PACKAGE_ID}::lp::init_lp_vault`,
        typeArguments: [coinType, lpType],
        arguments: [
            tx.object(adminCapId), // AdminCap
            tx.object(GLOBAL_OBJECT_ID), // Global object
            tx.pure(bcs.vector(bcs.u8()).serialize(Array.from(priceFeedBytes)).toBytes()) // Price feed bytes
        ],
    });
    
    // Sign and execute the transaction
    const result = await client.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
    });
    
    console.log(`LP Vault initialized. Digest: ${result.digest}`);
    console.log(`Transaction status: ${result.effects?.status?.status}`);
    
    return result;
}

/**
 * Deposits a coin into an LP vault and receives LP tokens in return
 * @param coinType The type of coin to deposit (e.g., "0x...::test_coin::TEST_COIN")
 * @param lpType The type of LP token to receive (e.g., "0x...::lp_token::LP_TOKEN")
 * @param amount The amount of coins to deposit
 * @param vaultObjectId The ID of the Vault object
 * @returns The transaction result
 */
export async function depositLP(coinType: string, lpType: string, amount: number, vaultObjectId: string) {
    // Get the client and keypair
    const client = createClient();
    const keypair = createKeypair();
    
    // Fetch the Global object and coins
    const coinIds = await fetchCoins(coinType);
    
    if (coinIds.length === 0) {
        throw new Error(`No coins of type ${coinType} found in wallet`);
    }
    
    // Create a transaction to deposit coins into the LP vault
    const tx = new Transaction();
    
    // Get the coin object and split the desired amount
    const coinObj = tx.object(coinIds[0]);
    const [coinToDeposit] = tx.splitCoins(coinObj, [amount]);
    
    // Call the deposit_lp function
    tx.moveCall({
        target: `${SUI_PACKAGE_ID}::lp::deposit_lp`,
        typeArguments: [coinType, lpType],
        arguments: [
            tx.object(GLOBAL_OBJECT_ID),
            tx.object(vaultObjectId),
            tx.object(coinToDeposit)
        ],
    });
    
    // Sign and execute the transaction
    const result = await client.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
    });
    
    console.log(`Transaction executed. Digest: ${result.digest}`);
    console.log(`Transaction status: ${result.effects?.status?.status}`);
    
    return result;
}

/**
 * Withdraws LP tokens and receives the underlying coins in return
 * @param coinType The type of coin to receive (e.g., "0x...::test_coin::TEST_COIN")
 * @param lpType The type of LP token to withdraw (e.g., "0x...::lp_token::LP_TOKEN")
 * @param amount The amount of LP tokens to withdraw
 * @param vaultObjectId The ID of the Vault object
 * @returns The transaction result
 */
export async function withdrawLP(coinType: string, lpType: string, amount: number, vaultObjectId: string) {
    // Get the client and keypair
    const client = createClient();
    const keypair = createKeypair();
    
    // Find the LP tokens of the specified type owned by the sender
    const lpToken = `0x2::coin::Coin<${SUI_PACKAGE_ID}::lp::LPToken<${lpType}>>`;
    const lpTokenIds = await fetchCoins(`${SUI_PACKAGE_ID}::lp::LPToken<${lpType}>`);
    
    if (lpTokenIds.length === 0) {
        throw new Error(`No LP tokens of type ${lpType} found in wallet`);
    }
        
    // Create a transaction to withdraw LP tokens
    const tx = new Transaction();
    
    // Get the LP token object and split the desired amount
    const lpTokenObj = tx.object(lpTokenIds[0]);
    const [lpTokenToWithdraw] = tx.splitCoins(lpTokenObj, [amount]);
    
    // Call the withdraw_lp function
    tx.moveCall({
        target: `${SUI_PACKAGE_ID}::lp::withdraw_lp`,
        typeArguments: [coinType, lpType],
        arguments: [
            tx.object(GLOBAL_OBJECT_ID),
            tx.object(vaultObjectId),
            tx.object(lpTokenToWithdraw)
        ],
    });
    
    // Sign and execute the transaction
    const result = await client.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
    });
    
    console.log(`Withdrawal executed. Digest: ${result.digest}`);
    console.log(`Transaction status: ${result.effects?.status?.status}`);
    
    return result;
}

// Example usage
async function main() {
    try {
        console.log("Fetching AdminCap...");
        const adminCapId = await fetchAdminCap();
        console.log(`AdminCap ID: ${adminCapId}`);
        
        // Example for initializing a BTC LP vault
        // console.log("Initializing BTC LP vault...");
        // await initLPVault(
        //     COIN_TYPES.BTC,
        //     COIN_TYPES.BTC,
        //     PRICE_FEED_IDS.BTC
        // );
        
        // Example for depositing to an LP vault
        console.log("Depositing to BTC LP vault...");
        await depositLP(
            COIN_TYPES.BTC,
            COIN_TYPES.BTC,
            1000, // Amount to deposit
            VAULt_IDS.BTC
        );
        
        // Example for withdrawing from an LP vault
        // console.log("Withdrawing from BTC LP vault...");
        // await withdrawLP(
        //     COIN_TYPES.BTC,
        //     LP_TOKEN_TYPES.BTC_LP,
        //     500, // Amount of LP tokens to withdraw
        //     btcVaultId
        // );
    } catch (error) {
        console.error("Error:", error);
    }
}

// Uncomment to run the example
main().catch(console.error);

// Export the functions for use in other modules
export { main };
