'use client';

import React, { useState } from 'react';
import { useSignAndExecuteTransaction, useCurrentAccount } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/bcs';
import NotificationPopup from '../ui/NotificationPopup';

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
  // globalObjectId: string; // Not needed for init_program
  chainIdentifier: `${string}:${string}`;
  fetchAdminCapForAccount: (accountAddress: string) => Promise<string | null>;
}

const InitProgramForm: React.FC<InitProgramFormProps> = ({
  suiPackageId,
  chainIdentifier,
  fetchAdminCapForAccount,
}) => {
  // Input states - using comma-separated strings for vectors
  const [collateralTokenInfo, setCollateralTokenInfo] = useState('');
  const [collateralPriceFeedIds, setCollateralPriceFeedIds] = useState('');
  const [collateralOracleFeedIds, setCollateralOracleFeedIds] = useState('');
  const [positionTokenInfo, setPositionTokenInfo] = useState('');
  const [positionPriceFeedIds, setPositionPriceFeedIds] = useState('');
  const [positionOracleFeedIds, setPositionOracleFeedIds] = useState('');
  const [maxLeverage, setMaxLeverage] = useState('');
  const [sharedPriceDecimals, setSharedPriceDecimals] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<NotificationState>(null);

  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const currentAccount = useCurrentAccount();

  const parseStringArray = (input: string): string[] => input.split(',').map(s => s.trim()).filter(s => s);
  const parseNumberArray = (input: string, type: 'u8' | 'u16' = 'u16'): number[] => {
    const parsed = input.split(',').map(s => parseInt(s.trim(), 10));
    if (parsed.some(isNaN)) throw new Error(`Invalid number found in list: ${input}`);
    if (type === 'u8' && parsed.some(n => n < 0 || n > 255)) throw new Error('Number must be between 0 and 255');
    if (type === 'u16' && parsed.some(n => n < 0 || n > 65535)) throw new Error('Number must be between 0 and 65535');
    return parsed;
  };
   const parseHexBytesArray = (input: string): Uint8Array[] => {
    const hexStrings = input.split(',').map(s => s.trim()).filter(s => s);
    return hexStrings.map(hexToBytes);
  };


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
        const collateralInfos = parseStringArray(collateralTokenInfo);
        const collateralFeeds = parseHexBytesArray(collateralPriceFeedIds);
        const collateralOracles = parseNumberArray(collateralOracleFeedIds, 'u16');

        const positionInfos = parseStringArray(positionTokenInfo);
        const positionFeeds = parseHexBytesArray(positionPriceFeedIds);
        const positionOracles = parseNumberArray(positionOracleFeedIds, 'u16');
        const leverages = parseNumberArray(maxLeverage, 'u16');

        const sharedDecimals = parseInt(sharedPriceDecimals, 10);
        if (isNaN(sharedDecimals) || sharedDecimals < 0 || sharedDecimals > 255) {
            throw new Error('Shared Price Decimals must be a number between 0 and 255.');
        }

        // Basic length checks
        if (collateralInfos.length !== collateralFeeds.length || collateralInfos.length !== collateralOracles.length) {
            throw new Error('Collateral input arrays must have the same length.');
        }
         if (positionInfos.length !== positionFeeds.length || positionInfos.length !== positionOracles.length || positionInfos.length !== leverages.length) {
            throw new Error('Position input arrays must have the same length.');
        }

        console.log('Fetching AdminCap for current account...');
        const adminCapId = await fetchAdminCapForAccount(currentAccount.address);

        if (!adminCapId) {
          throw new Error(`No AdminCap found for your account (${currentAccount.address}). You might not have permission.`);
        }

        console.log(`Using AdminCap ID: ${adminCapId}`);
        console.log('Initializing program with:', { collateralInfos, collateralFeeds, collateralOracles, positionInfos, positionFeeds, positionOracles, leverages, sharedDecimals });

        const txb = new Transaction();

        // BCS encode vector<vector<u8>>
        const collateralFeedsBytes = bcs.vector(bcs.vector(bcs.u8()))
            .serialize(collateralFeeds).toBytes();
        const positionFeedsBytes = bcs.vector(bcs.vector(bcs.u8()))
            .serialize(positionFeeds).toBytes();

        txb.moveCall({
            target: `${suiPackageId}::programs::init_program`,
            arguments: [
                txb.object(adminCapId),
                txb.pure(bcs.vector(bcs.string()).serialize(collateralInfos).toBytes()),
                txb.pure(collateralFeedsBytes),
                txb.pure(bcs.vector(bcs.u16()).serialize(collateralOracles).toBytes()),
                txb.pure(bcs.vector(bcs.string()).serialize(positionInfos).toBytes()),
                txb.pure(positionFeedsBytes),
                txb.pure(bcs.vector(bcs.u16()).serialize(positionOracles).toBytes()),
                txb.pure(bcs.vector(bcs.u16()).serialize(leverages).toBytes()),
                txb.pure.u8(sharedDecimals),
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
                    message: 'Program initialized successfully.',
                    type: 'success',
                    digest: data.digest,
                });
                // Reset form
                setCollateralTokenInfo('');
                setCollateralPriceFeedIds('');
                setCollateralOracleFeedIds('');
                setPositionTokenInfo('');
                setPositionPriceFeedIds('');
                setPositionOracleFeedIds('');
                setMaxLeverage('');
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

      <h3 className="text-lg font-semibold mb-3">Collateral Configuration</h3>
      <div>
        <label htmlFor="collateralTokenInfo" className={labelClass}>Collateral Token Infos (comma-separated):</label>
        <input type="text" id="collateralTokenInfo" value={collateralTokenInfo} onChange={(e) => setCollateralTokenInfo(e.target.value)} placeholder="e.g., 0xPKG::usd::USD,0xPKG::btc::BTC" required className={inputClass} />
        <p className={helpTextClass}>Comma-separated list of full token type strings.</p>
      </div>
      <div>
        <label htmlFor="collateralPriceFeedIds" className={labelClass}>Collateral Price Feed IDs (Hex, comma-separated):</label>
        <input type="text" id="collateralPriceFeedIds" value={collateralPriceFeedIds} onChange={(e) => setCollateralPriceFeedIds(e.target.value)} placeholder="e.g., feedIdHex1,feedIdHex2" required className={inputClass} />
        <p className={helpTextClass}>Comma-separated list of hex price feed IDs (no 0x prefix).</p>
      </div>
      <div>
        <label htmlFor="collateralOracleFeedIds" className={labelClass}>Collateral Oracle Feed IDs (u16, comma-separated):</label>
        <input type="text" id="collateralOracleFeedIds" value={collateralOracleFeedIds} onChange={(e) => setCollateralOracleFeedIds(e.target.value)} placeholder="e.g., 0,0" required className={inputClass} />
        <p className={helpTextClass}>Comma-separated list of oracle feed numbers (0 for Pyth).</p>
      </div>

      <h3 className="text-lg font-semibold mb-3 pt-4">Position Configuration</h3>
      <div>
        <label htmlFor="positionTokenInfo" className={labelClass}>Position Token Infos (comma-separated):</label>
        <input type="text" id="positionTokenInfo" value={positionTokenInfo} onChange={(e) => setPositionTokenInfo(e.target.value)} placeholder="e.g., 0xPKG::eth::ETH,0xPKG::sol::SOL" required className={inputClass} />
        <p className={helpTextClass}>Comma-separated list of full token type strings for positions.</p>
      </div>
      <div>
        <label htmlFor="positionPriceFeedIds" className={labelClass}>Position Price Feed IDs (Hex, comma-separated):</label>
        <input type="text" id="positionPriceFeedIds" value={positionPriceFeedIds} onChange={(e) => setPositionPriceFeedIds(e.target.value)} placeholder="e.g., feedIdHex3,feedIdHex4" required className={inputClass} />
         <p className={helpTextClass}>Comma-separated list of hex price feed IDs (no 0x prefix).</p>
     </div>
      <div>
        <label htmlFor="positionOracleFeedIds" className={labelClass}>Position Oracle Feed IDs (u16, comma-separated):</label>
        <input type="text" id="positionOracleFeedIds" value={positionOracleFeedIds} onChange={(e) => setPositionOracleFeedIds(e.target.value)} placeholder="e.g., 0,0" required className={inputClass} />
        <p className={helpTextClass}>Comma-separated list of oracle feed numbers (0 for Pyth).</p>
      </div>
      <div>
        <label htmlFor="maxLeverage" className={labelClass}>Max Leverage (u16, comma-separated):</label>
        <input type="text" id="maxLeverage" value={maxLeverage} onChange={(e) => setMaxLeverage(e.target.value)} placeholder="e.g., 10,20" required className={inputClass} />
        <p className={helpTextClass}>Comma-separated list of max leverage values (corresponding to position tokens).</p>
      </div>

      <h3 className="text-lg font-semibold mb-3 pt-4">Global Configuration</h3>
      <div>
        <label htmlFor="sharedPriceDecimals" className={labelClass}>Shared Price Decimals (u8):</label>
        <input type="number" id="sharedPriceDecimals" value={sharedPriceDecimals} onChange={(e) => setSharedPriceDecimals(e.target.value)} placeholder="e.g., 10" required min="0" max="255" className={inputClass} />
        <p className={helpTextClass}>The shared decimal precision for price evaluation (0-255).</p>
      </div>

      <button
        type="submit"
        disabled={isLoading || !currentAccount}
        className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Processing...' : 'Initialize Program'}
      </button>
    </form>
  );
};

export default InitProgramForm; 