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

const E_ACCOUNT_PROGRAM_MISMATCH: u64 = 0;

public struct Account has key {
    id: UID,
    //This is 1-1 to the supported_collateral vector. IE if 0x2::sui::SUI is at index 2, the balances is at index 2 of this vector
    collateral_balances: vector<u64>,
    program_id: address
}

//Can you have multiple of the same type of object?
public(package) fun init_account(program: &Program, ctx: &mut TxContext) {

    transfer::transfer(
        Account{
            id: object::new(ctx),
            collateral_balances: vector::empty(),
            program_id: program.id()
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

public(package) fun assert_account_program_match(account: &Account, program: &Program) {
    assert!(account.program_id == program.id(), E_ACCOUNT_PROGRAM_MISMATCH);
}