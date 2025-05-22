import { SuiClient, DevInspectResults } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { SuiSignAndExecuteTransactionOutput } from '@mysten/wallet-standard';
import { parseUnits, formatUnits } from 'viem';

// These types are often part of the hook's interface directly or its options.
// If not directly importable, they might be inline or aliased from a base library.
// For now, we'll define them based on common usage with such hooks.
export type SignAndExecuteTransactionArgs = {
    transaction: Transaction;
    // SuiSignAndExecuteTransactionOptions from '@mysten/sui/wallet': (e.g., requestType)
    // This might be part of a different options layer in dapp-kit
    options?: Record<string, any>; 
};

// A generic error type, can be refined if a specific one is known from dapp-kit for this hook
export type SignAndExecuteTransactionError = Error;

export interface MinimalAccountInfo {
    address: string;
}

export type NotificationState = {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
  digest?: string;
} | null;

export type SupportedCollateralToken = {
  type: string;
  fields: {
    token_info: string;
    token_decimals: number;
    price_feed_id_bytes: number[];
    price_feed_id_bytes_hex: string;
    oracle_feed: number;
    deprecated: boolean;
  };
  name: string;
};

export interface DepositCollateralParams {
  account: MinimalAccountInfo;
  accountObjectId: string;
  accountStatsId: string;
  packageId: string;
  programId: string;
  selectedDepositTokenInfo: string;
  depositAmount: string;
  supportedCollateral: SupportedCollateralToken[];
  userWalletBalances: Record<string, string>;
  suiClient: SuiClient;
  // This is the mutate function from useSignAndExecuteTransaction
  signAndExecuteTransaction: (
    variables: SignAndExecuteTransactionArgs, // First argument: variables (e.g., the transaction block)
    options?: { // Second argument: callbacks
        onSuccess?: (result: SuiSignAndExecuteTransactionOutput) => void;
        onError?: (error: SignAndExecuteTransactionError) => void;
        // onSettled?: (data: SuiSignAndExecuteTransactionOutput | undefined, error: SignAndExecuteTransactionError | undefined) => void;
    }
  ) => void; 
  enableDevInspect: boolean;
}

export interface DepositedCollateralDetail {
    collateralId: string; // Hex string object ID of the Collateral<CoinType>
    markerId: string;     // Hex string object ID of the CollateralMarker
    tokenInfo: string;    // Full coin type, e.g., "0x2::sui::SUI"
    amount: string;       // Formatted amount as string for display (individual object's amount)
    rawAmount: bigint;    // Raw amount as bigint for calculations (individual object's amount)
    priceFeedIdBytes?: string; // Optional: Hex string of the price feed ID
}

export interface DepositCollateralCallbacks {
  setNotification: (notification: NotificationState) => void;
  setIsLoadingTx: (isLoading: boolean) => void;
  // These are now invoked by the onSuccess/onError passed to signAndExecuteTransaction directly
  // onTxSuccess?: (result: SuiSignAndExecuteTransactionOutput) => void; 
  // onInspectSuccess?: (result: DevInspectResults) => void; 
  // onTxError?: (error: SignAndExecuteTransactionError) => void;
  clearForm?: () => void;
}

export const depositCollateral = async (
  params: DepositCollateralParams,
  callbacks: DepositCollateralCallbacks
): Promise<void> => {
  callbacks.setNotification(null);
  callbacks.setIsLoadingTx(true);

  const {
    account,
    accountObjectId,
    accountStatsId,
    packageId,
    programId,
    selectedDepositTokenInfo,
    depositAmount,
    supportedCollateral,
    userWalletBalances,
    suiClient,
    signAndExecuteTransaction, // This is the mutate function
    enableDevInspect,
  } = params;

  const selectedToken = supportedCollateral.find(t => t.fields.token_info === selectedDepositTokenInfo);
  if (!account || !accountObjectId || !accountStatsId || !packageId || !programId || !selectedDepositTokenInfo || !depositAmount || !selectedToken) {
    callbacks.setNotification({ show: true, message: "Missing required parameters for deposit.", type: 'error' });
    callbacks.setIsLoadingTx(false);
    return;
  }
  
  const decimals = selectedToken.fields.token_decimals;
  let depositAmountBigInt: bigint;
  try {
    depositAmountBigInt = parseUnits(depositAmount, decimals);
    if (depositAmountBigInt <= BigInt(0)) throw new Error("Deposit amount must be positive.");
    const walletBalanceStr = userWalletBalances[selectedDepositTokenInfo] || '0.0';
    const walletBalanceBigInt = parseUnits(walletBalanceStr, decimals);
    if (depositAmountBigInt > walletBalanceBigInt) {
       throw new Error(`Insufficient wallet balance (${walletBalanceStr} ${selectedToken.name})`);
    }
  } catch (e) {
    callbacks.setNotification({ show: true, message: `Invalid deposit amount: ${e instanceof Error ? e.message : String(e)}`, type: 'error' });
    callbacks.setIsLoadingTx(false);
    return;
  }

  console.log("Initiating deposit/inspect:", {
    mode: enableDevInspect ? 'DevInspect' : 'Execute',
    account: account.address,
    accountObjectId,
    accountStatsId,
    tokenType: selectedDepositTokenInfo,
    amount: depositAmount,
    amountBigInt: depositAmountBigInt.toString(),
    decimals,
    packageId,
    programId,
  });

  try {
    const txb = new Transaction();
    let coinToDeposit;
    const suiCoinType = '0x2::sui::SUI';

    if (selectedDepositTokenInfo === suiCoinType) {
        [coinToDeposit] = txb.splitCoins(txb.gas, [depositAmountBigInt]);
    } else {
        const { data: coins } = await suiClient.getCoins({ owner: account.address, coinType: selectedDepositTokenInfo });
        if (!coins || coins.length === 0) throw new Error(`No '${selectedToken.name}' coin objects found.`);
        const sourceCoin = coins.find(c => BigInt(c.balance) >= depositAmountBigInt);
        if (sourceCoin) {
            [coinToDeposit] = txb.splitCoins(txb.object(sourceCoin.coinObjectId), [depositAmountBigInt]);
        } else {
            const availableBalance = coins.reduce((sum, c) => sum + BigInt(c.balance), BigInt(0));
            if (availableBalance >= depositAmountBigInt) {
                const primaryCoin = coins[0];
                const coinsToMerge = coins.slice(1);
                txb.mergeCoins(txb.object(primaryCoin.coinObjectId), coinsToMerge.map(c => txb.object(c.coinObjectId)));
                [coinToDeposit] = txb.splitCoins(txb.object(primaryCoin.coinObjectId), [depositAmountBigInt]);
            } else {
                throw new Error(`Insufficient total balance (${formatUnits(availableBalance, decimals)} ${selectedToken.name}) across all coin objects.`);
            }
        }
    }
    txb.moveCall({
        target: `${packageId}::collateral::post_collateral`,
        typeArguments: [selectedDepositTokenInfo],
        arguments: [
            txb.object(accountObjectId),
            txb.object(accountStatsId),
            txb.object(programId),
            coinToDeposit,
        ],
    });
    console.log("Transaction block prepared.");

    if (enableDevInspect) {
      console.log("Attempting devInspectTransactionBlock...");
      try {
        const inspectResult = await suiClient.devInspectTransactionBlock({
          sender: account.address,
          transactionBlock: txb,
        });
        console.log("devInspectTransactionBlock Result:", inspectResult);
        if (inspectResult.error) {
          callbacks.setNotification({ show: true, message: `Dev Inspect Failed: ${inspectResult.error}.`, type: 'error' });
        } else {
          callbacks.setNotification({ show: true, message: `Dev Inspect Succeeded.`, type: 'info', digest: inspectResult.effects.transactionDigest });
          // if (callbacks.onInspectSuccess) callbacks.onInspectSuccess(inspectResult); // No longer passing separate onInspectSuccess
          if (callbacks.clearForm) callbacks.clearForm();
        }
      } catch (inspectError) {
        callbacks.setNotification({ show: true, message: `Error during inspection: ${inspectError instanceof Error ? inspectError.message : String(inspectError)}`, type: 'error' });
      } finally {
        callbacks.setIsLoadingTx(false);
      }
    } else {
      console.log("Attempting signAndExecuteTransaction...");
      signAndExecuteTransaction(
        { transaction: txb }, 
        {
          onSuccess: (result: SuiSignAndExecuteTransactionOutput) => {
            console.log('Collateral deposit successful!', result);
            callbacks.setNotification({
              show: true,
              message: `Successfully deposited ${depositAmount} ${selectedToken.name}.`,
              type: 'success',
              digest: result.digest,
            });
            // if (callbacks.onTxSuccess) callbacks.onTxSuccess(result); // No longer passing separate onTxSuccess
            if (callbacks.clearForm) callbacks.clearForm();
            callbacks.setIsLoadingTx(false);
          },
          onError: (error: SignAndExecuteTransactionError) => {
            console.error('Error depositing collateral:', error);
            callbacks.setNotification({
              show: true,
              message: `Error depositing collateral: ${error.message}`,
              type: 'error',
            });
            // if (callbacks.onTxError) callbacks.onTxError(error); // No longer passing separate onTxError
            callbacks.setIsLoadingTx(false);
          },
        }
      );
    }
  } catch (error) {
    console.error('Error constructing deposit transaction or pre-flight checks:', error);
    callbacks.setNotification({
        show: true,
        message: `Error preparing deposit: ${error instanceof Error ? error.message : String(error)}`,
        type: 'error',
    });
    callbacks.setIsLoadingTx(false);
  }
}; 