/*
/// Module: pismo_synthetics
module pismo_synthetics::pismo_synthetics;
*/

// For Move coding conventions, see
// https://docs.sui.io/concepts/sui-move-concepts/conventions

module pismo_protocol::main;
use sui::clock::Clock;
use sui::coin::Coin;
use sui::balance::Balance;
use sui::transfer;
use sui::object::UID;

use std::vector;
use std::string::String;

use pyth::price_info;
use pyth::price_identifier;
use pyth::price;
use pyth::pyth;
use pyth::price_info::PriceInfoObject;

const E_INVALID_PRICE_ID: u64 = 1;

public struct CollateralIdentifier has copy, drop, store {
    token_info: String,
    price_feed_id_bytes: vector<u8>
}

public struct Program has key {
    id: UID,
    supported_collateral: vector<CollateralIdentifier>,

}

public struct Collateral<phantom CoinType> has key {
    id: UID,
    coin: Balance<CoinType>
}

public struct Account has key {
    id: UID,
    //This is 1-1 to the supported_collateral vector. IE if 0x2::sui::SUI is at index 2, the balances is at index 2 of this vector
    collateral_balances: vector<u64>,
    program_id: address
}

public fun init_program(init_collateral: vector<CollateralIdentifier>, ctx: &mut TxContext) {
    transfer::transfer(
        Program { 
            id: object::new(ctx), 
            supported_collateral: init_collateral 
        }, ctx.sender()
    )
}

//Can anyone pass in a reference to an object they don't own off chain???
public fun init_account(program: &Program, ctx: &mut TxContext) {
    let Program {id, supported_collateral: _} = program;

    transfer::transfer(
        Account{
            id: object::new(ctx),
            collateral_balances: vector::empty(),
            program_id: id.to_address()
        }, 
        ctx.sender()
    )
}

//Is there any way to ensure that the Program Account is keyed on is the same program that's passed in??
public fun post_collateral<CoinType>(account: &mut Account, program: &Program, coin: Coin<CoinType>, ctx: &mut TxContext) {
    ensure_collateral_balance_length(program, &mut account.collateral_balances);

    //We need a way to get the token address from coin so that we can add it to the right collateral_balances index.

    transfer::transfer(
        Collateral<CoinType> {
            id: object::new(ctx),
            coin: coin.into_balance()
        },
        ctx.sender()
    )
}

public(package) fun ensure_collateral_balance_length(program: &Program, account_balances: &mut vector<u64>){
    let num_collat_types = program.supported_collateral.length();
    let balances_len = account_balances.length();
    let mut i = 0;
    if(balances_len > 0){
        i = balances_len;
    };
    while(i < num_collat_types){
        account_balances.push_back(0);
        i = i + 1;
    }
}

fun init(ctx: &mut TxContext) {

}

//This is a test function, use for reference later.
public fun use_pyth_price(
    clock: &Clock,
    price_info_object: &PriceInfoObject,
){
    let max_age = 60;
    // Make sure the price is not older than max_age seconds
    let price_struct = pyth::get_price_no_older_than(price_info_object,clock, max_age);

    // Check the price feed ID
    let price_info = price_info::get_price_info_from_price_info_object(price_info_object);
    let price_id = price_identifier::get_bytes(&price_info::get_price_identifier(&price_info));

    // ETH/USD price feed ID
    // The complete list of feed IDs is available at https://pyth.network/developers/price-feed-ids
    // Note: Sui uses the Pyth price feed ID without the `0x` prefix.
    assert!(price_id!=x"ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace", E_INVALID_PRICE_ID);

    // Extract the price, decimal, and timestamp from the price struct and use them
    let decimal_i64 = price::get_expo(&price_struct);
    let price_i64 = price::get_price(&price_struct);
    let timestamp_sec = price::get_timestamp(&price_struct);
}

public fun supported_collateral(program: &Program): &vector<CollateralIdentifier>{
    let Program {id: _, supported_collateral} = program;
    supported_collateral
}

public fun collateral_balances(account: &Account): &vector<u64> {
    let Account {id: _, collateral_balances, program_id: _} = account;
    collateral_balances
}

public fun new_collateral_identifier(
    token_info: String, 
    price_feed_id_bytes: vector<u8>
): CollateralIdentifier{
    CollateralIdentifier { token_info, price_feed_id_bytes }
}

#[test_only]
public(package) fun init_test_program(supported_collateral: vector<CollateralIdentifier>, ctx: &mut TxContext): Program{
    Program { id: object::new(ctx), supported_collateral }
}

#[test_only]
public(package) fun destroy_program(program: Program){
    let Program {id, supported_collateral: _} = program;
    object::delete(id);
}