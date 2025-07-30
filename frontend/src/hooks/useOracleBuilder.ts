import { useState, useCallback } from 'react';
import { useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { useQueryClient } from '@tanstack/react-query';
import { SuiObjectRef } from '@mysten/sui/client';

import {
  createOracle,
  createPriceFeed,
  invalidateOracle,
  invalidatePriceFeed,
} from '@/lib/transactions/oracleBuilder';

import {
  PriceFeedFormData,
  OracleCreationResult,
  PriceFeedCreationResult,
} from '@/types/oracleBuilder';

import { ORACLE_BUILDER_CONFIG } from '@/config/oracleBuilder';
import { useOracleToasts } from '@/components/ui/ToastNotifications';

export interface UseOracleBuilderReturn {
  // State
  isCreatingOracle: boolean;
  isCreatingPriceFeed: boolean;
  
  // Actions
  createNewOracle: (name: string, description: string) => Promise<OracleCreationResult>;
  createNewPriceFeed: (
    oracle: SuiObjectRef,
    priceFeedData: PriceFeedFormData
  ) => Promise<PriceFeedCreationResult>;
  invalidateExistingOracle: (
    adminCap: SuiObjectRef,
    oracle: SuiObjectRef
  ) => Promise<{ success: boolean; transactionHash?: string; error?: string }>;
  invalidateExistingPriceFeed: (
    adminCap: SuiObjectRef,
    priceFeed: SuiObjectRef
  ) => Promise<{ success: boolean; transactionHash?: string; error?: string }>;
  
  // Utilities
  resetStates: () => void;
}

export function useOracleBuilder(): UseOracleBuilderReturn {
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  
  // Loading states
  const [isCreatingOracle, setIsCreatingOracle] = useState(false);
  const [isCreatingPriceFeed, setIsCreatingPriceFeed] = useState(false);

  const createNewOracle = useCallback(async (name: string, description: string): Promise<OracleCreationResult> => {
    if (!ORACLE_BUILDER_CONFIG.packageId) {
      return {
        success: false,
        error: 'Oracle Builder package ID not configured',
      };
    }

    setIsCreatingOracle(true);
    
    try {
      const result = await createOracle(
        {
          packageId: ORACLE_BUILDER_CONFIG.packageId,
          name,
          description,
        },
        signAndExecuteTransaction
      );
      
      return result;
    } finally {
      setIsCreatingOracle(false);
    }
  }, [signAndExecuteTransaction]);

  const createNewPriceFeed = useCallback(async (
    oracle: SuiObjectRef,
    priceFeedData: PriceFeedFormData
  ): Promise<PriceFeedCreationResult> => {
    if (!ORACLE_BUILDER_CONFIG.packageId) {
      return {
        success: false,
        error: 'Oracle Builder package ID not configured',
      };
    }

    setIsCreatingPriceFeed(true);
    
    try {
      const result = await createPriceFeed(
        {
          packageId: ORACLE_BUILDER_CONFIG.packageId,
          oracle,
          name: priceFeedData.name,
          description: priceFeedData.description,
          api_key: priceFeedData.api_key,
          api_key_config: priceFeedData.api_key_config,
          underlying_url: priceFeedData.underlying_url,
          response_field: priceFeedData.response_field,
          live_url: priceFeedData.live_url,
        },
        signAndExecuteTransaction
      );
      
      return result;
    } finally {
      setIsCreatingPriceFeed(false);
    }
  }, [signAndExecuteTransaction]);

  const invalidateExistingOracle = useCallback(async (
    adminCap: SuiObjectRef,
    oracle: SuiObjectRef
  ): Promise<{ success: boolean; transactionHash?: string; error?: string }> => {
    if (!ORACLE_BUILDER_CONFIG.packageId) {
      return {
        success: false,
        error: 'Oracle Builder package ID not configured',
      };
    }

    return await invalidateOracle(
      {
        packageId: ORACLE_BUILDER_CONFIG.packageId,
        adminCap,
        oracle,
      },
      signAndExecuteTransaction
    );
  }, [signAndExecuteTransaction]);

  const invalidateExistingPriceFeed = useCallback(async (
    adminCap: SuiObjectRef,
    priceFeed: SuiObjectRef
  ): Promise<{ success: boolean; transactionHash?: string; error?: string }> => {
    if (!ORACLE_BUILDER_CONFIG.packageId) {
      return {
        success: false,
        error: 'Oracle Builder package ID not configured',
      };
    }

    return await invalidatePriceFeed(
      {
        packageId: ORACLE_BUILDER_CONFIG.packageId,
        adminCap,
        priceFeed,
      },
      signAndExecuteTransaction
    );
  }, [signAndExecuteTransaction]);

  const resetStates = useCallback(() => {
    setIsCreatingOracle(false);
    setIsCreatingPriceFeed(false);
  }, []);

  return {
    // State
    isCreatingOracle,
    isCreatingPriceFeed,
    
    // Actions
    createNewOracle,
    createNewPriceFeed,
    invalidateExistingOracle,
    invalidateExistingPriceFeed,
    
    // Utilities
    resetStates,
  };
}
