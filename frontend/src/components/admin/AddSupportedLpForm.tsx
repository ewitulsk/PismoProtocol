'use client';

import React, { useState } from 'react';
import { useSignAndExecuteTransaction, useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/bcs';
import NotificationPopup from '../ui/NotificationPopup'; // Import the notification popup

// Define NotificationState type (can be moved to a shared types file later)
type NotificationState = {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
  digest?: string;
} | null;

// Helper function to convert hex string to Uint8Array (copied from admin/page.tsx)
function hexToBytes(hex: string): Uint8Array {
  const hexString = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (hexString.length % 2 !== 0) {
    throw new Error('Hex string must have an even number of digits');
  }
  const bytes = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < hexString.length; i += 2) {
    bytes[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
  }
  return bytes;
}

interface AddSupportedLpFormProps {
  suiPackageId: string;
  globalObjectId: string;
  adminCapType: string;
  chainIdentifier: `${string}:${string}`;
  fetchAdminCapForAccount: (accountAddress: string) => Promise<string | null>; // Function passed from parent
}

const AddSupportedLpForm: React.FC<AddSupportedLpFormProps> = ({
  suiPackageId,
  globalObjectId,
  adminCapType, // We'll need this if fetchAdminCap isn't passed
  chainIdentifier,
  fetchAdminCapForAccount,
}) => {
  const [tokenInfo, setTokenInfo] = useState('');
  const [tokenDecimals, setTokenDecimals] = useState('');
  const [priceFeedId, setPriceFeedId] = useState('');
  const [oracleFeed, setOracleFeed] = useState('0'); // Default to 0 (Pyth)
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<NotificationState>(null); // State for notification popup


  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const currentAccount = useCurrentAccount();
  // const suiClient = useSuiClient(); // Only needed if fetchAdminCap is done here

  const handleAddSupportedLP = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setNotification(null); // Clear previous notifications


    if (!currentAccount) {
      setNotification({ show: true, message: 'Please connect your wallet.', type: 'error' });
      setIsLoading(false);
      return;
    }

    const decimals = parseInt(tokenDecimals, 10);
    if (isNaN(decimals) || decimals < 0 || decimals > 255) {
        setNotification({ show: true, message: 'Token Decimals must be a number between 0 and 255.', type: 'error' });
        setIsLoading(false);
        return;
    }

    const feed = parseInt(oracleFeed, 10);
     if (isNaN(feed) || feed < 0 || feed > 65535) {
        setNotification({ show: true, message: 'Oracle Feed must be a number between 0 and 65535.', type: 'error' });
        setIsLoading(false);
        return;
    }


    console.log('Fetching AdminCap for current account...');
    // Use the function passed via props
    const adminCapId = await fetchAdminCapForAccount(currentAccount.address);

    if (!adminCapId) {
      setNotification({ show: true, message: `No AdminCap found for your account (${currentAccount.address}). You might not have permission.`, type: 'error' });
      setIsLoading(false);
      return;
    }

    console.log(`Using AdminCap ID: ${adminCapId}`);
    console.log('Adding supported LP with:', { tokenInfo, tokenDecimals: decimals, priceFeedId, oracleFeed: feed });

    try {
      const priceFeedBytes = hexToBytes(priceFeedId);

      const txb = new Transaction();

      txb.moveCall({
        target: `${suiPackageId}::main::add_supported_lp`,
        arguments: [
          txb.object(adminCapId),
          txb.object(globalObjectId),
          txb.pure.string(tokenInfo),
          txb.pure.u8(decimals),
          txb.pure(bcs.vector(bcs.u8()).serialize(priceFeedBytes).toBytes()), // Serialized Price feed ID bytes
          txb.pure.u16(feed),
        ],
      });

      signAndExecuteTransaction(
        {
          transaction: txb,
          chain: chainIdentifier,
        },
        {
          onSuccess: (data) => {
            console.log('Supported LP added successfully:', data);
            setNotification({
                show: true,
                message: `Successfully added LP: ${tokenInfo}.`,
                type: 'success',
                digest: data.digest,
            });
            // Reset form potentially
            setTokenInfo('');
            setTokenDecimals('');
            setPriceFeedId('');
            setOracleFeed('0');
          },
          onError: (error: Error) => {
            console.error('Error adding supported LP:', error);
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
    <form onSubmit={handleAddSupportedLP} className="space-y-4 max-w-lg">
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
          <label htmlFor="tokenInfo" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Token Info (Struct Type):</label>
          <input
            type="text"
            id="tokenInfo"
            value={tokenInfo}
            onChange={(e) => setTokenInfo(e.target.value)}
            placeholder="e.g., 0xPACKAGE::btc::BTC"
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black dark:text-white"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">The full struct type identifying the token (e.g., coin type).</p>
       </div>

       <div>
         <label htmlFor="tokenDecimals" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Token Decimals:</label>
         <input
            type="number"
            id="tokenDecimals"
            value={tokenDecimals}
            onChange={(e) => setTokenDecimals(e.target.value)}
            placeholder="e.g., 8"
            required
            min="0"
            max="255"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black dark:text-white"
         />
         <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">The number of decimal places for the token (0-255).</p>
      </div>

       <div>
          <label htmlFor="priceFeedId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Price Feed ID (Hex):</label>
          <input
            type="text"
            id="priceFeedId"
            value={priceFeedId}
            onChange={(e) => setPriceFeedId(e.target.value)}
            placeholder="e.g., e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43"
            required
            pattern="^[a-fA-F0-9]+$"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black dark:text-white"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">The Oracle Price Feed ID for the token, as a hex string (no 0x prefix needed).</p>
       </div>

      <div>
          <label htmlFor="oracleFeed" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Oracle Feed Type:</label>
          <select
            id="oracleFeed"
            value={oracleFeed}
            onChange={(e) => setOracleFeed(e.target.value)}
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black dark:text-white"
          >
            <option value="0">0 (Pyth)</option>
            {/* Add other oracle types here if needed */}
            {/* <option value="1">1 (Supra - Example)</option> */}
            {/* <option value="2">2 (Chainlink - Example)</option> */}
          </select>
           <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Identifier for the oracle provider (currently only 0 for Pyth is expected by contract).</p>
      </div>

      <button
        type="submit"
        disabled={isLoading || !currentAccount}
        className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Processing...' : 'Add Supported LP'}
      </button>
    </form>
  );
};

export default AddSupportedLpForm; 