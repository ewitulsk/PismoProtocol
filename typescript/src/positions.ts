const PACKAGE_ID: string = "0x9506016560aeb0f7b2b14d14f1e8b08ee5379f2dc4aceac074dddf4fbf1927db";

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

// Uncomment to run the example
createExamplePosition().catch(console.error);

