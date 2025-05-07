'use client';

import React, { useState } from 'react';
import { useSignAndExecuteTransaction, useCurrentAccount } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/bcs';
import NotificationPopup from '../common/NotificationPopup';

// Define NotificationState type (copied from AddSupportedLpForm.tsx)
type NotificationState = {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
  digest?: string;
} | null;

// Helper function to convert hex string to Uint8Array
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

interface InitProgramFormProps {
  suiPackageId: string;
  chainIdentifier: `${string}:${string}`;
  fetchAdminCapForAccount: (accountAddress: string) => Promise<string | null>;
}

const InitProgramForm: React.FC<InitProgramFormProps> = ({
  suiPackageId,
  chainIdentifier,
  fetchAdminCapForAccount,
}) => {
  // Input states for the simplified init_program_single_token_collateral_and_positions
  const [collateralTokenType, setCollateralTokenType] = useState('');
  const [collateralPriceFeedId, setCollateralPriceFeedId] = useState(''); // Single hex string
  const [collateralOracleFeedId, setCollateralOracleFeedId] = useState(''); // Single number (u16)
  const [sharedPriceDecimals, setSharedPriceDecimals] = useState(''); // Single number (u8)

  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<NotificationState>(null);

  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const currentAccount = useCurrentAccount();

  const handleInitProgram = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setNotification(null);

    if (!currentAccount) {
      setNotification({ show: true, message: 'Please connect your wallet.', type: 'error' });
      setIsLoading(false);
      return;
    }

    try {
        // Parse and validate inputs
        if (!collateralTokenType.trim()) {
            throw new Error('Collateral Token Type is required.');
        }
        const collateralFeedBytes = hexToBytes(collateralPriceFeedId); // Already handles '0x' prefix and validation

        const parsedCollateralOracleId = parseInt(collateralOracleFeedId.trim(), 10);
        if (isNaN(parsedCollateralOracleId) || parsedCollateralOracleId < 0 || parsedCollateralOracleId > 65535) {
            throw new Error('Collateral Oracle Feed ID must be a number between 0 and 65535.');
        }

        const parsedSharedDecimals = parseInt(sharedPriceDecimals.trim(), 10);
        if (isNaN(parsedSharedDecimals) || parsedSharedDecimals < 0 || parsedSharedDecimals > 255) {
            throw new Error('Shared Price Decimals must be a number between 0 and 255.');
        }

        console.log('Fetching AdminCap for current account...');
        const adminCapId = await fetchAdminCapForAccount(currentAccount.address);

        if (!adminCapId) {
          throw new Error(`No AdminCap found for your account (${currentAccount.address}). You might not have permission.`);
        }

        console.log(`Using AdminCap ID: ${adminCapId}`);
        console.log('Initializing program with:', {
            collateralTokenType,
            collateralFeedBytes,
            parsedCollateralOracleId,
            parsedSharedDecimals,
        });

        const txb = new Transaction();

        txb.moveCall({
            target: `${suiPackageId}::programs::init_program_single_token_collateral_and_positions`,
            typeArguments: [collateralTokenType.trim()],
            arguments: [
                txb.object(adminCapId),
                txb.pure(bcs.vector(bcs.u8()).serialize(collateralFeedBytes).toBytes()),
                txb.pure.u16(parsedCollateralOracleId),
                txb.pure.u8(parsedSharedDecimals),
            ],
        });

        signAndExecuteTransaction(
            {
            transaction: txb,
            chain: chainIdentifier,
            },
            {
            onSuccess: (data) => {
                console.log('Program initialized successfully:', data);
                setNotification({
                    show: true,
                    message: 'Program initialized successfully (single token).',
                    type: 'success',
                    digest: data.digest,
                });
                // Reset form
                setCollateralTokenType('');
                setCollateralPriceFeedId('');
                setCollateralOracleFeedId('');
                setSharedPriceDecimals('');
            },
            onError: (error: Error) => {
                console.error('Error initializing program:', error);
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
    <form onSubmit={handleInitProgram} className="space-y-4 max-w-lg">
      {notification?.show && (
        <NotificationPopup
          message={notification.message}
          type={notification.type}
          digest={notification.digest}
          onClose={() => setNotification(null)}
        />
      )}

      <h3 className="text-lg font-semibold mb-3">Collateral Configuration (Single Token)</h3>
      <div>
        <label htmlFor="collateralTokenType" className={labelClass}>Collateral Token Type:</label>
        <input type="text" id="collateralTokenType" value={collateralTokenType} onChange={(e) => setCollateralTokenType(e.target.value)} placeholder="e.g., 0xPKG::usd::USD" required className={inputClass} />
        <p className={helpTextClass}>The full token type string for the single collateral.</p>
      </div>
      <div>
        <label htmlFor="collateralPriceFeedId" className={labelClass}>Collateral Price Feed ID (Hex):</label>
        <input type="text" id="collateralPriceFeedId" value={collateralPriceFeedId} onChange={(e) => setCollateralPriceFeedId(e.target.value)} placeholder="e.g., feedIdHex1 (no 0x prefix needed)" required className={inputClass} />
        <p className={helpTextClass}>Hex string for the price feed ID.</p>
      </div>
      <div>
        <label htmlFor="collateralOracleFeedId" className={labelClass}>Collateral Oracle Feed ID (u16):</label>
        <input type="number" id="collateralOracleFeedId" value={collateralOracleFeedId} onChange={(e) => setCollateralOracleFeedId(e.target.value)} placeholder="e.g., 0" required min="0" max="65535" className={inputClass} />
        <p className={helpTextClass}>Oracle feed number (e.g., 0 for Pyth).</p>
      </div>

      <h3 className="text-lg font-semibold mb-3 pt-4">Global Configuration</h3>
      <div>
        <label htmlFor="sharedPriceDecimals" className={labelClass}>Shared Price Decimals (u8):</label>
        <input type="number" id="sharedPriceDecimals" value={sharedPriceDecimals} onChange={(e) => setSharedPriceDecimals(e.target.value)} placeholder="e.g., 8" required min="0" max="255" className={inputClass} />
        <p className={helpTextClass}>The shared decimal precision for price evaluation (0-255).</p>
      </div>

      <button
        type="submit"
        disabled={isLoading || !currentAccount}
        className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Processing...' : 'Initialize Program (Single Token)'}
      </button>
    </form>
  );
};

export default InitProgramForm; 