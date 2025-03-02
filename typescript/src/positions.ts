const PACKAGE_ID: string = "0xbf76691ffe3d2c01b41cef301c677e95778666aba5b00729acc4c5ef7e427afa";

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { bcs } from '@mysten/bcs';
import { getFullnodeUrl } from '@mysten/sui/client';
import * as dotenv from 'dotenv';

export enum PositionType {
  Long = 0,
  Short = 1
}

/**
 * Creates a new position using admin privileges
 * @param client SuiClient instance
 * @param keypair Keypair for signing the transaction
 * @param adminCapId Object ID of the AdminCap
 * @param globalId Object ID of the Global shared object
 * @param posType Position type (Long or Short)
 * @param amount Amount of the position
 * @param entryPrice Entry price of the position
 * @param entryPriceDecimals Number of decimals for the entry price
 * @param supportedPositionsTokenI Index of the supported positions token
 * @param accountId Account ID address
 * @param toAddress Address to transfer the position to
 * @returns Transaction digest
 */
export async function adminForceNewPosition(
  client: SuiClient,
  keypair: Ed25519Keypair,
  adminCapId: string,
  globalId: string,
  posType: PositionType,
  amount: number | bigint,
  leverage: number,
  entryPrice: number | bigint,
  entryPriceDecimals: number,
  supportedPositionsTokenI: number | bigint,
  accountId: string,
  toAddress: string
): Promise<string> {
  const tx = new Transaction();
  
  tx.moveCall({
    target: `${PACKAGE_ID}::positions::admin_force_new_positon`,
    arguments: [
      tx.object(adminCapId),
      tx.object(globalId),
      tx.pure(bcs.u64().serialize(BigInt(posType)).toBytes()),
      tx.pure(bcs.u64().serialize(BigInt(amount)).toBytes()),
      tx.pure(bcs.u16().serialize(leverage).toBytes()),
      tx.pure(bcs.u64().serialize(BigInt(entryPrice)).toBytes()),
      tx.pure(bcs.u8().serialize(entryPriceDecimals).toBytes()),
      tx.pure(bcs.u64().serialize(BigInt(supportedPositionsTokenI)).toBytes()),
      tx.pure.address(accountId),
      tx.pure.address(toAddress)
    ]
  });

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
  });

  return result.digest;
}

/**
 * Gets the Global object ID by fetching the first GlobalCreatedEvent emitted from the package
 * @param client SuiClient instance
 * @returns The Global object ID or null if not found
 */
export async function getGlobalObjectId(client: SuiClient): Promise<string | null> {
  try {
    // Query events of type GlobalCreatedEvent from our package
    const eventType = `${PACKAGE_ID}::main::GlobalCreatedEvent`;
    
    const eventsResponse = await client.queryEvents({
      query: {
        MoveEventType: eventType
      },
      order: 'descending', // Get newest first
      limit: 1 // We only need the first one
    });
    
    if (eventsResponse.data.length === 0) {
      console.log('No GlobalCreatedEvent found');
      return null;
    }
    
    // Extract the global_id from the event
    const event = eventsResponse.data[0];
    const parsedJson = event.parsedJson as { global_id: string };
    
    console.log(`Found Global object with ID: ${parsedJson.global_id}`);
    return parsedJson.global_id;
  } catch (error) {
    console.error('Error fetching GlobalCreatedEvent:', error);
    return null;
  }
}

/**
 * Example of how to use getGlobalObjectId
 */
export async function findGlobalObject() {
  // Load environment variables
  dotenv.config({ path: '.env' });
  
  // Initialize client
  const rpcUrl = getFullnodeUrl('testnet');
  const client = new SuiClient({ url: rpcUrl });
  
  // Get the Global object ID
  const globalId = await getGlobalObjectId(client);
  
  if (globalId) {
    console.log(`You can add this to your .env file: GLOBAL_OBJECT_ID=${globalId}`);
    return globalId;
  } else {
    console.log('No Global object found.');
    return null;
  }
}

/**
 * Example of how to use adminForceNewPosition
 */
export async function createExamplePosition() {
  // Load environment variables
  dotenv.config({ path: '.env' });
  
  // Initialize client and keypair
  const private_key = process.env.PRIVATE_KEY as string;
  const keypair = Ed25519Keypair.fromSecretKey(private_key);
  const rpcUrl = getFullnodeUrl('testnet');
  const client = new SuiClient({ url: rpcUrl });
  
  // Get the sender's address
  const sender = keypair.getPublicKey().toSuiAddress();
  
  // Find the admin cap
  const adminCap = `${PACKAGE_ID}::main::AdminCap`;
  const ownedAdminCaps = await client.getOwnedObjects({
    owner: sender,
    filter: {
      MatchAny: [{
        StructType: adminCap
      }]
    }
  });
  
  if (ownedAdminCaps.data.length === 0) {
    throw new Error('No admin cap found for this address');
  }
  
  const adminCapId = ownedAdminCaps.data[0].data?.objectId as string;
  console.log(`Using AdminCap: ${adminCapId}`);
  
  const globalId = await getGlobalObjectId(client) as string;

  // Create a new position
  const positionType = PositionType.Long;
  const amount = 1000000000; // 1 token with 9 decimals
  const leverage = 1;
  const entryPrice = 1500000000; // $1500 with 6 decimals
  const entryPriceDecimals = 6;
  const supportedPositionsTokenI = 0; // Index of the first supported token
  const accountId = sender; // Using sender as the account ID
  const toAddress = sender; // Transfer position to sender
  
  try {
    const txDigest = await adminForceNewPosition(
      client,
      keypair,
      adminCapId,
      globalId,
      positionType,
      amount,
      leverage,
      entryPrice,
      entryPriceDecimals,
      supportedPositionsTokenI,
      accountId,
      toAddress
    );
    
    console.log(`Successfully created position. Transaction digest: ${txDigest}`);
    return txDigest;
  } catch (error) {
    console.error('Error creating position:', error);
    throw error;
  }
}

/**
 * Adds a supported position token to the Global object
 * @param client SuiClient instance
 * @param keypair Keypair for signing the transaction
 * @param adminCapId Object ID of the AdminCap
 * @param globalId Object ID of the Global shared object
 * @param tokenInfo String identifier for the token
 * @param tokenDecimals Number of decimals for the token
 * @param priceFeedIdBytes Bytes for the price feed ID
 * @param oracleFeed Oracle feed identifier
 * @returns Transaction digest
 */
export async function addSupportedPosition(
  client: SuiClient,
  keypair: Ed25519Keypair,
  adminCapId: string,
  globalId: string,
  tokenInfo: string,
  tokenDecimals: number,
  priceFeedIdBytes: Uint8Array,
  oracleFeed: number
): Promise<string> {
  const tx = new Transaction();
  
  tx.moveCall({
    target: `${PACKAGE_ID}::main::add_supported_position`,
    arguments: [
      tx.object(adminCapId),
      tx.object(globalId),
      tx.pure(bcs.string().serialize(tokenInfo).toBytes()),
      tx.pure(bcs.u8().serialize(tokenDecimals).toBytes()),
      tx.pure(bcs.vector(bcs.u8()).serialize(Array.from(priceFeedIdBytes)).toBytes()),
      tx.pure(bcs.u16().serialize(oracleFeed).toBytes())
    ]
  });

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
  });

  return result.digest;
}

/**
 * Example of how to use addSupportedPosition
 */
export async function addExampleSupportedPosition() {
  // Load environment variables
  dotenv.config({ path: '.env' });
  
  // Initialize client and keypair
  const private_key = process.env.PRIVATE_KEY as string;
  const keypair = Ed25519Keypair.fromSecretKey(private_key);
  const rpcUrl = getFullnodeUrl('testnet');
  const client = new SuiClient({ url: rpcUrl });
  
  // Get the sender's address
  const sender = keypair.getPublicKey().toSuiAddress();
  
  // Find the admin cap
  const adminCap = `${PACKAGE_ID}::main::AdminCap`;
  const ownedAdminCaps = await client.getOwnedObjects({
    owner: sender,
    filter: {
      MatchAny: [{
        StructType: adminCap
      }]
    }
  });
  
  if (ownedAdminCaps.data.length === 0) {
    throw new Error('No admin cap found for this address');
  }
  
  const adminCapId = ownedAdminCaps.data[0].data?.objectId as string;
  console.log(`Using AdminCap: ${adminCapId}`);
  
  const globalId = await getGlobalObjectId(client) as string;
  
  // Add a new supported position
  const tokenInfo = `${PACKAGE_ID}::test_coin::TEST_COIN`.replace("0x", ""); // Replace with your actual token info
  const tokenDecimals = 10;
  const priceFeedIdBytes = Uint8Array.from(
    Buffer.from("50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266", 'hex')
  ); // Example ETH/USD Pyth price feed ID
  const oracleFeed = 0; // Oracle feed identifier
  
  try {
    const txDigest = await addSupportedPosition(
      client,
      keypair,
      adminCapId,
      globalId,
      tokenInfo,
      tokenDecimals,
      priceFeedIdBytes,
      oracleFeed
    );
    
    console.log(`Successfully added supported position. Transaction digest: ${txDigest}`);
    return txDigest;
  } catch (error) {
    console.error('Error adding supported position:', error);
    throw error;
  }
}

/**
 * Combined function that first adds a supported position and then creates a position
 */
export async function setupAndCreatePosition() {
  try {
    // First add a supported position
    console.log("Step 1: Adding a supported position...");
    const positionResult = await addExampleSupportedPosition();
    console.log(`Added supported position with digest: ${positionResult}`);
    
    // Then create a position using that token
    console.log("\nStep 2: Creating a position with the supported token...");
    const createResult = await createExamplePosition();
    console.log(`Created position with digest: ${createResult}`);
    
    return {
      addSupportedPositionDigest: positionResult,
      createPositionDigest: createResult
    };
  } catch (error) {
    console.error('Error in combined setup and position creation:', error);
    throw error;
  }
}

setupAndCreatePosition().catch(console.error);
