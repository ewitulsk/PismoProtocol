module pismo_protocol::accounts;

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

use pismo_protocol::programs::Program;
use pismo_protocol::positions::{Position, PositionType, u64_to_position_type, new_position};
use pismo_protocol::tokens::OracleInfoObjects;

const E_ACCOUNT_PROGRAM_MISMATCH: u64 = 0;

public struct Account has key {
    id: UID,
    //This is 1-1 to the supported_collateral vector. IE if 0x2::sui::SUI is at index 2, the balance is at index 2 of this vector
    collateral_balances: vector<u64>,
    program_id: address,
    num_open_positions: u64
}

//Can you have multiple of the same type of object?
public entry fun init_account(program: &Program, ctx: &mut TxContext) {

    transfer::transfer(
        Account{
            id: object::new(ctx),
            collateral_balances: vector::empty(),
            program_id: program.id(),
            num_open_positions: 0
        }, 
        ctx.sender()
    )
}

public(package) fun collateral_balances(account: &Account): &vector<u64> {
    &account.collateral_balances
}

public(package) fun collateral_balances_mut(account: &mut Account): &mut vector<u64> {
    &mut account.collateral_balances
}

public(package) fun id(account: &Account): address {
    account.id.to_address()
}

public(package) fun assert_account_program_match(account: &Account, program: &Program) {
    assert!(account.program_id == program.id(), E_ACCOUNT_PROGRAM_MISMATCH);
}

public fun assert_maintence_margin() {
    //
}

public fun open_position(
    account: &mut Account, 
    program: &Program,
    pos_type_int: u64, 
    pos_amount: u64, 
    program_pos_i: u64,
    oracle_info: &OracleInfoObjects,
    ctx: &mut TxContext
) {
    assert!(account.id() == program.id(), E_ACCOUNT_PROGRAM_MISMATCH);
    let pos_type = u64_to_position_type(pos_type_int);
    let token_id = program.supported_positions().borrow(program_pos_i);

    assert_maintence_margin();

    let (entry_price, entry_price_decimals) = oracle_info.get_price();

    transfer::public_transfer(
        new_position(
            pos_type,
            pos_amount,
            entry_price,
            entry_price_decimals,
            program_pos_i,
            ctx
        ), ctx.sender()
    )
}