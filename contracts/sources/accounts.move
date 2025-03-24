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

use pyth::price_info::PriceInfoObject;

use pismo_protocol::programs::Program;
use pismo_protocol::positions::{Position, PositionType, u64_to_position_type, new_position_internal};
use pismo_protocol::tokens::{get_price_pyth, get_price_feed_bytes_pyth};

const E_ACCOUNT_PROGRAM_MISMATCH: u64 = 0;
const E_TOKEN_INFO_PRICE_FEED_MISMATCH: u64 = 1;

public struct Account has key {
    id: UID,
    //This is 1-1 to the supported_collateral vector. IE if 0x2::sui::SUI is at index 2, the balance is at index 2 of this vector
    collateral_balances: vector<u64>,
    collateral_values: vector<u128>,
    collateral_value_update_times: vector<u64>,
    program_id: address,
    num_open_positions: u64
}

//Can you have multiple of the same type of object?
public entry fun init_account(program: &Program, ctx: &mut TxContext) {

    transfer::transfer(
        Account{
            id: object::new(ctx),
            collateral_balances: vector::empty(),
            collateral_values: vector::empty(),
            collateral_value_update_times: vector::empty(),
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

public(package) fun collateral_values(account: &Account): vector<u128> {
    account.collateral_values
}

public(package) fun collateral_update_times(account: &Account): vector<u64> {
    account.collateral_value_update_times
}

public(package) fun collateral_values_mut(account: &mut Account): &mut vector<u128> {
    &mut account.collateral_values
}

public(package) fun collateral_update_times_mut(account: &mut Account): &mut vector<u64> {
    &mut account.collateral_value_update_times
}

public(package) fun increment_open_positions(account: &mut Account) {
    account.num_open_positions = account.num_open_positions + 1;
}

public(package) fun decrement_open_positions(account: &mut Account) {
    account.num_open_positions = account.num_open_positions - 1;
}

public(package) fun id(account: &Account): address {
    account.id.to_address()
}

public(package) fun assert_account_program_match(account: &Account, program: &Program) {
    assert!(account.program_id == program.id(), E_ACCOUNT_PROGRAM_MISMATCH);
}

public(package) fun set_collateral_value(account: &mut Account, collateral_i: u64, value: u128, clock: &Clock){
    account.collateral_values.push_back(value);
    account.collateral_values.swap_remove(collateral_i);
    account.collateral_value_update_times.push_back(clock.timestamp_ms());
    account.collateral_value_update_times.swap_remove(collateral_i);
}

public fun assert_maintence_margin() {
    //
}

public fun open_position_pyth_no_leverage(
    account: &mut Account, 
    program: &Program,
    pos_type_int: u64, 
    pos_amount: u64, 
    program_pos_i: u64,
    price_info: &PriceInfoObject,
    clock: &Clock,
    ctx: &mut TxContext
) {
    assert!(account.id() == program.id(), E_ACCOUNT_PROGRAM_MISMATCH);
    let token_id = program.supported_positions().borrow(program_pos_i);
    assert!(token_id.price_feed_id_bytes() == get_price_feed_bytes_pyth(price_info), E_TOKEN_INFO_PRICE_FEED_MISMATCH);

    let pos_type = u64_to_position_type(pos_type_int);

    assert_maintence_margin();

    let (entry_price, entry_price_decimals) = get_price_pyth(price_info, clock);

    account.increment_open_positions();

    new_position_internal(
        pos_type,
        pos_amount,
        1,
        entry_price,
        entry_price_decimals,
        program_pos_i,
        account.id(),
        ctx
    );
}