'use client';

import React, { useState, useEffect } from 'react';
import {
  useSignAndExecuteTransaction,
  useCurrentAccount,
  useSuiClient,
} from '@mysten/dapp-kit';
import Layout from '../../components/common/Layout';
import InitializeVaultForm from '../../components/admin/InitializeVaultForm';
import AddSupportedLpForm from '../../components/admin/AddSupportedLpForm';
import InitProgramForm from '../../components/admin/InitProgramForm';
import MintTestCoinForm from '../../components/admin/MintTestCoinForm';

// Read constants from environment variables
const SUI_PACKAGE_ID = process.env.NEXT_PUBLIC_SUI_PACKAGE_ID;
const GLOBAL_OBJECT_ID = process.env.NEXT_PUBLIC_SUI_GLOBAL_OBJECT_ID;

// Ensure environment variables are set
if (!SUI_PACKAGE_ID || !GLOBAL_OBJECT_ID) {
  throw new Error("Required environment variables NEXT_PUBLIC_SUI_PACKAGE_ID or NEXT_PUBLIC_SUI_GLOBAL_OBJECT_ID are not set.");
}

// Define the AdminCap type string based on constants
const ADMIN_CAP_TYPE = `${SUI_PACKAGE_ID}::main::AdminCap`;

// Determine the network from the environment variable, defaulting to 'testnet' if not set
const network = process.env.SUI_NETWORK || 'testnet';
// Construct the chain identifier string
const chainIdentifier: `${string}:${string}` = `sui:${network}`;

// Add 'mint_test_coin' to the type
type AdminFunction = 'init_lp_vault' | 'add_supported_lp' | 'init_program' | 'mint_test_coin';

const AdminPage = () => {
  const [selectedFunction, setSelectedFunction] = useState<AdminFunction>('init_lp_vault');
  const [fetchErrorMsg, setFetchErrorMsg] = useState<string | null>(null);

  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();

  // Log current account status on component mount and when it changes
  useEffect(() => {
    if (currentAccount) {
      console.log('[AdminPage] Connected Account:', currentAccount.address);
      setFetchErrorMsg(null);
    } else {
      console.log('[AdminPage] No account connected.');
    }
  }, [currentAccount]);

  const fetchAdminCapForAccount = async (accountAddress: string): Promise<string | null> => {
    setFetchErrorMsg(null);
    try {
      const objects = await suiClient.getOwnedObjects({
        owner: accountAddress,
        filter: { StructType: ADMIN_CAP_TYPE },
        options: { showType: true, showContent: true },
      });

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
      const errorStr = `Error fetching AdminCap: ${error instanceof Error ? error.message : String(error)}`;
      setFetchErrorMsg(errorStr);
      return null;
    }
  };

  return (
    <Layout >
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Admin Functions</h1>

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

        {/* Function Selector */}
        <div className="mb-6">
            <label htmlFor="adminFunctionSelect" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Function:</label>
            <select
                id="adminFunctionSelect"
                value={selectedFunction}
                onChange={(e) => setSelectedFunction(e.target.value as AdminFunction)}
                className="block w-full max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black dark:text-white"
            >
                <option value="init_lp_vault">Initialize LP Vault</option>
                <option value="add_supported_lp">Add Supported LP</option>
                <option value="init_program">Initialize Program</option>
                <option value="mint_test_coin">Mint Test Coin</option>
            </select>
        </div>

        {!currentAccount && (
          <p className="text-red-500 mb-4">Please connect your wallet to use admin functions.</p>
        )}

        {/* Display fetch error if any */}
        {fetchErrorMsg && currentAccount && (
            <p className="text-red-500 text-sm mb-4">{fetchErrorMsg}</p>
        )}

        {/* Conditionally Rendered Forms */}
        {currentAccount && (
          <div className="mt-4 p-4 border rounded bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600">
            {selectedFunction === 'init_lp_vault' && (
              <div>
                <h2 className="text-xl font-semibold mb-3">Initialize LP Vault</h2>
                <InitializeVaultForm
                   suiPackageId={SUI_PACKAGE_ID}
                   globalObjectId={GLOBAL_OBJECT_ID}
                   chainIdentifier={chainIdentifier}
                   fetchAdminCapForAccount={fetchAdminCapForAccount}
                 />
              </div>
            )}

            {selectedFunction === 'add_supported_lp' && (
              <div>
                <h2 className="text-xl font-semibold mb-3">Add Supported LP</h2>
                 <AddSupportedLpForm
                   suiPackageId={SUI_PACKAGE_ID}
                   globalObjectId={GLOBAL_OBJECT_ID}
                   adminCapType={ADMIN_CAP_TYPE}
                   chainIdentifier={chainIdentifier}
                   fetchAdminCapForAccount={fetchAdminCapForAccount}
                  />
              </div>
            )}

            {selectedFunction === 'init_program' && (
              <div>
                 <h2 className="text-xl font-semibold mb-3">Initialize Program</h2>
                 <InitProgramForm
                    suiPackageId={SUI_PACKAGE_ID}
                    chainIdentifier={chainIdentifier}
                    fetchAdminCapForAccount={fetchAdminCapForAccount}
                 />
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default AdminPage;
