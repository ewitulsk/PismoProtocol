module pismo_protocol::programs;

use sui::clock::Clock;
use sui::coin::Coin;
use sui::balance::Balance;
use sui::transfer;
use sui::object::UID;
use sui::tx_context::TxContext;

use std::vector;
use std::string::{Self, String};
use std::type_name;
use std::debug;
use std::u128::pow;

use pismo_protocol::main::AdminCap;
use pismo_protocol::tokens::{TokenIdentifier, new_token_identifier};

public struct Program has key {
    id: UID,
    supported_collateral: vector<TokenIdentifier>,
    shared_price_decimals: u8, //This is the precision that each asset will be evaluated on DEFAULT WILL BE 10.
    supported_positions: vector<TokenIdentifier>,
    max_leverage: vector<u16>
}

public(package) fun init_program_internal(ctx: &mut TxContext, init_collateral: vector<TokenIdentifier>, supported_positions: vector<TokenIdentifier>, shared_price_decimals: u8, max_leverage: vector<u16>): Program {
    Program { 
        id: object::new(ctx), 
        supported_collateral: init_collateral,
        shared_price_decimals,
        supported_positions,
        max_leverage
    }
}

/// Initializes a program with a single collateral type derived from InitCoinType and no positions.
public entry fun init_program_single_token_collateral_and_positions<InitCoinType>(
    admin_cap: &AdminCap, // Keep admin cap for consistency with init_program
    init_collateral_price_feed_id_bytes: vector<u8>,
    init_collateral_oracle_feed_id: u16, // 0: pyth
    shared_price_decimals: u8,
    ctx: &mut TxContext
) {
    let type_str_ascii = type_name::get<InitCoinType>().into_string();
    let type_str = string::from_ascii(type_str_ascii);

    let collateral_token_id = new_token_identifier(
        type_str,
        shared_price_decimals,
        init_collateral_price_feed_id_bytes,
        init_collateral_oracle_feed_id
    );

    let position_token_id = new_token_identifier(
        type_str,
        shared_price_decimals,
        init_collateral_price_feed_id_bytes,
        init_collateral_oracle_feed_id
    );

    let collateral_identifiers = vector::singleton(collateral_token_id);
    let position_identifiers = vector::singleton(position_token_id);
    let max_leverage = vector::singleton(150);

    transfer::share_object(
        init_program_internal(ctx, collateral_identifiers, position_identifiers, shared_price_decimals, max_leverage)
    );
}

public(package) fun supported_collateral(program: &Program): &vector<TokenIdentifier>{
    &program.supported_collateral
}

public(package) fun supported_positions(program: &Program): &vector<TokenIdentifier>{
    &program.supported_positions
}

public(package) fun id(program: &Program): address {
    program.id.to_address()
}

public(package) fun shared_price_decimals(program: &Program): u8 {
    program.shared_price_decimals
}

#[test_only]
public(package) fun destroy_program(program: Program){
    let Program {id, supported_collateral: _, shared_price_decimals: _, supported_positions: _, max_leverage: _} = program;
    object::delete(id);
}

public entry fun add_supported_collateral<CoinType>(
    _admin_cap: &AdminCap, 
    program: &mut Program,
    price_feed_id: vector<u8>,    
    oracle_id: u16,                
    _ctx: &mut TxContext          
) {
    let type_str_ascii = type_name::get<CoinType>().into_string();
    let token_type_name = std::string::from_ascii(type_str_ascii);

    let token_id = new_token_identifier(
        token_type_name,
        program.shared_price_decimals,
        price_feed_id,
        oracle_id
    );
    vector::push_back(&mut program.supported_collateral, token_id);
}

public entry fun add_supported_position<CoinType>(
    _admin_cap: &AdminCap, 
    program: &mut Program,
    price_feed_id: vector<u8>,     
    oracle_id: u16,               
    max_leverage_for_position: u16, 
    _ctx: &mut TxContext 
) {
    let type_str_ascii = type_name::get<CoinType>().into_string();
    let token_type_name = std::string::from_ascii(type_str_ascii);

    let token_id = new_token_identifier(
        token_type_name,
        program.shared_price_decimals,
        price_feed_id,
        oracle_id
    );
    vector::push_back(&mut program.supported_positions, token_id);
    vector::push_back(&mut program.max_leverage, max_leverage_for_position);
}

