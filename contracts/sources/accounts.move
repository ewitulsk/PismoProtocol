module pismo_protocol::accounts;

use sui::clock::Clock;
use sui::coin::Coin;
use sui::balance::{Self, Balance};
use sui::transfer;
use sui::object::{Self, UID, ID};
use sui::tx_context::TxContext;
use sui::address;
use sui::event;

use std::vector;
use std::string::String;
use std::type_name;
use std::debug;
use std::u128::pow;

use pyth::price_info::PriceInfoObject;

use pismo_protocol::programs::Program;
use pismo_protocol::positions::{
    Position,
    amount as position_amount, leverage_multiplier, entry_price,
    account_id as position_account_id
};
use pismo_protocol::tokens::get_price_pyth;
use pismo_protocol::signed::{SignedU128, is_positive, amount as signed_amount, sub_u128_from_signed, add_signed_u128};
use pismo_protocol::collateral::{Collateral};
use pismo_protocol::main::Global;
use pismo_protocol::lp::Vault;
use std::u128;
use std::u64;
use pismo_protocol::signed::sub_signed_u128;

const E_ACCOUNT_PROGRAM_MISMATCH: u64 = 0;
const E_INVALID_INITAL_MARGIN: u64 = 3;
const E_NO_REMAINING_COLLATERAL: u64 = 4;
const E_COLLATERAL_ACCOUNT_MISMATCH: u64 = 9;
const E_INPUT_LENGTH_MISMATCH: u64 = 12;
const E_ACCOUNT_STATS_MISMATCH: u64 = 13;

// Define the NewAccount event struct
public struct NewAccountEvent has copy, drop {
    account_id: address,
    stats_id: address
}

//Accounts are owned objects, but we need to modify these fields without requiring the user to provide the account object
public struct AccountStats has key { //We should normalize this to be name "AccountMarker"
    id: UID,
    account_id: address,
    num_open_positions: u64,
    collateral_count: u64
}

public struct Account has key {
    id: UID,
    program_id: address,
    stats_id: ID
}

public entry fun init_account(program: &Program, ctx: &mut TxContext) {
    let account_uid = object::new(ctx);
    let account_addr = object::uid_to_address(&account_uid);

    let stats = AccountStats {
        id: object::new(ctx),
        account_id: account_addr,
        num_open_positions: 0,
        collateral_count: 0
    };
    let stats_id = object::id(&stats);
    let stats_addr = object::id_to_address(&stats_id);
    transfer::share_object(stats);

    let account = Account{
        id: account_uid,
        program_id: program.id(),
        stats_id: stats_id
    };

    // Emit the NewAccount event
    event::emit(NewAccountEvent {
        account_id: account_addr,
        stats_id: stats_addr
    });

    transfer::transfer(account, ctx.sender());
}

public(package) fun assert_account_stats_match(account: &Account,stats: &AccountStats) {
    assert!(id(account) == stats.account_id, E_ACCOUNT_STATS_MISMATCH);
}

public(package) fun account_id(stats: &AccountStats): address {
    stats.account_id
}

public(package) fun collateral_count(stats: &AccountStats): u64 {
    stats.collateral_count
}

public(package) fun num_open_positions(stats: &AccountStats): u64 {
    stats.num_open_positions
}

public(package) fun increment_collateral_count(stats: &mut AccountStats) {
    stats.collateral_count = stats.collateral_count + 1;
}

public(package) fun decrement_collateral_count(stats: &mut AccountStats) {
    stats.collateral_count = stats.collateral_count - 1;
}

public(package) fun increment_open_positions(stats: &mut AccountStats) {
    stats.num_open_positions = stats.num_open_positions + 1;
}

public(package) fun decrement_open_positions(stats: &mut AccountStats) {
    stats.num_open_positions = stats.num_open_positions - 1;
}

public(package) fun zero_out_liquidated_counters(stats: &mut AccountStats) {
    stats.num_open_positions = 0;
    stats.collateral_count = 0;
}

public(package) fun id(account: &Account): address {
    account.id.to_address()
}

public(package) fun stats_id(account: &Account): ID {
    account.stats_id
}

public(package) fun assert_account_program_match(account: &Account, program: &Program) {
    assert!(account.program_id == program.id(), E_ACCOUNT_PROGRAM_MISMATCH);
}

public fun calc_inital_margin(
    position_size: u64,
    position_decimals: u8,
    mark_price: u64,
    mark_price_decimals: u8,
    leverage: u64
): u128 {
    let position_size_u128 = position_size as u128;
    let mark_price_u128 = mark_price as u128;
    let leverage_u128 = leverage as u128;

    let normalized_decimals = position_decimals + mark_price_decimals;

    let size_without_decimals = position_size_u128 * mark_price_u128 / leverage_u128;
    size_without_decimals / pow(10, normalized_decimals) //This effectively truncates the decimal, which is fine, inital margin can be within +/- $1
}

public fun assert_inital_margin( //Inital margin needs to take into account position values too...
    collateral_value_truncated_decimals: SignedU128, //The expectation is that the collateral decimals have been truncated by this point
    position_value_truncated_decimals: SignedU128, //The expectation is that the collateral decimals have been truncated by this point
    existing_position_values: u128,
    position_size: u64,
    position_decimals: u8,
    mark_price: u64,
    mark_price_decimals: u8,
    leverage: u64
) { 
    let account_value = add_signed_u128(&collateral_value_truncated_decimals, &position_value_truncated_decimals);
    let remaining_collateral = sub_u128_from_signed(&account_value, existing_position_values);

    assert!(is_positive(&remaining_collateral), E_NO_REMAINING_COLLATERAL);
    assert!(signed_amount(&remaining_collateral) >= calc_inital_margin(position_size, position_decimals, mark_price, mark_price_decimals, leverage), E_INVALID_INITAL_MARGIN);
}