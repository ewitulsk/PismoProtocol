'use client';

import React, { useState, useEffect } from 'react';
import { useSignAndExecuteTransaction, useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/bcs';
import NotificationPopup from '../ui/NotificationPopup';

// Define NotificationState type
type NotificationState = {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
  digest?: string;
} | null;

interface MintTestCoinFormProps {
  suiPackageId: string;
  chainIdentifier: `${string}:${string}`;
}

const MintTestCoinForm: React.FC<MintTestCoinFormProps> = ({
  suiPackageId,
  chainIdentifier,
}) => {
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [treasuryCapId, setTreasuryCapId] = useState<string | null>(null);
  const [isFetchingCap, setIsFetchingCap] = useState(false);
  const [fetchCapError, setFetchCapError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<NotificationState>(null);

  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();

  const TEST_COIN_TYPE = `${suiPackageId}::test_coin::TEST_COIN`;
  const TREASURY_CAP_TYPE = `0x2::coin::TreasuryCap<${TEST_COIN_TYPE}>`;

  // Fetch TreasuryCap when account or packageId changes
  useEffect(() => {
    const fetchTreasuryCap = async () => {
      if (!currentAccount) {
        setTreasuryCapId(null);
        setFetchCapError('Wallet not connected.');
        return;
      }

      setIsFetchingCap(true);
      setFetchCapError(null);
      setTreasuryCapId(null); // Reset before fetching

      try {
        console.log(`Fetching TreasuryCap of type ${TREASURY_CAP_TYPE} for account ${currentAccount.address}`);
        const objects = await suiClient.getOwnedObjects({
          owner: currentAccount.address,
          filter: { StructType: TREASURY_CAP_TYPE },
          options: { showType: true, showContent: true },
        });

        const caps = objects.data.filter(obj => obj.data?.type === TREASURY_CAP_TYPE);

        if (caps.length === 0) {
          console.log(`No TreasuryCap object of type ${TREASURY_CAP_TYPE} found for account ${currentAccount.address}`);
          setFetchCapError(`No ${TEST_COIN_TYPE} TreasuryCap found for your account. Ensure the package is deployed and you hold the cap.`);
          setTreasuryCapId(null);
        } else {
          if (caps.length > 1) {
            console.warn(`Multiple TreasuryCap objects found for account ${currentAccount.address}. Using the first one.`);
          }
          const capId = caps[0].data?.objectId ?? null;
          console.log(`Found TreasuryCap ID: ${capId}`);
          setTreasuryCapId(capId);
          setFetchCapError(null); // Clear error on success
        }
      } catch (error) {
        console.error("Error fetching TreasuryCap:", error);
        const errorStr = `Error fetching TreasuryCap: ${error instanceof Error ? error.message : String(error)}`;
        setFetchCapError(errorStr);
        setTreasuryCapId(null);
      } finally {
        setIsFetchingCap(false);
      }
    };

    fetchTreasuryCap();
  }, [currentAccount, suiClient, TREASURY_CAP_TYPE, TEST_COIN_TYPE]); // Depend on derived types too

  const handleMint = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setNotification(null);

    if (!currentAccount) {
      setNotification({ show: true, message: 'Please connect your wallet.', type: 'error' });
      setIsLoading(false);
      return;
    }

    if (!treasuryCapId) {
      setNotification({ show: true, message: fetchCapError || 'TreasuryCap not found or failed to fetch.', type: 'error' });
      setIsLoading(false);
      return;
    }

    try {
      const mintAmount = BigInt(amount);
      if (mintAmount <= 0) {
        throw new Error('Amount must be greater than 0.');
      }
      // Basic address validation (length, 0x prefix) - more robust validation might be needed
      if (!recipient.startsWith('0x') || recipient.length < 42) {
          throw new Error('Invalid recipient address format.');
      }

      console.log(`Using TreasuryCap ID: ${treasuryCapId}`);
      console.log('Minting test coin with:', { amount: amount, recipient });

      const txb = new Transaction();

      txb.moveCall({
        target: `${suiPackageId}::test_coin::mint`,
        arguments: [
          txb.object(treasuryCapId),
          txb.pure(bcs.u64().serialize(mintAmount).toBytes()),
          txb.pure.address(recipient),
        ],
      });

      signAndExecuteTransaction(
        {
          transaction: txb,
          chain: chainIdentifier,
        },
        {
          onSuccess: (data) => {
            console.log('Mint successful:', data);
            setNotification({
              show: true,
              message: `Successfully minted ${amount} ${TEST_COIN_TYPE} to ${recipient}.`,
              type: 'success',
              digest: data.digest,
            });
            // Optionally reset form
            setAmount('');
            // Keep recipient? Or clear? User preference. Let's clear for now.
            // setRecipient('');
          },
          onError: (error: Error) => {
            console.error('Error minting:', error);
            setNotification({ show: true, message: `Error signing/executing transaction: ${error.message}`, type: 'error' });
          },
          onSettled: () => {
            setIsLoading(false);
          },
        }
      );
    } catch (error) {
      console.error('Failed to prepare or execute transaction:', error);
      setNotification({ show: true, message: `Failed to prepare transaction: ${error instanceof Error ? error.message : String(error)}`, type: 'error' });
      setIsLoading(false);
    }
  };

  const inputClass = "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black dark:text-white";
  const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";
  const helpTextClass = "mt-1 text-xs text-gray-500 dark:text-gray-400";

  return (
    <form onSubmit={handleMint} className="space-y-4 max-w-lg">
      {notification?.show && (
        <NotificationPopup
          message={notification.message}
          type={notification.type}
          digest={notification.digest}
          onClose={() => setNotification(null)}
        />
      )}

      {/* Treasury Cap Status */}
      <div className="p-3 border rounded bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Treasury Cap Status:</p>
          {isFetchingCap ? (
              <p className="text-sm text-blue-600 dark:text-blue-400">Fetching TreasuryCap...</p>
          ) : fetchCapError ? (
              <p className="text-sm text-red-600 dark:text-red-400">{fetchCapError}</p>
          ) : treasuryCapId ? (
              <p className="text-sm text-green-600 dark:text-green-400">Found TreasuryCap: <code className="text-xs bg-gray-200 dark:bg-gray-600 p-1 rounded">{treasuryCapId}</code></p>
          ) : (
               <p className="text-sm text-gray-500 dark:text-gray-400">TreasuryCap status unknown (check connection).</p>
          )}
      </div>


      <div>
        <label htmlFor="amount" className={labelClass}>Amount (raw units):</label>
        <input
          type="number"
          id="amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="e.g., 1000000000"
          required
          min="1"
          step="1"
          className={inputClass}
        />
        <p className={helpTextClass}>The amount of test coin to mint (smallest unit, e.g., MIST).</p>
      </div>

      <div>
        <label htmlFor="recipient" className={labelClass}>Recipient Address:</label>
        <input
          type="text"
          id="recipient"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="0x..."
          required
          className={inputClass}
        />
         <p className={helpTextClass}>The Sui address to receive the minted coins.</p>
      </div>


      <button
        type="submit"
        disabled={isLoading || !currentAccount || !treasuryCapId || isFetchingCap}
        className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Processing...' : 'Mint Test Coin'}
      </button>
       {!currentAccount && <p className="text-xs text-red-500 dark:text-red-400 mt-1">Connect wallet to enable minting.</p>}
       {currentAccount && !isFetchingCap && !treasuryCapId && <p className="text-xs text-red-500 dark:text-red-400 mt-1">Cannot mint without a valid TreasuryCap.</p>}
    </form>
  );
};

export default MintTestCoinForm; 