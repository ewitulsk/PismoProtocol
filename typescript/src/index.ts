import { SuiPriceServiceConnection, SuiPythClient } from "@pythnetwork/pyth-sui-js";
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({ path: '.env' });

const SUI_PACKAGE_ID = "0x38c1ba22d155543aa4ea21624b6d93301753a5aeb99f030484ef0683c8b2d77f"

async function main() {
    const private_key = process.env.PRIVATE_KEY as string;
    const keypair = Ed25519Keypair.fromSecretKey(private_key);
    console.log("PubKey: ", keypair.getPublicKey().toSuiAddress())
    // Get the Stable Hermes service URL from https://docs.pyth.network/price-feeds/api-instances-and-providers/hermes
    const connection = new SuiPriceServiceConnection("https://hermes-beta.pyth.network");
     
    const priceIDs = [
        // You can find the IDs of prices at https://pyth.network/developers/price-feed-ids
        "0xca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6" // ETH/USD price ID
    ];
     
    const priceUpdateData = await connection.getPriceFeedsUpdateData(priceIDs);

    // // use getFullnodeUrl to define Devnet RPC location
    const rpcUrl = getFullnodeUrl('testnet');
     
    // // create a client connected to devnet
    const client = new SuiClient({ url: rpcUrl });

    // Get the state IDs of the Pyth and Wormhole contracts from
    // https://docs.pyth.network/price-feeds/contract-addresses/sui
    const wormholeStateId = "0x31358d198147da50db32eda2562951d53973a0c0ad5ed738e9b17d88b213d790";
    const pythStateId = "0x243759059f4c3111179da5878c12f68d612c21a8d54d85edc86164bb18be1c7c";
     
    const pythClient = new SuiPythClient(client, pythStateId, wormholeStateId);
    const tx = new Transaction();
    const priceInfoObjectIds = await pythClient.updatePriceFeeds(tx, priceUpdateData, priceIDs);
     
    tx.moveCall({
        target: `${SUI_PACKAGE_ID}::main::use_pyth_price`,
        arguments: [ // other arguments needed for your contract
            tx.object("0x6"),
            tx.object(priceInfoObjectIds[0]),
        ],
    });
     
    // Create the wallet from the client and keypair
    client.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
    });

    
}

// Execute the main function
main().catch(console.error);
