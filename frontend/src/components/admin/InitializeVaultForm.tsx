'use client';

import React, { useState } from 'react';
import { useSignAndExecuteTransaction, useCurrentAccount } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import NotificationPopup from '../common/NotificationPopup';

// Define NotificationState type (copied from previous files)
type NotificationState = {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
  digest?: string;
} | null;

interface InitializeVaultFormProps {
  suiPackageId: string;
  globalObjectId: string;
  chainIdentifier: `${string}:${string}`;
  fetchAdminCapForAccount: (accountAddress: string) => Promise<string | null>;
}

const InitializeVaultForm: React.FC<InitializeVaultFormProps> = ({
  suiPackageId,
  globalObjectId,
  chainIdentifier,
  fetchAdminCapForAccount,
}) => {
  const [coinType, setCoinType] = useState('');
  const [lpType, setLpType] = useState('');
  // const [priceFeedId, setPriceFeedId] = useState(''); // Removed
  const [supportedLpGlobalIndex, setSupportedLpGlobalIndex] = useState(''); // Added
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<NotificationState>(null); // State for notification popup

  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const currentAccount = useCurrentAccount();

  const handleInitializeVault = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setNotification(null); // Clear previous notifications

    if (!currentAccount) {
      setNotification({ show: true, message: 'Wallet not connected.', type: 'error' });
      setIsLoading(false);
      return;
    }

    // Validate index input
    const index = parseInt(supportedLpGlobalIndex, 10);
    if (isNaN(index) || index < 0) {
      setNotification({ show: true, message: 'Supported LP Global Index must be a non-negative number.', type: 'error' });
      setIsLoading(false);
      return;
    }

    console.log('Fetching AdminCap for current account...');
    const adminCapId = await fetchAdminCapForAccount(currentAccount.address);

    if (!adminCapId) {
      setNotification({ show: true, message: `No AdminCap found for your account (${currentAccount.address}). You might not have permission.`, type: 'error' });
      setIsLoading(false);
      return;
    }

    console.log(`Using AdminCap ID: ${adminCapId}`);
    console.log('Initializing vault with:', { coinType, lpType, supportedLpGlobalIndex: index });

    try {
      // const priceFeedBytes = hexToBytes(priceFeedId); // Removed

      const txb = new Transaction();

      txb.moveCall({
        target: `${suiPackageId}::lp::init_lp_vault`,
        typeArguments: [coinType, lpType],
        arguments: [
          txb.object(adminCapId),
          txb.object(globalObjectId),
          // txb.pure(bcs.vector(bcs.u8()).serialize(priceFeedBytes).toBytes()), // Removed
          txb.pure.u64(index), // Added index argument
        ],
      });

      signAndExecuteTransaction(
        {
          transaction: txb,
          chain: chainIdentifier,
        },
        {
          onSuccess: (data) => {
            console.log('Vault initialized successfully:', data);
            setNotification({
              show: true,
              message: `Vault initialized for ${coinType} at index ${index}.`,
              type: 'success',
              digest: data.digest,
            });
            // Reset form
            setCoinType('');
            setLpType('');
            // setPriceFeedId(''); // Removed
            setSupportedLpGlobalIndex(''); // Added
          },
          onError: (error: Error) => {
            console.error('Error initializing vault:', error);
            setNotification({ show: true, message: `Error signing/executing transaction: ${error.message}`, type: 'error' });
          },
          onSettled: () => {
            setIsLoading(false);
          },
        }
      );
    } catch (error) {
      console.error('Failed to prepare transaction:', error);
      setNotification({ show: true, message: `Failed to prepare transaction: ${error instanceof Error ? error.message : String(error)}`, type: 'error' });
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleInitializeVault} className="space-y-4 max-w-lg">
      {/* Render Notification Popup */}
      {notification?.show && (
        <NotificationPopup
          message={notification.message}
          type={notification.type}
          digest={notification.digest}
          onClose={() => setNotification(null)} // Function to hide the popup
        />
      )}

      <div>
        <label htmlFor="coinType" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Coin Type:</label>
        <input
          type="text"
          id="coinType"
          value={coinType}
          onChange={(e) => setCoinType(e.target.value)}
          placeholder="e.g., 0xPACKAGE::btc::BTC"
          required
          className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black dark:text-white"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">The full struct type of the coin for the vault.</p>
      </div>

      <div>
        <label htmlFor="lpType" className="block text-sm font-medium text-gray-700 dark:text-gray-300">LP Token Type:</label>
        <input
          type="text"
          id="lpType"
          value={lpType}
          onChange={(e) => setLpType(e.target.value)}
          placeholder="e.g., 0xPACKAGE::lp_token::BTC_LP"
          required
          className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black dark:text-white"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">The full struct type for the LP token to be created.</p>
      </div>

      {/* Removed Price Feed ID Input */}
      {/* <div> ... </div> */}

      {/* Added Supported LP Global Index Input */}
      <div>
        <label htmlFor="supportedLpGlobalIndex" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Supported LP Global Index:</label>
        <input
          type="number"
          id="supportedLpGlobalIndex"
          value={supportedLpGlobalIndex}
          onChange={(e) => setSupportedLpGlobalIndex(e.target.value)}
          placeholder="e.g., 0"
          required
          min="0"
          step="1"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black dark:text-white"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">The index of this LP in the Global object's `supported_lp` vector (u64).</p>
      </div>

      {/* Removed inline error/success messages */}

      <button
        type="submit"
        disabled={isLoading || !currentAccount}
        className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Processing...' : 'Initialize Vault'}
      </button>
    </form>
  );
};

export default InitializeVaultForm; 