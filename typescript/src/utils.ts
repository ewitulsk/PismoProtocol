import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { NETWORK, OBJECT_TYPES } from './constants';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({ path: '.env' });

/**
 * Creates a Sui client connected to the configured network
 * @returns A SuiClient instance
 */
export function createClient(): SuiClient {
    const rpcUrl = getFullnodeUrl(NETWORK);
    return new SuiClient({ url: rpcUrl });
}

/**
 * Creates a keypair from the private key in environment variables
 * @returns An Ed25519Keypair instance
 */
export function createKeypair(): Ed25519Keypair {
    const privateKey = process.env.PRIVATE_KEY as string;
    if (!privateKey) {
        throw new Error("Private key not found in environment variables");
    }
    return Ed25519Keypair.fromSecretKey(privateKey);
}

/**
 * Gets the sender's address from the keypair
 * @returns The sender's address
 */
export function getSenderAddress(): string {
    return createKeypair().getPublicKey().toSuiAddress();
}

/**
 * Fetches objects of a specific type owned by the sender
 * @param structType The type of object to fetch
 * @returns An array of object IDs
 */
export async function fetchOwnedObjects(structType: string): Promise<string[]> {
    const client = createClient();
    const sender = getSenderAddress();
    
    const objects = await client.getOwnedObjects({
        owner: sender,
        filter: {
            MatchAll: [
                {
                    StructType: structType
                }
            ]
        }
    });
    
    if (objects.data.length === 0) {
        throw new Error(`No objects of type ${structType} found in wallet`);
    }
    
    return objects.data.map(obj => obj.data?.objectId as string);
}

/**
 * Fetches the AdminCap object owned by the sender
 * @returns The AdminCap object ID
 */
export async function fetchAdminCap(): Promise<string> {
    try {
        const adminCaps = await fetchOwnedObjects(OBJECT_TYPES.ADMIN_CAP);
        console.log(`Found AdminCap: ${adminCaps[0]}`);
        return adminCaps[0];
    } catch (error) {
        console.error("Error fetching AdminCap:", error);
        throw error;
    }
}

/**
 * Fetches the Account object owned by the sender
 * @returns The Account object ID
 */
export async function fetchAccount(): Promise<string> {
    try {
        const accounts = await fetchOwnedObjects(OBJECT_TYPES.ACCOUNT);
        console.log(`Found Account: ${accounts[0]}`);
        return accounts[0];
    } catch (error) {
        console.error("Error fetching Account:", error);
        throw error;
    }
}

/**
 * Fetches coins of a specific type owned by the sender
 * @param coinType The type of coin to fetch
 * @returns An array of coin object IDs
 */
export async function fetchCoins(coinType: string): Promise<string[]> {
    const coin = `0x2::coin::Coin<${coinType}>`;
    try {
        const coins = await fetchOwnedObjects(coin);
        console.log(`Found ${coins.length} coins of type ${coinType}`);
        return coins;
    } catch (error) {
        console.error(`Error fetching coins of type ${coinType}:`, error);
        throw error;
    }
} 