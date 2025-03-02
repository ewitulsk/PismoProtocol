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

use pismo_protocol::main::AdminCap;
use pismo_protocol::tokens::{TokenIdentifier, new_token_identifier};

public struct Program has key {
    id: UID,
    supported_collateral: vector<TokenIdentifier>,
    shared_price_decimals: u8 //This is the precision that each asset will be evaluated on DEFAULT WILL BE 10.
}

public entry fun init_program(_: &AdminCap, init_token_info: vector<String>, init_price_feed_id_bytes: vector<vector<u8>>, shared_price_decimals: u8, ctx: &mut TxContext) {
    let mut collateral_identifiers = vector::empty<TokenIdentifier>();
    let mut i = 0;
    while(i < init_token_info.length()){
        let info = init_token_info[i];
        let feed_id = init_price_feed_id_bytes[i];
        collateral_identifiers.push_back(new_token_identifier(
            info,
            shared_price_decimals,
            feed_id,
        ));
        i = i + 1;
    };
    transfer::share_object(
        init_program_internal(ctx, collateral_identifiers, shared_price_decimals)
    );
}

public(package) fun init_program_internal(ctx: &mut TxContext, init_collateral: vector<TokenIdentifier>, shared_price_decimals: u8): Program {
    Program { 
        id: object::new(ctx), 
        supported_collateral: init_collateral,
        shared_price_decimals
    }
}

public(package) fun supported_collateral(program: &Program): &vector<TokenIdentifier>{
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

