module pismo_protocol::position_functions;

use sui::clock::Clock;
use sui::tx_context::TxContext;

use std::vector;

use pyth::price_info::PriceInfoObject;

use pismo_protocol::accounts::{
    Account, AccountStats, assert_account_program_match, assert_account_stats_match,
    increment_open_positions, decrement_open_positions,
    assert_inital_margin,
    id as get_account_struct_id
};
use pismo_protocol::programs::Program;
use pismo_protocol::positions::{
    Position, PositionType, u64_to_position_type, new_position_internal,
    account_id as get_position_account_id,
    supported_positions_token_i, close_position_internal, TransferData,
};
use pismo_protocol::tokens::{get_price_pyth, get_price_feed_bytes_pyth as token_get_price_feed_bytes_pyth};
use pismo_protocol::collateral::{
    Collateral, CollateralValueAssertionObject, sum_collateral_values_assertion,
};
use pismo_protocol::signed::{new_signed_u128, new_sign};
use pismo_protocol::main::Global;
use pismo_protocol::lp::Vault;
use pismo_protocol::value_transfers::{Self, handle_transfer};

const E_TOKEN_INFO_PRICE_FEED_MISMATCH: u64 = 1;
const E_NOT_POSITION_OWNER: u64 = 8;

public fun open_position_pyth(
    global: &Global,
    account: &Account,
    stats: &mut AccountStats,
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
    assert_account_stats_match(account, stats);
    let token_id = program.supported_positions().borrow(program_pos_i);
    assert!(token_id.price_feed_id_bytes() == token_get_price_feed_bytes_pyth(position_price_info), E_TOKEN_INFO_PRICE_FEED_MISMATCH);

    let pos_type = u64_to_position_type(pos_type_int);

    let (entry_price, entry_price_decimals) = get_price_pyth(position_price_info, clock);

    let total_collateral_value_u128 = sum_collateral_values_assertion(collateral_value_assertion, clock);
    let collateral_value = new_signed_u128(total_collateral_value_u128, new_sign(true));
    
    assert_inital_margin(collateral_value, pos_amount, entry_price, leverage_multiplier as u64);

    stats.increment_open_positions(); //We need to validate we're not double counting positions.

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

public fun close_position_same_collateral_pyth<VaultCollateralCoinType, VaultLPType>(
    global: &mut Global,
    program: &Program,
    account: &Account,
    stats: &mut AccountStats,
    position: Position,
    price_info: &PriceInfoObject,
    vault: &mut Vault<VaultCollateralCoinType, VaultLPType>,
    eligible_collateral: &mut vector<Collateral<VaultCollateralCoinType>>,
    clock: &Clock,
    ctx: &mut TxContext
) {
    assert_account_program_match(account, program);
    assert_account_stats_match(account, stats);
    assert!(position.account_id() == account.id(), E_NOT_POSITION_OWNER);

    let (exit_price, exit_price_decimal) = get_price_pyth(price_info, clock);

    let pos_token_i = supported_positions_token_i(&position);

    let transfer_data = close_position_internal(
        position,
        exit_price,
        exit_price_decimal,
        pos_token_i
    );

    value_transfers::handle_transfer<VaultCollateralCoinType, VaultLPType>(
        global,
        vault,
        stats,
        transfer_data,
        eligible_collateral,
        account.id(),
        program,
        ctx
    );

    stats.decrement_open_positions();
}