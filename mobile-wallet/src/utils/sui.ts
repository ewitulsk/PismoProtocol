import { Wallet } from '../context/WalletContext';
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64, fromHex, MIST_PER_SUI } from '@mysten/sui/utils';
import { generateMnemonic as generateBipMnemonic } from '@scure/bip39';
import { wordlist as bip39Wordlist } from '@scure/bip39/wordlists/english';

// Helper: convert whatever privateKey representation the app receives into a Sui Ed25519Keypair
const keypairFromPrivateKey = (privateKey: string): Ed25519Keypair => {
  try {
    // First try to parse as Bech32 encoded secret key – this is the format returned by keypair.getSecretKey()
    return Ed25519Keypair.fromSecretKey(privateKey);
  } catch {
    // Fallback to raw hex string (optionally prefixed with 0x)
    const hex = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
    return Ed25519Keypair.fromSecretKey(fromHex(hex));
  }
};

// --- Placeholder Functions --- 
// Replace these with actual implementations using a Sui SDK (e.g., @mysten/sui.js) or direct RPC calls

/**
 * Fetches the balance for a given Sui address from the specified RPC endpoint.
 */
export const fetchBalance = async (address: string, rpcUrl: string): Promise<string> => {
  const client = new SuiClient({ url: rpcUrl });
  const { totalBalance } = await client.getBalance({ owner: address });
  // Convert the balance (in MIST – 1 SUI = 1_000_000_000 MIST) to readable SUI string
  const suiBalance = (BigInt(totalBalance) / BigInt(MIST_PER_SUI)).toString();
  return suiBalance;
};

/**
 * Generates a new mnemonic phrase.
 */
export const generateMnemonic = (strength: 12 | 24 = 24): string[] => {
  const bits = strength === 24 ? 256 : 128; // 24‑word mnemonics use 256 bits of entropy, 12‑word use 128 bits
  const mnemonic = generateBipMnemonic(bip39Wordlist, bits);
  return mnemonic.split(' ');
};

/**
 * Imports a wallet from a private key.
 * Derives the address and stores relevant info.
 */
export const importPrivateKey = async (privateKey: string, name: string): Promise<Wallet> => {
  const keypair = keypairFromPrivateKey(privateKey);
  return {
    id: `pk-${Date.now()}`,
    address: keypair.getPublicKey().toSuiAddress(),
    name,
    privateKey, // Store securely elsewhere in a real application
    seedPhrase: undefined,
  };
};

/**
 * Imports a wallet from a seed phrase.
 * Derives the private key and address.
 */
export const importSeedPhrase = async (seedPhrase: string[], name: string): Promise<Wallet> => {
  const phrase = seedPhrase.join(' ');
  const keypair = Ed25519Keypair.deriveKeypair(phrase);
  const bech32PrivKey = keypair.getSecretKey();
  return {
    id: `seed-${Date.now()}`,
    address: keypair.getPublicKey().toSuiAddress(),
    name,
    privateKey: bech32PrivKey, // Store securely
    seedPhrase: phrase, // Store securely
  };
};

/**
 * Creates a new wallet from a generated seed phrase.
 */
export const createWalletFromSeed = async (seedPhrase: string[], name: string): Promise<Wallet> => {
  return importSeedPhrase(seedPhrase, name);
};

/**
 * Signs raw BCS transaction data.
 */
export const signTransaction = async (rawData: string, privateKey: string): Promise<string> => {
  const keypair = keypairFromPrivateKey(privateKey);
  const bytes = fromBase64(rawData);
  const { signature } = await keypair.signTransaction(bytes);
  return signature;
};

/**
 * Signs a personal message (UTF-8 string).
 */
export const signPersonalMessage = async (message: string, privateKey: string): Promise<string> => {
  const keypair = keypairFromPrivateKey(privateKey);
  const messageBytes = new TextEncoder().encode(message);
  const { signature } = await keypair.signPersonalMessage(messageBytes);
  return signature;
};

// --- Helper Functions (Example) ---

// You might need functions to format balances, addresses, etc.
// const formatBalance = (balance: bigint | string | number, decimals = 9): string => {
//   // Implementation to convert balance (e.g., MIST) to SUI string
//   return (BigInt(balance) / BigInt(10 ** decimals)).toString();
// }; 