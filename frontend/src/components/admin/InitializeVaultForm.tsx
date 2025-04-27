'use client';

import React, { useState } from 'react';
import { useSignAndExecuteTransaction, useCurrentAccount } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
// import { bcs } from '@mysten/bcs'; // No longer needed for priceFeedBytes

// Helper function removed as hexToBytes is no longer needed here

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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const currentAccount = useCurrentAccount();

  const handleInitializeVault = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!currentAccount) {
      setErrorMsg('Wallet not connected.');
      setIsLoading(false);
      return;
    }

    // Validate index input
    const index = parseInt(supportedLpGlobalIndex, 10);
    if (isNaN(index) || index < 0) {
        setErrorMsg('Supported LP Global Index must be a non-negative number.');
        setIsLoading(false);
        return;
    }

    console.log('Fetching AdminCap for current account...');
    const adminCapId = await fetchAdminCapForAccount(currentAccount.address);

    if (!adminCapId) {
      setErrorMsg(`No AdminCap found for your account (${currentAccount.address}). You might not have permission.`);
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
            setSuccessMsg(`Vault initialized for ${coinType} at index ${index}. Digest: ${data.digest}`);
            // Reset form
            setCoinType('');
            setLpType('');
            // setPriceFeedId(''); // Removed
            setSupportedLpGlobalIndex(''); // Added
          },
          onError: (error: Error) => {
            console.error('Error initializing vault:', error);
            setErrorMsg(`Error signing/executing transaction: ${error.message}`);
          },
          onSettled: () => {
            setIsLoading(false);
          },
        }
      );
    } catch (error) {
      console.error('Failed to prepare transaction:', error);
      setErrorMsg(`Failed to prepare transaction: ${error instanceof Error ? error.message : String(error)}`);
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleInitializeVault} className="space-y-4 max-w-lg">
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

      {errorMsg && <p className="text-red-500 text-sm">{errorMsg}</p>}
      {successMsg && <p className="text-green-500 text-sm">{successMsg}</p>}

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