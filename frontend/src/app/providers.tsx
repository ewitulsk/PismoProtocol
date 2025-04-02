'use client';

import React from 'react';
import { WalletProvider, SuiClientProvider, createNetworkConfig } from '@mysten/dapp-kit';
import { getFullnodeUrl } from "@mysten/sui/client";
import '@mysten/dapp-kit/dist/index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { customTheme } from "@/styles/customTheme";

const queryClient = new QueryClient();

// Config options for the networks you want to connect to
const { networkConfig } = createNetworkConfig({
	localnet: {
		url: getFullnodeUrl("localnet"),
	},
	testnet: {
		url: getFullnodeUrl("testnet"),
	},
	mainnet: {
		url: getFullnodeUrl("mainnet"),
	},
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig}>
        <WalletProvider theme={customTheme}>
          {children}
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}