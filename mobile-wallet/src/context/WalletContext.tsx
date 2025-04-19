import React, { createContext, useReducer, useContext, ReactNode, useEffect, Dispatch } from 'react';
import * as SecureStore from 'expo-secure-store';

// --- Types ---

export interface Wallet {
  id: string;
  address: string;
  name: string;
  privateKey?: string; // Store securely!
  seedPhrase?: string; // Store securely!
}

export interface Network {
  id: string;
  name: string;
  rpcUrl: string;
}

interface WalletState {
  wallets: Wallet[];
  activeWalletId: string | null;
  networks: Network[];
  activeNetworkId: string | null;
  isLoading: boolean; // To handle async loading
}

type WalletAction =
  | { type: 'SET_WALLETS'; payload: Wallet[] }
  | { type: 'ADD_WALLET'; payload: Wallet }
  | { type: 'SET_ACTIVE_WALLET'; payload: string }
  | { type: 'SET_NETWORKS'; payload: Network[] }
  | { type: 'ADD_NETWORK'; payload: Network }
  | { type: 'SET_ACTIVE_NETWORK'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'RESTORE_STATE'; payload: Partial<WalletState> };

interface WalletContextProps {
  state: WalletState;
  dispatch: Dispatch<WalletAction>;
  activeWallet: Wallet | null;
  activeNetwork: Network | null;
  // Add helper functions derived from state/dispatch here if needed
}

// --- Initial State & Reducer ---

const initialState: WalletState = {
  wallets: [],
  activeWalletId: null,
  networks: [
    // Default networks (as per spec section 4.3)
    { id: 'sui-mainnet', name: 'Sui Mainnet', rpcUrl: 'https://fullnode.mainnet.sui.io:443' },
    { id: 'sui-testnet', name: 'Sui Testnet', rpcUrl: 'https://fullnode.testnet.sui.io:443' },
    { id: 'sui-devnet', name: 'Sui Devnet', rpcUrl: 'https://fullnode.devnet.sui.io:443' },
  ],
  activeNetworkId: 'sui-mainnet', // Default to mainnet
  isLoading: true,
};

const walletReducer = (state: WalletState, action: WalletAction): WalletState => {
  switch (action.type) {
    case 'SET_WALLETS':
      return { ...state, wallets: action.payload };
    case 'ADD_WALLET': { // TODO: Securely store PK/Seed
      const newWallets = [...state.wallets, action.payload];
      const newState = {
         ...state,
         wallets: newWallets,
         // Optionally set the new wallet as active
         activeWalletId: state.activeWalletId ?? action.payload.id,
      };
      // Persist changes (async)
      SecureStore.setItemAsync('walletState', JSON.stringify({ wallets: newState.wallets, activeWalletId: newState.activeWalletId }));
      return newState;
    }
    case 'SET_ACTIVE_WALLET': {
      const newState = { ...state, activeWalletId: action.payload };
      SecureStore.setItemAsync('walletState', JSON.stringify({ wallets: newState.wallets, activeWalletId: newState.activeWalletId }));
      return newState;
    }
    case 'SET_NETWORKS':
      return { ...state, networks: action.payload };
    case 'ADD_NETWORK': { // TODO: Add UI for this
      const newNetworks = [...state.networks, action.payload];
      const newState = { ...state, networks: newNetworks };
      SecureStore.setItemAsync('networkState', JSON.stringify({ networks: newState.networks, activeNetworkId: newState.activeNetworkId }));
      return newState;
    }
    case 'SET_ACTIVE_NETWORK': {
      const newState = { ...state, activeNetworkId: action.payload };
      SecureStore.setItemAsync('networkState', JSON.stringify({ networks: newState.networks, activeNetworkId: newState.activeNetworkId }));
      return newState;
    }
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'RESTORE_STATE':
      return { ...state, ...action.payload, isLoading: false };
    default:
      return state;
  }
};

// --- Context ---

const WalletContext = createContext<WalletContextProps | undefined>(undefined);

// --- Provider Component ---

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(walletReducer, initialState);

  // Effect to load state from SecureStore on mount
  useEffect(() => {
    const restoreState = async () => {
      try {
        const savedWalletState = await SecureStore.getItemAsync('walletState');
        const savedNetworkState = await SecureStore.getItemAsync('networkState');
        
        let restoredState: Partial<WalletState> = {};

        if (savedWalletState) {
          const { wallets, activeWalletId } = JSON.parse(savedWalletState);
          // TODO: Need to securely fetch private keys/seeds based on IDs if not storing them directly in SecureStore JSON
          restoredState = { ...restoredState, wallets: wallets || [], activeWalletId: activeWalletId || null };
        }
        if (savedNetworkState) {
          const { networks, activeNetworkId } = JSON.parse(savedNetworkState);
          restoredState = { ...restoredState, networks: networks || initialState.networks, activeNetworkId: activeNetworkId || initialState.activeNetworkId };
        }

        dispatch({ type: 'RESTORE_STATE', payload: restoredState });

      } catch (error) {
        console.error("Failed to restore wallet state:", error);
        dispatch({ type: 'SET_LOADING', payload: false }); // Stop loading even if error
      }
    };

    restoreState();
  }, []);

  // Derive active wallet and network from state
  const activeWallet = state.wallets.find(w => w.id === state.activeWalletId) || null;
  const activeNetwork = state.networks.find(n => n.id === state.activeNetworkId) || null;

  return (
    <WalletContext.Provider value={{ state, dispatch, activeWallet, activeNetwork }}>
      {children}
    </WalletContext.Provider>
  );
};

// --- Hook ---

export const useWallet = (): WalletContextProps => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}; 