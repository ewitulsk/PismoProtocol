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

// public entry fun init_program(
//     _: &AdminCap, 
//     init_collateral_token_info: vector<String>, 
//     init_collateral_price_feed_id_bytes: vector<vector<u8>>, 
//     init_collateral_oracle_feed_id: vector<u16>, // 0: pyth
//     init_positions_info: vector<String>,
//     init_positions_price_feed_id_bytes: vector<vector<u8>>,
//     init_position_oracle_feed_id: vector<u16>, // 0: pyth
//     init_max_leverage: vector<u16>,
//     shared_price_decimals: u8, 
//     ctx: &mut TxContext
// ) {
//     let mut collateral_identifiers = vector::empty<TokenIdentifier>();
//     let mut i = 0;
//     while(i < init_collateral_token_info.length()){
//         let info = init_collateral_token_info[i];
//         let feed_id = init_collateral_price_feed_id_bytes[i];
//         let oracle_feed_id = init_collateral_oracle_feed_id[i];
//         collateral_identifiers.push_back(new_token_identifier(
//             info,
//             shared_price_decimals,

//             feed_id,
//             oracle_feed_id
//         ));
//         i = i + 1;
//     };

//     let mut position_identifiers = vector::empty<TokenIdentifier>();
//     let mut j = 0;
//     while(j < init_positions_info.length()) {
//         let info = init_positions_info[j];
//         let feed_id = init_positions_price_feed_id_bytes[j];
//         let oracle_feed_id = init_position_oracle_feed_id[j];
//         position_identifiers.push_back(new_token_identifier(
//             info,
//             shared_price_decimals,
//             feed_id,
//             oracle_feed_id
//         ));
//         j = j + 1;
//     };

//     transfer::share_object(
//         init_program_internal(ctx, collateral_identifiers, position_identifiers, shared_price_decimals, init_max_leverage)
//     );
// }

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

    let collateral_identifiers = vector::singleton(collateral_token_id);
    let position_identifiers = vector::empty<TokenIdentifier>();
    let max_leverage = vector::empty<u16>(); // No positions, so no max leverage needed

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

