import { SuiPriceServiceConnection, SuiPythClient } from "@pythnetwork/pyth-sui-js";
import { getFullnodeUrl, SuiClient, SuiParsedData } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { bcs } from '@mysten/bcs';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({ path: '.env' });

const SUI_PACKAGE_ID = "0xd5af04e89698e14fce936f81c35f870c600495e9dc3cc388ffeff53b6133744c"
const SUI_PROGRAM_IDS = [
    "0x6a26b69d6c50b5aa4f1a265f1f4fad974c2180056e3648eec5a9153d54463af3", 
    "0xd95cbc6186556a02b12b7fc063095d9551541bd33c15b5732778d34ce15b8f7e",
    "0x172dbb6be8562b9674a305c8fd2003cbe9489696871678e2750ced88dfc7cf98"
] // This will change after every deployment.

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
            "23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744",
            'hex'
        )
    )];
    let position_token_infos = [`${SUI_PACKAGE_ID}::test_coin::TEST_COIN`.replace("0x", "")];
    let position_price_feed_id_bytes = [Uint8Array.from(
        Buffer.from(
            "23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744",
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
    //         tx0.pure(bcs.vector(bcs.string()).serialize(position_token_infos).toBytes()),
    //         tx0.pure(bcs.vector(bcs.vector(bcs.u8())).serialize(position_price_feed_id_bytes).toBytes()),
    //         tx0.pure(bcs.u8().serialize(token_decimals).toBytes())
    //     ],
    // });
     
    // for(let i = 0; i < 3; i++){
    //     // Create the wallet from the client and keypair
    //     let tx = await client.signAndExecuteTransaction({
    //         transaction: tx0,
    //         signer: keypair,
    //     });
    //     console.log(tx.digest);
    // }
    



    /////////////// MINT TEST TOKEN

    // const treasury_cap = `0x2::coin::TreasuryCap<${SUI_PACKAGE_ID}::test_coin::TEST_COIN>`;
    // const amount = "100000000000000000";

    // const owned = await client.getOwnedObjects({
    //     owner: sender,
    //     filter: {
    //         MatchAny: [{
    //             StructType: treasury_cap
    //         }]
    //     }
    // })

    // const mint_tx = new Transaction();
    // mint_tx.moveCall({
    //     target: `${SUI_PACKAGE_ID}::test_coin::mint`,
    //     arguments: [ // other arguments needed for your contract
    //         mint_tx.object(owned.data[0].data?.objectId as string),
    //         mint_tx.pure(bcs.u64().serialize(amount).toBytes()),
    //         mint_tx.pure.address(sender)
    //     ],
    // });

    // let tx = await client.signAndExecuteTransaction({
    //     transaction: mint_tx,
    //     signer: keypair,
    // });
    // console.log(`TX: ${tx.digest}`);


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

    const accounts = await client.getOwnedObjects({
        owner: sender,
        filter: {
            MatchAll: [
                {
                    StructType: `${SUI_PACKAGE_ID}::accounts::Account`
                }
            ]
        }
    })

    for(let program_id of SUI_PROGRAM_IDS){
        console.log("Accounts: ", accounts.data[0].data?.objectId as string);
        
        let account_ids = [];
        for(let account of accounts.data) {
            let account_obj = (account.data?.objectId as string);
            let account_data = await client.getObject({id: account_obj, options: {showContent: true}});
            let account_program_id = (account_data.data?.content as any)['fields']['program_id']
            if (account_program_id == program_id){
                account_ids.push(account_obj)
            }
        }

        for(let account_id of account_ids) {
            const coin_type = `${SUI_PACKAGE_ID}::test_coin::TEST_COIN`;
            console.log(coin_type);
            const coin = `0x2::coin::Coin<${coin_type}>`;
            const coins = await client.getOwnedObjects({
                owner: sender,
                filter: {
                    MatchAll: [
                        {
                            StructType: coin
                        }
                    ]
                }
            })

            console.log(coins.data[0].data?.objectId as string);

            const post_tx = new Transaction();
            const coin_obj = post_tx.object(coins.data[0].data?.objectId as string);
            const [new_coin_obj] = post_tx.splitCoins(coin_obj, [Math.floor(Math.random() * (100000000 - 100000 + 1)) + 100000]);
            post_tx.moveCall({
                target: `${SUI_PACKAGE_ID}::collateral::post_collateral`,
                typeArguments: [coin_type],
                arguments: [ // other arguments needed for your contract
                    post_tx.object(account_id),
                    post_tx.object(program_id),
                    post_tx.object(new_coin_obj)
                ],
            });

            let tx = await client.signAndExecuteTransaction({
                transaction: post_tx,
                signer: keypair,
            });
            console.log(`TX: ${tx.digest}`);
        }
        
        
    }
    
}

// Execute the main function
main().catch(console.error);
