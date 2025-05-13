import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { SUI_PRIVATE_KEY, SUI_RPC_URL } from './config';

if (!SUI_PRIVATE_KEY) {
    throw new Error('SUI_PRIVATE_KEY is not defined in environment variables. Ensure .env file is correctly set up.');
}

// Use decodeSuiPrivateKey, assuming SUI_PRIVATE_KEY is in the format it expects (e.g., base64 with or without suiprivkey prefix)
// If SUI_PRIVATE_KEY is raw hex, the previous Buffer.from(hex, 'hex') was more direct for Ed25519Keypair.fromSecretKey.
// Given deployment-manager uses decodeSuiPrivateKey, we align with that.
// The user must ensure SUI_PRIVATE_KEY in .env is compatible with decodeSuiPrivateKey.
let decodedKey;
try {
    decodedKey = decodeSuiPrivateKey(SUI_PRIVATE_KEY);
} catch (error) {
    console.error("Failed to decode SUI_PRIVATE_KEY. Ensure it's a valid Sui private key string (Base64, potentially with 'suiprivkey' prefix). Error:", error);
    // Fallback for raw hex private key if that was the user's intention for "HEX_WITHOUT_0x"
    if (SUI_PRIVATE_KEY.length === 64 && /^[0-9a-fA-F]+$/.test(SUI_PRIVATE_KEY)) {
        console.log("Attempting to use SUI_PRIVATE_KEY as raw hex for Ed25519Keypair.fromSecretKey");
        const privateKeyBytes = Buffer.from(SUI_PRIVATE_KEY, 'hex');
        decodedKey = { secretKey: privateKeyBytes, schema: 'ed25519' }; // Mocking structure for consistency below
    } else {
        throw new Error('SUI_PRIVATE_KEY is not in a recognizable format for decodeSuiPrivateKey or as raw hex.');
    }
}

export const keypair = Ed25519Keypair.fromSecretKey(decodedKey.secretKey);
export const suiClient = new SuiClient({ url: SUI_RPC_URL }); 