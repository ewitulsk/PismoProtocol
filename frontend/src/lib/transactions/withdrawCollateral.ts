import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { SuiSignAndExecuteTransactionOutput } from '@mysten/wallet-standard';
import { parseUnits } from 'viem';
import { bcs } from '@mysten/sui/bcs';
import type { MinimalAccountInfo, NotificationState, SupportedCollateralToken, SignAndExecuteTransactionArgs, SignAndExecuteTransactionError, DepositedCollateralDetail } from './depositCollateral'; // Re-use types

export interface WithdrawCollateralParams {
  account: MinimalAccountInfo;
  accountObjectId: string;
  accountStatsId: string;
  packageId: string;
  programId: string;
  selectedWithdrawTokenInfo: string;
  withdrawAmount: string;
  collateralObjects: DepositedCollateralDetail[]; // NEW: Array of collateral objects for the token
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
    collateralObjects, // New param
    supportedCollateral,
    suiClient, 
    signAndExecuteTransaction,
  } = params;

  const selectedToken = supportedCollateral.find(t => t.fields.token_info === selectedWithdrawTokenInfo);

  if (!account || !accountObjectId || !accountStatsId || !packageId || !programId || !selectedWithdrawTokenInfo || !withdrawAmount || !selectedToken || !collateralObjects || collateralObjects.length === 0) {
    callbacks.setNotification({ show: true, message: "Missing required parameters or no collateral objects found for withdrawal.", type: 'error' });
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
    // Validate against total deposited balance for this token type
    const totalDepositedRaw = collateralObjects.reduce((sum, obj) => sum + obj.rawAmount, BigInt(0));
    if (withdrawAmountBigInt > totalDepositedRaw) {
        throw new Error(`Withdrawal amount exceeds total deposited balance for ${selectedToken.name}.`);
    }

  } catch (e) {
    callbacks.setNotification({ show: true, message: `Invalid withdrawal amount: ${e instanceof Error ? e.message : String(e)}`, type: 'error' });
    callbacks.setIsLoadingTx(false);
    return;
  }

  console.log("Initiating withdrawal:", {
    account: account.address,
    tokenType: selectedWithdrawTokenInfo,
    amount: withdrawAmountBigInt.toString(),
    numberOfCollateralObjects: collateralObjects.length,
    collateralObjectIds: collateralObjects.map(co => ({collateral: co.collateralId, marker: co.markerId})),
  });

  try {
    const txb = new Transaction();

    if (collateralObjects.length === 1) {
      // Case 1: Single collateral object
      const co = collateralObjects[0];
      txb.moveCall({
        target: `${packageId}::collateral::withdraw_collateral`,
        typeArguments: [selectedWithdrawTokenInfo],
        arguments: [
          txb.object(co.collateralId),
          txb.object(co.markerId),
          txb.pure(bcs.u64().serialize(withdrawAmountBigInt).toBytes()),
          txb.object(accountStatsId),
          // ctx is automatically passed by the wallet adapter
        ],
      });
      console.log(`Withdrawal from single collateral object: ${co.collateralId}, marker: ${co.markerId}`);
    } else if (collateralObjects.length >= 2) {
      // Case 2 & 3: Two or more collateral objects - requires combination
      let combinedCollateralArg = txb.moveCall({
        target: `${packageId}::collateral::combine_collateral`,
        typeArguments: [selectedWithdrawTokenInfo],
        arguments: [
          txb.object(collateralObjects[0].collateralId),
          txb.object(collateralObjects[0].markerId),
          txb.object(collateralObjects[1].collateralId),
          txb.object(collateralObjects[1].markerId),
          txb.object(accountStatsId),
          // ctx is automatically passed
        ],
      });
      console.log(`Combined first two collateral objects. IDs: ${collateralObjects[0].collateralId}, ${collateralObjects[1].collateralId}`);

      for (let i = 2; i < collateralObjects.length; i++) {
        const nextCollateral = collateralObjects[i];
        combinedCollateralArg = txb.moveCall({
          target: `${packageId}::collateral::combine_collateral_w_combine_collateral`,
          typeArguments: [selectedWithdrawTokenInfo],
          arguments: [
            txb.object(nextCollateral.collateralId),
            txb.object(nextCollateral.markerId),
            combinedCollateralArg, // Result from previous combination
            txb.object(accountStatsId),
            // ctx
          ],
        });
        console.log(`Combined with next collateral object: ${nextCollateral.collateralId}`);
      }

      // After all combinations, withdraw from the final combined object
      txb.moveCall({
        target: `${packageId}::collateral::withdraw_from_combined_collateral`,
        typeArguments: [selectedWithdrawTokenInfo],
        arguments: [
          combinedCollateralArg, // The final combined collateral object (hot potato)
          txb.pure(bcs.u64().serialize(withdrawAmountBigInt).toBytes()),
          txb.object(accountStatsId),
          // ctx
        ],
      });
      console.log(`Withdrawing from final combined collateral object.`);
    }
    
    console.log("Withdrawal transaction block prepared for token:", selectedToken.name, "amount:", withdrawAmount);

    signAndExecuteTransaction(
        { transaction: txb }, 
        {
          onSuccess: (result) => {
            callbacks.setNotification({
              show: true,
              message: `Successfully initiated withdrawal of ${withdrawAmount} ${selectedToken.name}.`,
              type: 'success',
              digest: result.digest,
            });
            if (callbacks.clearForm) callbacks.clearForm();
            callbacks.setIsLoadingTx(false);
          },
          onError: (error) => {
            callbacks.setNotification({
              show: true,
              message: `Error withdrawing: ${error.message}`,
              type: 'error',
            });
            callbacks.setIsLoadingTx(false);
          },
        }
      );

  } catch (error) {
    console.error('Error in withdrawCollateral:', error);
    callbacks.setNotification({
      show: true,
      message: `Error preparing withdrawal: ${error instanceof Error ? error.message : String(error)}`,
      type: 'error',
    });
    callbacks.setIsLoadingTx(false);
  }
}; 