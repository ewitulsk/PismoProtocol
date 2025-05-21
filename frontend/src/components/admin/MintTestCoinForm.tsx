'use client';

import React, { useState, useEffect } from 'react';
import { useSignAndExecuteTransaction, useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/bcs';
import NotificationPopup from '../common/NotificationPopup';

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
  coinDisplayName: string; // e.g., "Test BTC"
  coinModule: string;      // e.g., "test_btc_coin"
  coinStruct: string;      // e.g., "TEST_BTC_COIN"
  treasuryCapId: string;   // Hardcoded Treasury Cap ID
}

const MintTestCoinForm: React.FC<MintTestCoinFormProps> = ({
  suiPackageId,
  chainIdentifier,
  coinDisplayName,
  coinModule,
  coinStruct,
  treasuryCapId,
}) => {
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<NotificationState>(null);

  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const currentAccount = useCurrentAccount();

  const TEST_COIN_TYPE = `${suiPackageId}::${coinModule}::${coinStruct}`;

  // Auto-populate recipient address with current account if available and field is empty
  useEffect(() => {
    if (currentAccount && !recipient) {
      setRecipient(currentAccount.address);
    }
  }, [currentAccount]);

  const handleMint = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setNotification(null);

    if (!currentAccount) {
      setNotification({ show: true, message: 'Please connect your wallet.', type: 'error' });
      setIsLoading(false);
      return;
    }

    if (!treasuryCapId) { // Check if the prop is valid (though it should be passed)
      setNotification({ show: true, message: `TreasuryCap ID for ${coinDisplayName} is missing.`, type: 'error' });
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

      console.log(`Using TreasuryCap ID: ${treasuryCapId} for ${coinDisplayName}`);
      console.log(`Minting ${coinDisplayName} with:`, { amount: amount, recipient });

      const txb = new Transaction();

      txb.moveCall({
        target: `${suiPackageId}::${coinModule}::mint`,
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
              message: `Successfully minted ${amount} ${coinDisplayName}`,
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

      {/* Treasury Cap Status - Simplified */}
      <div className="p-3 border rounded bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{coinDisplayName} Treasury Cap:</p>
          {treasuryCapId ? (
              <p className="text-sm text-green-600 dark:text-green-400">Using Cap ID: <code className="text-xs bg-gray-200 dark:bg-gray-600 p-1 rounded break-all">{treasuryCapId}</code></p>
          ) : (
               <p className="text-sm text-red-500 dark:text-red-400">TreasuryCap ID not provided for {coinDisplayName}.</p>
          )}
      </div>

      <div>
        <label htmlFor={`amount-${coinModule}`} className={labelClass}>Amount (raw units) for {coinDisplayName}:</label>
        <input
          type="number"
          id={`amount-${coinModule}`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="e.g., 1000000000"
          required
          min="1"
          step="1"
          className={inputClass}
        />
        <p className={helpTextClass}>The amount of {coinDisplayName} to mint (smallest unit).</p>
      </div>

      <div>
        <label htmlFor={`recipient-${coinModule}`} className={labelClass}>Recipient Address:</label>
        <input
          type="text"
          id={`recipient-${coinModule}`}
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
        disabled={isLoading || !currentAccount || !treasuryCapId} // Removed isFetchingCap
        className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Processing...' : `Mint ${coinDisplayName}`}
      </button>
       {!currentAccount && <p className="text-xs text-red-500 dark:text-red-400 mt-1">Connect wallet to enable minting.</p>}
       {currentAccount && !treasuryCapId && <p className="text-xs text-red-500 dark:text-red-400 mt-1">Cannot mint: TreasuryCap ID for {coinDisplayName} is missing.</p>}
    </form>
  );
};

export default MintTestCoinForm; 