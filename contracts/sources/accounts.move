module pismo_protocol::accounts;

use sui::clock::Clock;
use sui::coin::Coin;
use sui::balance::{Self, Balance};
use sui::transfer;
use sui::object::{Self, UID, ID};
use sui::tx_context::TxContext;
use sui::address;

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
use pismo_protocol::tokens::{get_price_pyth, normalize_value};
use pismo_protocol::signed::{SignedU128, sub_signed_u128, is_positive, Sign, new_signed_u128, new_sign, amount as signed_amount, sign, add_signed_u128, is_negative};
use pismo_protocol::collateral::{Collateral};
use pismo_protocol::main::Global;
use pismo_protocol::lp::Vault;

const E_ACCOUNT_PROGRAM_MISMATCH: u64 = 0;
const E_INVALID_INITAL_MARGIN: u64 = 3;
const E_HOW_TF_DID_YOU_GET_A_NEGATIVE_COLLATERAL_VALUE: u64 = 4;
const E_COLLATERAL_ACCOUNT_MISMATCH: u64 = 9;
const E_INPUT_LENGTH_MISMATCH: u64 = 12;
const E_ACCOUNT_STATS_MISMATCH: u64 = 13;

public struct AccountStats has key {
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
    transfer::share_object(stats);

    let account = Account{
        id: account_uid,
        program_id: program.id(),
        stats_id: stats_id
    };

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

public(package) fun assert_account_stats_program_positions_match(
    account: &Account,
    stats: &AccountStats,
    program: &Program,
    positions: &vector<Position>
) {
    assert_account_stats_match(account, stats);
    assert_account_program_match(account, program);
    let account_struct_id = id(account);
    let mut i = 0;
    while (i < vector::length(positions)) {
        let position = vector::borrow(positions, i);
        assert!(position_account_id(position) == account_struct_id, E_ACCOUNT_STATS_MISMATCH);
        i = i + 1;
    };
}

public fun single_position_upnl(
    position_size: u64,
    leverage: u64,
    entry_asset_price: u64,
    cur_asset_price: u64,
    token_decimals: u8,
    shared_decimals: u8
): SignedU128 {
    let position_size_u128 = position_size as u128;
    let leverage_u128 = leverage as u128;
    let entry_asset_price_u128 = entry_asset_price as u128;
    let cur_asset_price_u128 = cur_asset_price as u128;

    let entry_value = normalize_value(position_size_u128 * leverage_u128 * entry_asset_price_u128, token_decimals, shared_decimals);
    let cur_value = normalize_value(position_size_u128 * leverage_u128 * cur_asset_price_u128, token_decimals, shared_decimals);
    
    sub_signed_u128(cur_value, entry_value)
}

public fun account_positions_upnl(
    account: &Account, 
    stats: &AccountStats,
    program: &Program,
    positions: &vector<Position>,
    price_infos: &vector<PriceInfoObject>,
    clock: &Clock,
    shared_decimals: u8
): SignedU128 {
    assert_account_stats_program_positions_match(account, stats, program, positions);
    assert!(vector::length(positions) == stats.num_open_positions, E_ACCOUNT_STATS_MISMATCH);
    assert!(vector::length(price_infos) == vector::length(positions), E_INPUT_LENGTH_MISMATCH);

    let mut total_upnl = new_signed_u128(0, new_sign(true));
    let mut i = 0;
    
    while (i < vector::length(positions)) {
        let position = vector::borrow(positions, i);
        let price_info = vector::borrow(price_infos, i);
                
        let (cur_price, pyth_decimals) = get_price_pyth(price_info, clock);
        
        let position_upnl = single_position_upnl(
            position_amount(position),
            leverage_multiplier(position) as u64,
            entry_price(position),
            cur_price,
            pyth_decimals,
            shared_decimals
        );
        
        total_upnl = add_signed_u128(&total_upnl, &position_upnl);
        
        i = i + 1;
    };
    
    total_upnl
}

public fun calc_inital_margin(
    position_size: u64,
    mark_price: u64,
    leverage: u64
): u128 {
    let position_size_u128 = position_size as u128;
    let mark_price_u128 = mark_price as u128;
    let leverage_u128 = leverage as u128;
    position_size_u128 * mark_price_u128 / leverage_u128
}

public fun assert_inital_margin(
    collateral_value: SignedU128,
    position_size: u64,
    mark_price: u64,
    leverage: u64
) { 
    assert!(is_positive(&collateral_value), E_HOW_TF_DID_YOU_GET_A_NEGATIVE_COLLATERAL_VALUE);
    assert!(signed_amount(&collateral_value) > calc_inital_margin(position_size, mark_price, leverage), E_INVALID_INITAL_MARGIN);
}