module pismo_protocol::position_functions;

use sui::clock::Clock;
use sui::tx_context::TxContext;

use std::vector;

use pyth::price_info::PriceInfoObject;

use pismo_protocol::accounts::{Account, assert_account_program_match, increment_open_positions, id as account_id, assert_inital_margin};
use pismo_protocol::programs::Program;
use pismo_protocol::positions::{Position, PositionType, u64_to_position_type, new_position_internal};
use pismo_protocol::tokens::{get_price_pyth, get_price_feed_bytes_pyth as token_get_price_feed_bytes_pyth};
use pismo_protocol::collateral::{Collateral, CollateralValueAssertionObject, sum_collateral_values_assertion};
use pismo_protocol::signed::{new_signed_u128, new_sign};
use pismo_protocol::main::Global;

const E_TOKEN_INFO_PRICE_FEED_MISMATCH: u64 = 1;

public fun open_position_pyth(
    global: &Global,
    account: &mut Account,
    program: &Program,
    pos_type_int: u64,
    pos_amount: u64,
    leverage_multiplier: u16,
    program_pos_i: u64,
    position_price_info: &PriceInfoObject,
    collateral_value_assertion: &CollateralValueAssertionObject,
    clock: &Clock,
    ctx: &mut TxContext
) {
    assert_account_program_match(account, program);
    let token_id = program.supported_positions().borrow(program_pos_i);
    assert!(token_id.price_feed_id_bytes() == token_get_price_feed_bytes_pyth(position_price_info), E_TOKEN_INFO_PRICE_FEED_MISMATCH);

    let pos_type = u64_to_position_type(pos_type_int);

    let (entry_price, entry_price_decimals) = get_price_pyth(position_price_info, clock);

    let total_collateral_value_u128 = sum_collateral_values_assertion(collateral_value_assertion, clock);
    let collateral_value = new_signed_u128(total_collateral_value_u128, new_sign(true));
    
    assert_inital_margin(collateral_value, pos_amount, entry_price, leverage_multiplier as u64);

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