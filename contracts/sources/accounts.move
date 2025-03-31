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
use pismo_protocol::positions::{Position, PositionType, u64_to_position_type, new_position_internal, amount as position_amount, leverage_multiplier, entry_price, entry_price_decimals, supported_positions_token_i};
use pismo_protocol::tokens::{get_price_pyth, get_price_feed_bytes_pyth, get_PYTH_MAX_PRICE_AGE_SECONDS, normalize_value};
use pismo_protocol::signed::{SignedU64, sub_signed_u64, is_positive, Sign, new_signed_u64, new_sign, amount as signed_amount, sign, add_signed_u64};
use pismo_protocol::main::Global;

const E_ACCOUNT_PROGRAM_MISMATCH: u64 = 0;
const E_TOKEN_INFO_PRICE_FEED_MISMATCH: u64 = 1;
const E_COLLATERAL_VALUE_TOO_OLD: u64 = 2;

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

public(package) fun sum_and_assert_collateral_values_are_recent(account: &Account, clock: &Clock): u128 {
    let mut sum = 0;
    let mut i = 0;
    while(i < account.collateral_values.length()){
        sum = sum + account.collateral_values[i];
        assert!(account.collateral_value_update_times[i] + get_PYTH_MAX_PRICE_AGE_SECONDS() <= clock.timestamp_ms(), E_COLLATERAL_VALUE_TOO_OLD);
        i = i + 1;
    };
    sum
}



public fun single_position_upnl(
    position_size: u64,
    leverage: u64,
    entry_asset_price: u64,
    cur_asset_price: u64,
    token_decimals: u8,
    shared_decimals: u8
): SignedU64 {
    let entry_value = normalize_value((position_size * leverage * entry_asset_price) as u128, token_decimals, shared_decimals);
    let cur_value = normalize_value((position_size * leverage * cur_asset_price) as u128, token_decimals, shared_decimals);
    
    sub_signed_u64(cur_value as u64, entry_value as u64)
}

public fun sum_account_positions_upnl_pyth(
    account: &Account,
    program: &Program,
    positions: &vector<Position>,
    price_infos: &vector<PriceInfoObject>,
    clock: &Clock,
    shared_decimals: u8
): SignedU64 {
    assert!(vector::length(positions) == account.num_open_positions, 0);
    
    assert!(vector::length(price_infos) == vector::length(positions), 0);

    let mut total_upnl = new_signed_u64(0, new_sign(true));
    let mut i = 0;
    
    while (i < vector::length(positions)) {
        let position = vector::borrow(positions, i);
        let price_info = vector::borrow(price_infos, i);
        
        let token_id = program.supported_positions().borrow(supported_positions_token_i(position));
        
        let (cur_price, _) = get_price_pyth(price_info, clock);
        
        let position_upnl = single_position_upnl(
            position_amount(position),
            leverage_multiplier(position) as u64,
            entry_price(position),
            cur_price,
            token_id.token_decimals(),
            shared_decimals
        );
        
        total_upnl = add_signed_u64(&total_upnl, &position_upnl);
        
        i = i + 1;
    };
    
    total_upnl
}

// public fun assert_maintence_margin(
//     account: &Account,
//     position_size: u64,
//     leverage: u64,
//     entry_asset_price: u64,
//     cur_asset_price: u64
// ) {
    ////This needs to sum the positions upnls, and assert that the sum is > 0
// }

public fun assert_inital_margin(
    collateral_value: u64,
    position_size: u64,
    mark_price: u64,
    leverage: u64
) { 
    assert!(collateral_value >= (position_size * mark_price / leverage), 0);
}

public fun open_position_pyth(
    global: &Global,
    account: &mut Account, 
    program: &Program,
    pos_type_int: u64, 
    pos_amount: u64, 
    leverage_multiplier: u16,
    program_pos_i: u64,
    price_info: &PriceInfoObject,
    clock: &Clock,
    ctx: &mut TxContext
) {
    assert!(account.id() == program.id(), E_ACCOUNT_PROGRAM_MISMATCH);
    let token_id = program.supported_positions().borrow(program_pos_i);
    assert!(token_id.price_feed_id_bytes() == get_price_feed_bytes_pyth(price_info), E_TOKEN_INFO_PRICE_FEED_MISMATCH);

    let pos_type = u64_to_position_type(pos_type_int);

    let (entry_price, entry_price_decimals) = get_price_pyth(price_info, clock);


    // let collateral_value = 
    // assert_inital_margin(collateral_value, pos_amount, entry_price, leverage_multiplier);

    account.increment_open_positions();

    new_position_internal(
        global,
        pos_type,
        pos_amount,
        leverage_multiplier,
        entry_price,
        entry_price_decimals,
        program_pos_i,
        account.id(),
        ctx
    );
}

// public fun close_position_pyth(
//     position: Position,
//     price_info: &PriceInfoObject,
//     clock: &Clock,
//     ctx: &mut TxContext
// ){
//     assert!(account.id() == program.id(), E_ACCOUNT_PROGRAM_MISMATCH);
//     let token_id = program.supported_positions().borrow(program_pos_i);
//     assert!(token_id.price_feed_id_bytes() == get_price_feed_bytes_pyth(price_info), E_TOKEN_INFO_PRICE_FEED_MISMATCH);

//     let (exit_price, exit_price_decimal) = get_price_pyth(price_info, clock);

// }