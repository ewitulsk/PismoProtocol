module pismo_protocol::programs;

use sui::clock::Clock;
use sui::coin::Coin;
use sui::balance::Balance;
use sui::transfer;
use sui::object::UID;

use std::vector;
use std::string::String;
use std::type_name;
use std::debug;
use std::u128::pow;

public struct CollateralIdentifier has copy, drop, store {
    token_info: String,
    token_decimals: u8,
    price_feed_id_bytes: vector<u8>
}

public struct Program has key {
    id: UID,
    supported_collateral: vector<CollateralIdentifier>,
    shared_price_decimals: u8 //This is the precision that each asset will be evaluated on DEFAULT WILL BE 10.
}

public entry fun init_program(init_token_info: vector<String>, init_price_feed_id_bytes: vector<vector<u8>>, shared_price_decimals: u8, ctx: &mut TxContext) {
    let mut collateral_identifiers = vector::empty<CollateralIdentifier>();
    let mut i = 0;
    while(i < init_token_info.length()){
        let info = init_token_info[i];
        let feed_id = init_price_feed_id_bytes[i];
        collateral_identifiers.push_back(CollateralIdentifier {
            token_info: info,
            token_decimals: shared_price_decimals,
            price_feed_id_bytes: feed_id,
        });
        i = i + 1;
    };
    transfer::share_object(
        init_program_internal(ctx, collateral_identifiers, shared_price_decimals)
    );
}

public(package) fun init_program_internal(ctx: &mut TxContext, init_collateral: vector<CollateralIdentifier>, shared_price_decimals: u8): Program {
    Program { 
        id: object::new(ctx), 
        supported_collateral: init_collateral,
        shared_price_decimals
    }
}

public(package) fun supported_collateral(program: &Program): &vector<CollateralIdentifier>{
    &program.supported_collateral
}

public(package) fun id(program: &Program): address {
    program.id.to_address()
}

public(package) fun shared_price_decimals(program: &Program): u8 {
    program.shared_price_decimals
}

#[test_only]
public(package) fun destroy_program(program: Program){
    let Program {id, supported_collateral: _, shared_price_decimals: _} = program;
    object::delete(id);
}

public(package) fun new_collateral_identifier(
    token_info: String, 
    token_decimals: u8,
    price_feed_id_bytes: vector<u8>
): CollateralIdentifier {
    CollateralIdentifier { token_info, token_decimals, price_feed_id_bytes }
}

public(package) fun token_info(collateral: &CollateralIdentifier): String {
    collateral.token_info
}

public(package) fun token_decimals(collateral: &CollateralIdentifier): u8 {
    collateral.token_decimals
}

public(package) fun price_feed_id_bytes(collateral: &CollateralIdentifier): vector<u8> {
    collateral.price_feed_id_bytes
}

