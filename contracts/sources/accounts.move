module pismo_protocol::accounts;

use sui::clock::Clock;
use sui::coin::Coin;
use sui::balance::Balance;
use sui::transfer;
use sui::object::UID;
use sui::tx_context::TxContext;

use std::vector;
use std::string::String;
use std::type_name;
use std::debug;
use std::u128::pow;

use pyth::price_info::PriceInfoObject;

use pismo_protocol::programs::Program;
use pismo_protocol::positions::{
    Position, PositionType, u64_to_position_type, new_position_internal,
    amount as position_amount, leverage_multiplier, entry_price, entry_price_decimals,
    supported_positions_token_i, account_id as position_account_id, close_position_internal, TransferData
};
use pismo_protocol::tokens::{get_price_pyth, get_price_feed_bytes_pyth, get_PYTH_MAX_PRICE_AGE_SECONDS, normalize_value, get_value_pyth as token_get_value_pyth, get_price_feed_bytes_pyth as token_get_price_feed_bytes_pyth};
use pismo_protocol::signed::{SignedU128, sub_signed_u128, is_positive, Sign, new_signed_u128, new_sign, amount as signed_amount, sign, add_signed_u128, is_negative};
use pismo_protocol::main::Global;

const E_ACCOUNT_PROGRAM_MISMATCH: u64 = 0;
const E_TOKEN_INFO_PRICE_FEED_MISMATCH: u64 = 1;
const E_COLLATERAL_VALUE_TOO_OLD: u64 = 2;
const E_INVALID_INITAL_MARGIN: u64 = 3;
const E_HOW_TF_DID_YOU_GET_A_NEGATIVE_COLLATERAL_VALUE: u64 = 4;
const E_NEGATIVE_TOTAL_UPNL: u64 = 5;
const E_ZERO_TOTAL_UPNL: u64 = 6;
const E_POSITIVE_TOTAL_UPNL: u64 = 7;
const E_NOT_POSITION_OWNER: u64 = 8;
const E_COLLATERAL_ACCOUNT_MISMATCH: u64 = 9;
const E_COLLATERAL_PROGRAM_MISMATCH: u64 = 10;
const E_COLLATERAL_PRICE_FEED_MISMATCH: u64 = 11;
const E_INPUT_LENGTH_MISMATCH: u64 = 12;

public struct Account has key {
    id: UID,
    program_id: address,
    num_open_positions: u64,
    collateral_count: u64
}

//Can you have multiple of the same type of object?
public entry fun init_account(program: &Program, ctx: &mut TxContext) {

    transfer::transfer(
        Account{
            id: object::new(ctx),
            program_id: program.id(),
            num_open_positions: 0,
            collateral_count: 0
        }, 
        ctx.sender()
    )
}

public(package) fun collateral_count(account: &Account): u64 {
    account.collateral_count
}

public(package) fun increment_collateral_count(account: &mut Account) {
    account.collateral_count = account.collateral_count + 1;
}

public(package) fun decrement_collateral_count(account: &mut Account) {
    account.collateral_count = account.collateral_count - 1;
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

public fun sum_account_positions_upnl_pyth(
    account: &Account,
    program: &Program,
    positions: &vector<Position>,
    price_infos: &vector<PriceInfoObject>,
    clock: &Clock,
    shared_decimals: u8
): SignedU128 {
    assert!(vector::length(positions) == account.num_open_positions, 0);
    
    assert!(vector::length(price_infos) == vector::length(positions), 0);

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
    assert_account_program_match(account, program);
    let token_id = program.supported_positions().borrow(program_pos_i);
    assert!(token_id.price_feed_id_bytes() == token_get_price_feed_bytes_pyth(price_info), E_TOKEN_INFO_PRICE_FEED_MISMATCH);

    let pos_type = u64_to_position_type(pos_type_int);

    let (entry_price, entry_price_decimals) = get_price_pyth(price_info, clock);

    // let total_collateral_value_u128 = sum_and_assert_collateral_values_are_recent(account, clock);
    // let collateral_value = new_signed_u128(total_collateral_value_u128, new_sign(true));
    
    // assert_inital_margin(collateral_value, pos_amount, entry_price, leverage_multiplier as u64);

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
//     account: &mut Account,
//     position: Position,
//     price_info: &PriceInfoObject,
//     clock: &Clock,
//     ctx: &mut TxContext
// ) {
//     assert!(position_account_id(&position) == account.id(), E_NOT_POSITION_OWNER);

//     let (exit_price, exit_price_decimal) = get_price_pyth(price_info, clock);

//     let pos_token_i = supported_positions_token_i(&position);
//     let account_addr = account.id();

//     // Close the position internally. The returned TransferData is implicitly dropped.
//     close_position_internal(
//         position,
//         exit_price,
//         exit_price_decimal,
//         pos_token_i,
//         account_addr,
//         ctx
//     );

//     account.decrement_open_positions();
// }

public fun assert_total_upnl_is_positive_pyth(
    account: &Account,
    program: &Program,
    positions: &vector<Position>,
    price_infos: &vector<PriceInfoObject>,
    clock: &Clock
) {
    let shared_decimals = program.shared_price_decimals();
    let total_upnl = sum_account_positions_upnl_pyth(
        account,
        program,
        positions,
        price_infos,
        clock,
        shared_decimals
    );

    assert!(is_positive(&total_upnl), E_NEGATIVE_TOTAL_UPNL);
    assert!(total_upnl.amount() > 0, E_ZERO_TOTAL_UPNL);
}

public fun assert_total_upnl_is_negative_pyth(
    account: &Account,
    program: &Program,
    positions: &vector<Position>,
    price_infos: &vector<PriceInfoObject>,
    clock: &Clock
) {
    let shared_decimals = program.shared_price_decimals();
    let total_upnl = sum_account_positions_upnl_pyth(
        account,
        program,
        positions,
        price_infos,
        clock,
        shared_decimals
    );

    assert!(is_negative(&total_upnl) || signed_amount(&total_upnl) == 0, E_POSITIVE_TOTAL_UPNL);
}