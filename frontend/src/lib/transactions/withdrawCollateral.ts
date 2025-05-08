import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { SuiSignAndExecuteTransactionOutput } from '@mysten/wallet-standard';
import { parseUnits } from 'viem';
import type { MinimalAccountInfo, NotificationState, SupportedCollateralToken, SignAndExecuteTransactionArgs, SignAndExecuteTransactionError } from './depositCollateral'; // Re-use types

export interface WithdrawCollateralParams {
  account: MinimalAccountInfo;
  accountObjectId: string;
  accountStatsId: string;
  packageId: string;
  programId: string;
  selectedWithdrawTokenInfo: string;
  withdrawAmount: string;
  supportedCollateral: SupportedCollateralToken[]; // To get decimals
  suiClient: SuiClient;
  signAndExecuteTransaction: (
    variables: SignAndExecuteTransactionArgs,
    options?: {
        onSuccess?: (result: SuiSignAndExecuteTransactionOutput) => void;
        onError?: (error: SignAndExecuteTransactionError) => void;
    }
  ) => void;
  // No devInspect for withdraw in this example, but could be added
}

export interface WithdrawCollateralCallbacks {
  setNotification: (notification: NotificationState) => void;
  setIsLoadingTx: (isLoading: boolean) => void;
  clearForm?: () => void;
}

export const withdrawCollateral = async (
  params: WithdrawCollateralParams,
  callbacks: WithdrawCollateralCallbacks
): Promise<void> => {
  callbacks.setNotification(null);
  callbacks.setIsLoadingTx(true);

  const {
    account,
    accountObjectId,
    accountStatsId,
    packageId,
    programId,
    selectedWithdrawTokenInfo,
    withdrawAmount,
    supportedCollateral,
    // suiClient, // Not used in placeholder, but would be for real tx
    signAndExecuteTransaction,
  } = params;

  const selectedToken = supportedCollateral.find(t => t.fields.token_info === selectedWithdrawTokenInfo);

  if (!account || !accountObjectId || !accountStatsId || !packageId || !programId || !selectedWithdrawTokenInfo || !withdrawAmount || !selectedToken) {
    callbacks.setNotification({ show: true, message: "Missing required parameters for withdrawal.", type: 'error' });
    callbacks.setIsLoadingTx(false);
    return;
  }

  const decimals = selectedToken.fields.token_decimals;
  let withdrawAmountBigInt: bigint;
  try {
    withdrawAmountBigInt = parseUnits(withdrawAmount, decimals);
    if (withdrawAmountBigInt <= BigInt(0)) {
      throw new Error("Withdrawal amount must be positive.");
    }
    // TODO: Add validation against deposited balance if necessary (though UI might do this)
  } catch (e) {
    callbacks.setNotification({ show: true, message: `Invalid withdrawal amount: ${e instanceof Error ? e.message : String(e)}`, type: 'error' });
    callbacks.setIsLoadingTx(false);
    return;
  }

  console.log("Initiating withdrawal:", {
    account: account.address,
    tokenType: selectedWithdrawTokenInfo,
    amount: withdrawAmountBigInt.toString(),
  });

  try {
    const txb = new Transaction();
    // Placeholder for withdraw transaction call
    // Example: txb.moveCall({
    // target: `${packageId}::collateral::withdraw_collateral`,
    // typeArguments: [selectedWithdrawTokenInfo],
    // arguments: [
    // txb.object(accountObjectId),
    // txb.object(accountStatsId),
    // txb.object(programId),
    // txb.pure(withdrawAmountBigInt.toString()), // Or however the amount is passed
    // ],
    // });
    console.log("Withdrawal transaction block (placeholder) prepared for token:", selectedToken.name, "amount:", withdrawAmount);
    
    // Simulate a call to a placeholder transaction
    // In a real scenario, you would build and execute the transaction here.
    // For now, we'll just show a success message after a delay.

    // This part would call signAndExecuteTransaction
    // For the placeholder, we'll skip the actual call and directly use callbacks.
    /*
    signAndExecuteTransaction(
        { transaction: txb }, 
        {
          onSuccess: (result) => {
            callbacks.setNotification({
              show: true,
              message: `Placeholder: Successfully withdrew ${withdrawAmount} ${selectedToken.name}.`,
              type: 'success',
              digest: result.digest,
            });
            if (callbacks.clearForm) callbacks.clearForm();
            callbacks.setIsLoadingTx(false);
          },
          onError: (error) => {
            callbacks.setNotification({
              show: true,
              message: `Placeholder: Error withdrawing: ${error.message}`,
              type: 'error',
            });
            callbacks.setIsLoadingTx(false);
          },
        }
      );
    */

    // Simulate asynchronous operation for placeholder
    await new Promise(resolve => setTimeout(resolve, 1000));
    callbacks.setNotification({
        show: true,
        message: `Placeholder: Would withdraw ${withdrawAmount} ${selectedToken.name}. Transaction not sent.`,
        type: 'info',
    });
    if (callbacks.clearForm) callbacks.clearForm();
    callbacks.setIsLoadingTx(false);

  } catch (error) {
    console.error('Error in placeholder withdrawCollateral:', error);
    callbacks.setNotification({
      show: true,
      message: `Error preparing withdrawal: ${error instanceof Error ? error.message : String(error)}`,
      type: 'error',
    });
    callbacks.setIsLoadingTx(false);
  }
}; 