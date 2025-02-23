import { SuiPriceServiceConnection, SuiPythClient } from "@pythnetwork/pyth-sui-js";
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { bcs } from '@mysten/bcs';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({ path: '.env' });

const SUI_PACKAGE_ID = "0x817544ad4c18ce45ab0cf52e13c7eb790c27309bd00d1a0956951cb20d8f5e11"

type CollateralIdentifier = {
    token_info: string,
    price_feed_id_bytes: Uint8Array
}

const collateral_identifier = bcs.struct("CollateralIdentifier", {
    token_info: bcs.string(),
    price_feed_id_bytes: bcs.vector(bcs.u8())
})

async function main() {
    const private_key = process.env.PRIVATE_KEY as string;
    const keypair = Ed25519Keypair.fromSecretKey(private_key);
    console.log("PubKey: ", keypair.getPublicKey().toSuiAddress())

    // // use getFullnodeUrl to define Devnet RPC location
    const rpcUrl = getFullnodeUrl('testnet');
     
    // // create a client connected to devnet
    const client = new SuiClient({ url: rpcUrl });

    const collateral_id: CollateralIdentifier =  {
        token_info: "0x2::sui::SUI",
        price_feed_id_bytes: Uint8Array.from([])
    }
    const serialized = collateral_identifier.serialize(collateral_id).toBytes();
    console.log(serialized);
    
    const tx0 = new Transaction();
    tx0.moveCall({
        target: `${SUI_PACKAGE_ID}::main::init_program`,
        arguments: [ // other arguments needed for your contract
            tx0.makeMoveVec({elements: [tx0.pure(serialized)]}),
        ],
    });



    // const tx1 = new Transaction();
    // tx1.moveCall({
    //     target: `${SUI_PACKAGE_ID}::main::init_account`,
    //     arguments: [ // other arguments needed for your contract
    //         tx0.object(`${SUI_PACKAGE_ID}::main::Program`),
    //     ],
    // });
     
    // Create the wallet from the client and keypair
    client.signAndExecuteTransaction({
        transaction: tx0,
        signer: keypair,
    });

    // client.signAndExecuteTransaction({
    //     transaction: tx1,
    //     signer: keypair,
    // });
}

// Execute the main function
main().catch(console.error);
