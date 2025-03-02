import { SuiPythClient } from "@pythnetwork/pyth-sui-js";
import { SuiPriceServiceConnection } from './SuiPriceServiceConnection';
import { getFullnodeUrl, SuiClient, SuiObjectChange, SuiParsedData } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { bcs } from '@mysten/bcs';
import * as dotenv from 'dotenv';
import { SUI_PACKAGE_ID, SUI_PROGRAM_ID } from "./constants";
import { execSync } from "child_process";
import path from "path";

// Load environment variables from .env file
dotenv.config({ path: '.env' });

async function main() {
    const private_key = process.env.PRIVATE_KEY as string;
    const keypair = Ed25519Keypair.fromSecretKey(private_key);
    const sender = keypair.getPublicKey().toSuiAddress();
    const sender_bytes = keypair.getPublicKey().toSuiBytes()

    // // use getFullnodeUrl to define Devnet RPC location
    const rpcUrl = getFullnodeUrl('testnet');
     
    // // create a client connected to devnet
    const client = new SuiClient({ url: rpcUrl });

    let collateral_token_infos = [`${SUI_PACKAGE_ID}::test_coin::TEST_COIN`.replace("0x", "")];
    let collateral_price_feed_id_bytes = [Uint8Array.from(
        Buffer.from(
            "50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266",
            'hex'
        )
    )];
    let position_token_infos = [`${SUI_PACKAGE_ID}::test_coin::TEST_COIN`.replace("0x", "")];
    let position_price_feed_id_bytes = [Uint8Array.from(
        Buffer.from(
            "50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266",
            'hex'
        )
    )];
    let token_decimals = 10;

    /////////////// INIT PROGRAM

    // const admin_cap = `${SUI_PACKAGE_ID}::main::AdminCap`;
    // const owned_admin_caps = await client.getOwnedObjects({
    //     owner: sender,
    //     filter: {
    //         MatchAny: [{
    //             StructType: admin_cap
    //         }]
    //     }
    // })
    // const admin_cap_obj = owned_admin_caps.data[0].data?.objectId as string
    // console.log(`Admin Cap: ${admin_cap_obj}`)

    // const tx0 = new Transaction();
    // tx0.moveCall({
    //     target: `${SUI_PACKAGE_ID}::programs::init_program`,
    //     arguments: [ // other arguments needed for your contract
    //         tx0.object(admin_cap_obj),
    //         tx0.pure(bcs.vector(bcs.string()).serialize(collateral_token_infos).toBytes()),
    //         tx0.pure(bcs.vector(bcs.vector(bcs.u8())).serialize(collateral_price_feed_id_bytes).toBytes()),
    //         tx0.pure(bcs.vector(bcs.u16()).serialize([0]).toBytes()),
    //         tx0.pure(bcs.vector(bcs.string()).serialize(position_token_infos).toBytes()),
    //         tx0.pure(bcs.vector(bcs.vector(bcs.u8())).serialize(position_price_feed_id_bytes).toBytes()),
    //         tx0.pure(bcs.vector(bcs.u16()).serialize([0]).toBytes()),
    //         tx0.pure(bcs.u8().serialize(token_decimals).toBytes())
    //     ],
    // });
     
    // // Create the wallet from the client and keypair
    // let tx = await client.signAndExecuteTransaction({
    //     transaction: tx0,
    //     signer: keypair,
    // });
    // console.log(tx.digest);



    
    



    /////////////// MINT TEST TOKEN

    const treasury_cap = `0x2::coin::TreasuryCap<${SUI_PACKAGE_ID}::test_coin::TEST_COIN>`;
    const amount = 1000000000000;

    const owned = await client.getOwnedObjects({
        owner: sender,
        filter: {
            MatchAny: [{
                StructType: treasury_cap
            }]
        }
    })

    const mint_tx = new Transaction();
    mint_tx.moveCall({
        target: `${SUI_PACKAGE_ID}::test_coin::mint`,
        arguments: [ // other arguments needed for your contract
            mint_tx.object(owned.data[0].data?.objectId as string),
            mint_tx.pure(bcs.u64().serialize(amount).toBytes()),
            mint_tx.pure.address(sender)
        ],
    });

    let tx = await client.signAndExecuteTransaction({
        transaction: mint_tx,
        signer: keypair,
    });
    console.log(`TX: ${tx.digest}`);


    /////////////// INIT ACCOUNT

    // for( let program_id of SUI_PROGRAM_IDS) {
    //     console.log(program_id)
    //     const program = await client.getObject({
    //         id: program_id
    //     })
    
    //     console.log("Program: ", program);
    
    //     const tx1 = new Transaction();
    //     tx1.moveCall({
    //         target: `${SUI_PACKAGE_ID}::accounts::init_account`,
    //         arguments: [ // other arguments needed for your contract
    //             tx1.object(program_id)
    //         ],
    //     });
    
    //     let tx = await client.signAndExecuteTransaction({
    //         transaction: tx1,
    //         signer: keypair,
    //     });
    //     console.log(`TX: ${tx.digest}`);
    // }

    


    /////////// POST COLLATERAL

    // const accounts = await client.getOwnedObjects({
    //     owner: sender,
    //     filter: {
    //         MatchAll: [
    //             {
    //                 StructType: `${SUI_PACKAGE_ID}::accounts::Account`
    //             }
    //         ]
    //     }
    // })
    // console.log("Accounts: ", accounts.data[0].data?.objectId as string);

    // const coin_type = `${SUI_PACKAGE_ID}::test_coin::TEST_COIN`;
    // console.log(coin_type);
    // const coin = `0x2::coin::Coin<${coin_type}>`;
    // const coins = await client.getOwnedObjects({
    //     owner: sender,
    //     filter: {
    //         MatchAll: [
    //             {
    //                 StructType: coin
    //             }
    //         ]
    //     }
    // })

    // console.log(coins.data[0].data?.objectId as string);

    // // program_id = 0xb0825f9a2c68ea451def4e0c19effb4cde4d1009050acc1374fbeadff2617b76

    // // Supported Collat Off Chain = 0x965cfd351f350edad61596f502b85bc9f32c18681be7a18093bc126618cb2f6d::test_coin::TEST_COIN
    // // 0x965cfd351f350edad61596f502b85bc9f32c18681be7a18093bc126618cb2f6d::test_coin::TEST_COIN


    // const post_tx = new Transaction();
    // const coin_obj = post_tx.object(coins.data[0].data?.objectId as string);
    // const [new_coin_obj] = post_tx.splitCoins(coin_obj, [100]);
    // post_tx.moveCall({
    //     target: `${SUI_PACKAGE_ID}::collateral::post_collateral`,
    //     typeArguments: [coin_type],
    //     arguments: [ // other arguments needed for your contract
    //         post_tx.object(accounts.data[0].data?.objectId as string),
    //         post_tx.object(SUI_PROGRAM_ID),
    //         post_tx.object(new_coin_obj)
    //     ],
    // });

    // let tx = await client.signAndExecuteTransaction({
    //     transaction: post_tx,
    //     signer: keypair,
    // });
    // console.log(`TX: ${tx.transaction?.txSignatures}`);
}

// Execute the main function
main().catch(console.error);
