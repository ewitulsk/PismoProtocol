import { SuiTransactionBlockResponse, SuiObjectChange } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { SuiSignAndExecuteTransactionOutput } from '@mysten/wallet-standard';

import {
  CreateOracleParams,
  CreatePriceFeedParams,
  InvalidateOracleParams,
  InvalidatePriceFeedParams,
  OracleCreationResult,
  PriceFeedCreationResult,
} from '@/types/oracleBuilder';

import {
  ORACLE_BUILDER_MODULE,
  ORACLE_BUILDER_FUNCTIONS,
  ERROR_MESSAGES,
} from '@/config/oracleBuilder';

// Error handling types
export interface TransactionError {
  message: string;
  code?: string;
  details?: any;
}

export interface SignAndExecuteTransactionArgs {
  transaction: Transaction;
  options?: {
    showEffects?: boolean;
    showEvents?: boolean;
    showObjectChanges?: boolean;
  };
}

/**
 * Creates a new Oracle on the Sui blockchain
 */
export async function createOracle(
  params: CreateOracleParams,
  signAndExecuteTransaction: (args: SignAndExecuteTransactionArgs) => Promise<SuiSignAndExecuteTransactionOutput>
): Promise<OracleCreationResult> {
  try {
    const { packageId } = params;

    if (!packageId) {
      throw new Error('Package ID is required');
    }

    // Create transaction block
    const transaction = new Transaction();

    // Call the new_oracle function
    transaction.moveCall({
      target: `${packageId}::${ORACLE_BUILDER_MODULE}::${ORACLE_BUILDER_FUNCTIONS.NEW_ORACLE}`,
      arguments: [],
    });

    // Execute transaction
    const result = await signAndExecuteTransaction({
      transaction,
      options: {
        showEffects: true,
        showEvents: true,
        showObjectChanges: true,
      },
    });

    if (!result.digest) {
      throw new Error('Transaction failed: No digest returned');
    }

    // For now, we'll rely on events or separate queries to get the oracle ID
    // The transaction was successful if we have a digest
    return {
      success: true,
      oracleId: undefined, // Will be populated via events or queries
      transactionHash: result.digest,
    };

  } catch (error: any) {
    console.error('Error creating oracle:', error);
    
    let errorMessage = 'Transaction failed. Please try again.';
    
    if (error.message?.includes('Insufficient gas')) {
      errorMessage = 'Insufficient gas to complete transaction';
    } else if (error.message?.includes('wallet')) {
      errorMessage = 'Please connect your wallet first';
    } else if (error.message) {
      errorMessage = error.message;
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Creates a new PriceFeed for an existing Oracle
 */
export async function createPriceFeed(
  params: CreatePriceFeedParams,
  signAndExecuteTransaction: (args: SignAndExecuteTransactionArgs) => Promise<SuiSignAndExecuteTransactionOutput>
): Promise<PriceFeedCreationResult> {
  try {
    const { packageId, oracle, api_key, underlying_url, response_field, live_url } = params;

    if (!packageId || !oracle || !api_key || !underlying_url || !response_field || !live_url) {
      throw new Error('All parameters are required for creating a price feed');
    }

    // Validate URLs
    if (!isValidUrl(underlying_url) || !isValidUrl(live_url)) {
      throw new Error('Please enter a valid HTTP/HTTPS URL');
    }

    // Create transaction block
    const transaction = new Transaction();

    // Call the new_price_feed function
    transaction.moveCall({
      target: `${packageId}::${ORACLE_BUILDER_MODULE}::${ORACLE_BUILDER_FUNCTIONS.NEW_PRICE_FEED}`,
      arguments: [
        transaction.object(oracle.objectId),
        transaction.pure.string(api_key),
        transaction.pure.string(underlying_url),
        transaction.pure.string(response_field),
        transaction.pure.string(live_url),
      ],
    });

    // Execute transaction
    const result = await signAndExecuteTransaction({
      transaction,
      options: {
        showEffects: true,
        showEvents: true,
        showObjectChanges: true,
      },
    });

    if (!result.digest) {
      throw new Error('Transaction failed: No digest returned');
    }

    return {
      success: true,
      priceFeedId: undefined, // Will be populated via events or queries
      transactionHash: result.digest,
    };

  } catch (error: any) {
    console.error('Error creating price feed:', error);
    
    let errorMessage = 'Transaction failed. Please try again.';
    
    if (error.message?.includes('assert')) {
      if (error.message.includes('0')) {
        errorMessage = 'You are not authorized to perform this action';
      } else if (error.message.includes('1')) {
        errorMessage = 'Oracle is not valid';
      }
    } else if (error.message?.includes('Insufficient gas')) {
      errorMessage = 'Insufficient gas to complete transaction';
    } else if (error.message?.includes('wallet')) {
      errorMessage = 'Please connect your wallet first';
    } else if (error.message) {
      errorMessage = error.message;
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Invalidates an Oracle (Admin only)
 */
export async function invalidateOracle(
  params: InvalidateOracleParams,
  signAndExecuteTransaction: (args: SignAndExecuteTransactionArgs) => Promise<SuiSignAndExecuteTransactionOutput>
): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
  try {
    const { packageId, adminCap, oracle } = params;

    if (!packageId || !adminCap || !oracle) {
      throw new Error('Package ID, admin capability, and oracle are required');
    }

    // Create transaction block
    const transaction = new Transaction();

    // Call the invalidate_oracle function
    transaction.moveCall({
      target: `${packageId}::${ORACLE_BUILDER_MODULE}::${ORACLE_BUILDER_FUNCTIONS.INVALIDATE_ORACLE}`,
      arguments: [
        transaction.object(adminCap.objectId),
        transaction.object(oracle.objectId),
      ],
    });

    // Execute transaction
    const result = await signAndExecuteTransaction({
      transaction,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });

    if (!result.digest) {
      throw new Error('Transaction failed: No digest returned');
    }

    return {
      success: true,
      transactionHash: result.digest,
    };

  } catch (error: any) {
    console.error('Error invalidating oracle:', error);
    
    let errorMessage = 'Transaction failed. Please try again.';
    
    if (error.message?.includes('Insufficient gas')) {
      errorMessage = 'Insufficient gas to complete transaction';
    } else if (error.message?.includes('wallet')) {
      errorMessage = 'Please connect your wallet first';
    } else if (error.message) {
      errorMessage = error.message;
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Invalidates a PriceFeed (Admin only)
 */
export async function invalidatePriceFeed(
  params: InvalidatePriceFeedParams,
  signAndExecuteTransaction: (args: SignAndExecuteTransactionArgs) => Promise<SuiSignAndExecuteTransactionOutput>
): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
  try {
    const { packageId, adminCap, priceFeed } = params;

    if (!packageId || !adminCap || !priceFeed) {
      throw new Error('Package ID, admin capability, and price feed are required');
    }

    // Create transaction block
    const transaction = new Transaction();

    // Call the invalidate_price_feed function
    transaction.moveCall({
      target: `${packageId}::${ORACLE_BUILDER_MODULE}::${ORACLE_BUILDER_FUNCTIONS.INVALIDATE_PRICE_FEED}`,
      arguments: [
        transaction.object(adminCap.objectId),
        transaction.object(priceFeed.objectId),
      ],
    });

    // Execute transaction
    const result = await signAndExecuteTransaction({
      transaction,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });

    if (!result.digest) {
      throw new Error('Transaction failed: No digest returned');
    }

    return {
      success: true,
      transactionHash: result.digest,
    };

  } catch (error: any) {
    console.error('Error invalidating price feed:', error);
    
    let errorMessage = 'Transaction failed. Please try again.';
    
    if (error.message?.includes('Insufficient gas')) {
      errorMessage = 'Insufficient gas to complete transaction';
    } else if (error.message?.includes('wallet')) {
      errorMessage = 'Please connect your wallet first';
    } else if (error.message) {
      errorMessage = error.message;
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Utility function to validate URLs
 */
function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}
