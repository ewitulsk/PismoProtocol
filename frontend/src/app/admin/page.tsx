'use client';

import React, { useState, useEffect } from 'react'; // Import useEffect
import {
  useSignTransaction,
  useCurrentAccount,
  useSuiClient,
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions'; // Keep this path
import { bcs } from '@mysten/bcs';
// Assuming constants are correctly exported from a path relative to this file
// Adjust the import path as necessary
import { SUI_PACKAGE_ID, GLOBAL_OBJECT_ID } from '../../../../typescript/src/constants'; // Adjust path if needed
import Layout from '../../components/common/Layout'; // Import the Layout component

// Define the AdminCap type string based on constants
const ADMIN_CAP_TYPE = `${SUI_PACKAGE_ID}::main::AdminCap`;

// Helper function to convert hex string to Uint8Array (browser-compatible)
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

// Determine the network from the environment variable, defaulting to 'testnet' if not set
const network = process.env.SUI_NETWORK || 'testnet';
// Construct the chain identifier string
const chainIdentifier: `${string}:${string}` = `sui:${network}`;

const AdminPage = () => {
  const [coinType, setCoinType] = useState('');
  const [lpType, setLpType] = useState('');
  const [priceFeedId, setPriceFeedId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { mutate: signTransaction } = useSignTransaction();
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();

  // Log current account status on component mount and when it changes
  useEffect(() => {
    if (currentAccount) {
      console.log('[AdminPage] Connected Account:', currentAccount.address);
    } else {
      console.log('[AdminPage] No account connected.');
    }
  }, [currentAccount]);

  const fetchAdminCapForAccount = async (accountAddress: string): Promise<string | null> => {
    try {
      const objects = await suiClient.getOwnedObjects({
        owner: accountAddress,
        filter: { StructType: ADMIN_CAP_TYPE },
        options: { showType: true, showContent: true }, // Ensure we get necessary details
      });

      // Filter for the exact type match, just in case
      const adminCaps = objects.data.filter(obj => obj.data?.type === ADMIN_CAP_TYPE);

      if (adminCaps.length === 0) {
        console.log(`No AdminCap object of type ${ADMIN_CAP_TYPE} found for account ${accountAddress}`);
        return null;
      }
      if (adminCaps.length > 1) {
        console.warn(`Multiple AdminCap objects found for account ${accountAddress}. Using the first one.`);
      }
      console.log(`Found AdminCap ID: ${adminCaps[0].data?.objectId}`);
      return adminCaps[0].data?.objectId ?? null;
    } catch (error) {
      console.error("Error fetching AdminCap:", error);
      setErrorMsg(`Error fetching AdminCap: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };

  const handleInitializeVault = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    if (!currentAccount) {
      setErrorMsg('Please connect your wallet.');
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
    console.log('Initializing vault with:', { coinType, lpType, priceFeedId });

    try {
      // Convert price feed ID hex string to bytes using helper
      const priceFeedBytes = hexToBytes(priceFeedId);

      const txb = new Transaction();

      txb.moveCall({
        target: `${SUI_PACKAGE_ID}::lp::init_lp_vault`,
        typeArguments: [coinType, lpType],
        arguments: [
          txb.object(adminCapId), // AdminCap object ID fetched for the user
          txb.object(GLOBAL_OBJECT_ID), // Global object ID from constants
          txb.pure(bcs.vector(bcs.u8()).serialize(priceFeedBytes).toBytes()) // Serialized Price feed ID bytes (Uint8Array)
        ],
      });

      // Sign and execute the transaction block
      signTransaction(
        {
          transaction: txb,
          // Use the dynamically determined chain identifier
          chain: chainIdentifier,
        },
        {
          // Use the correct type for the callback parameter
          onSuccess: (data) => { // Try accessing digest via data.transactionBlock?.digest
            console.log('Vault initialized successfully:', data);
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
    // Wrap the page content with the Layout component
    // Pass an empty string or null to activePage if you don't want any nav item highlighted
    <Layout >
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Admin - Initialize LP Vault</h1>

        {/* Display Connection Status */}
        <div className="mb-4 p-3 border rounded bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600">
          <h2 className="text-lg font-semibold mb-2">Connection Status</h2>
          {currentAccount ? (
            <div>
              <p className="text-green-600 dark:text-green-400">Wallet Connected</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Address: <code className="text-xs bg-gray-200 dark:bg-gray-700 p-1 rounded">{currentAccount.address}</code></p>
            </div>
          ) : (
            <p className="text-red-500 dark:text-red-400">Please connect your wallet using the button in the header.</p>
          )}
        </div>

        {!currentAccount && (
          <p className="text-red-500 mb-4">Please connect your wallet to use this admin function.</p>
        )}

        <form onSubmit={handleInitializeVault} className="space-y-4 max-w-lg">
          <div>
            <label htmlFor="coinType" className="block text-sm font-medium text-gray-700">Coin Type:</label>
            <input
              type="text"
              id="coinType"
              name="coinType"
              value={coinType}
              onChange={(e) => setCoinType(e.target.value)}
              placeholder="e.g., 0xPACKAGE::btc::BTC"
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black"
            />
            <p className="mt-1 text-xs text-gray-500">The full struct type of the coin for the vault.</p>
          </div>

          <div>
            <label htmlFor="lpType" className="block text-sm font-medium text-gray-700">LP Token Type:</label>
            <input
              type="text"
              id="lpType"
              name="lpType"
              value={lpType}
              onChange={(e) => setLpType(e.target.value)}
              placeholder="e.g., 0xPACKAGE::lp_token::BTC_LP"
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black"
            />
            <p className="mt-1 text-xs text-gray-500">The full struct type for the LP token to be created.</p>
          </div>

          <div>
            <label htmlFor="priceFeedId" className="block text-sm font-medium text-gray-700">Pyth Price Feed ID (Hex):</label>
            <input
              type="text"
              id="priceFeedId"
              name="priceFeedId"
              value={priceFeedId}
              onChange={(e) => setPriceFeedId(e.target.value)}
              placeholder="e.g., e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43"
              required
              pattern="^[a-fA-F0-9]+$" // Basic hex pattern validation
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black"
            />
            <p className="mt-1 text-xs text-gray-500">The Pyth Network Price Feed ID for the coin, as a hex string (without 0x prefix is fine).</p>
          </div>

          {errorMsg && (
            <p className="text-red-500 text-sm">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={isLoading || !currentAccount}
            className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Processing...' : 'Initialize Vault'}
          </button>
        </form>
      </div>
    </Layout> // Close the Layout component
  );
};

export default AdminPage;
