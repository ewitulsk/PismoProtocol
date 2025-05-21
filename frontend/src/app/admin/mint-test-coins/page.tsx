'use client';

import React from 'react';
import MintTestCoinForm from '@/components/admin/MintTestCoinForm';
import Layout from '@/components/common/Layout';
import { WalletProvider, SuiClientProvider, createNetworkConfig } from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';
import '@mysten/dapp-kit/dist/index.css';

const suiPackageId = process.env.NEXT_PUBLIC_SUI_PACKAGE_ID;
const btcTcapId = process.env.NEXT_PUBLIC_BTC_TCAP;
const ethTcapId = process.env.NEXT_PUBLIC_ETH_TCAP;
const usdcTcapId = process.env.NEXT_PUBLIC_USDC_TCAP;

const rawNetwork = process.env.NEXT_PUBLIC_NETWORK || 'testnet'; 

let chainIdentifier: `${string}:${string}`;
let network: 'mainnet' | 'testnet' | 'devnet';

if (rawNetwork === 'mainnet') {
  network = 'mainnet';
  chainIdentifier = 'sui:mainnet';
} else if (rawNetwork === 'testnet') {
  network = 'testnet';
  chainIdentifier = 'sui:testnet';
} else if (rawNetwork === 'devnet') {
  network = 'devnet';
  chainIdentifier = 'sui:devnet';
} else {
  console.warn(`Unrecognized network: "${rawNetwork}", defaulting to sui:testnet. Please check NEXT_PUBLIC_NETWORK environment variable.`);
  network = 'testnet';
  chainIdentifier = 'sui:testnet';
}

const { networkConfig } = createNetworkConfig({
  testnet: { url: getFullnodeUrl('testnet') },
  mainnet: { url: getFullnodeUrl('mainnet') },
  devnet: { url: getFullnodeUrl('devnet') },
});


const MintTestCoinsPage = () => {
  const missingEnvVars = [];
  if (!suiPackageId) missingEnvVars.push('NEXT_PUBLIC_SUI_PACKAGE_ID');
  if (!btcTcapId) missingEnvVars.push('NEXT_PUBLIC_BTC_TCAP');
  if (!ethTcapId) missingEnvVars.push('NEXT_PUBLIC_ETH_TCAP');
  if (!usdcTcapId) missingEnvVars.push('NEXT_PUBLIC_USDC_TCAP');

  if (missingEnvVars.length > 0) {
    return (
      <Layout activePage="admin">
        <div className="container mx-auto p-4">
          <h1 className="text-2xl font-bold mb-6 text-white">Admin - Mint Test Coins</h1>
          <p className="text-red-500">
            Error: The following environment variable(s) are not set:
            <ul className="list-disc list-inside mt-2">
              {missingEnvVars.map(varName => <li key={varName}>{varName}</li>)}
            </ul>
            Please check your .env.local or config.toml file.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <WalletProvider>
      <SuiClientProvider networks={networkConfig} defaultNetwork={network}>
        <Layout activePage="admin">
          <div className="container mx-auto p-4">
            <h1 className="text-2xl font-bold mb-8 text-white">Admin - Mint Test Coins</h1>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              
              <div className="p-6 bg-gray-800 rounded-lg shadow-md">
                <h2 className="text-xl font-semibold mb-4 text-white">Mint Test BTC</h2>
                <MintTestCoinForm
                  suiPackageId={suiPackageId!}
                  chainIdentifier={chainIdentifier}
                  coinDisplayName="Test BTC"
                  coinModule="test_btc_coin"
                  coinStruct="TEST_BTC_COIN"
                  treasuryCapId={btcTcapId!}
                />
              </div>

              <div className="p-6 bg-gray-800 rounded-lg shadow-md">
                <h2 className="text-xl font-semibold mb-4 text-white">Mint Test ETH</h2>
                <MintTestCoinForm
                  suiPackageId={suiPackageId!}
                  chainIdentifier={chainIdentifier}
                  coinDisplayName="Test ETH"
                  coinModule="test_eth_coin"
                  coinStruct="TEST_ETH_COIN"
                  treasuryCapId={ethTcapId!}
                />
              </div>

              <div className="p-6 bg-gray-800 rounded-lg shadow-md">
                <h2 className="text-xl font-semibold mb-4 text-white">Mint Test USDC</h2>
                <MintTestCoinForm
                  suiPackageId={suiPackageId!}
                  chainIdentifier={chainIdentifier}
                  coinDisplayName="Test USDC"
                  coinModule="test_usdc_coin"
                  coinStruct="TEST_USDC_COIN"
                  treasuryCapId={usdcTcapId!}
                />
              </div>
              
            </div>
          </div>
        </Layout>
      </SuiClientProvider>
    </WalletProvider>
  );
};

export default MintTestCoinsPage; 