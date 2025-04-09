module pismo_protocol::position_functions;

use sui::clock::Clock;
use sui::tx_context::TxContext;

use std::vector;

use pyth::price_info::PriceInfoObject;

use pismo_protocol::accounts::{
    Account, AccountStats, assert_account_program_match, assert_account_stats_match,
    increment_open_positions, decrement_open_positions,
    account_id as get_account_stats_id,
    assert_inital_margin,
    num_open_positions, collateral_count, zero_out_liquidated_counters,
    id as get_account_struct_id
};
use pismo_protocol::programs::Program;
use pismo_protocol::positions::{
    Position, PositionType, u64_to_position_type, new_position_internal,
    account_id as get_position_account_id,
    supported_positions_token_i, close_position_internal, TransferData,
    destroy_positions
};
use pismo_protocol::tokens::{get_price_pyth, get_price_feed_bytes_pyth as token_get_price_feed_bytes_pyth};
use pismo_protocol::collateral::{
    Collateral, CollateralValueAssertionObject, sum_collateral_values_assertion,
    get_collateral_account_id
};
use pismo_protocol::signed::{new_signed_u128, new_sign};
use pismo_protocol::main::Global;
use pismo_protocol::lp::Vault;
use pismo_protocol::value_transfers::{Self, transfer_all_collateral_to_vault_internal, handle_transfer};

const E_TOKEN_INFO_PRICE_FEED_MISMATCH: u64 = 1;
const E_NOT_POSITION_OWNER: u64 = 8;

const E_LIQUIDATE_COLLATERAL_COUNT_MISMATCH: u64 = 100;
const E_LIQUIDATE_COLLATERAL_OWNER_MISMATCH: u64 = 101;
const E_LIQUIDATE_POSITION_COUNT_MISMATCH: u64 = 102;
const E_LIQUIDATE_POSITION_OWNER_MISMATCH: u64 = 103;

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

public(package) fun liquidate_account_internal<CoinType, LPType>(
    global: &mut Global,
    account_stats: &mut AccountStats,
    all_collateral: &mut vector<Collateral<CoinType>>,
    all_positions: &mut vector<Position>,
    vault: &mut Vault<CoinType, LPType>,
    ctx: &mut TxContext
) {
    let account_addr = get_account_stats_id(account_stats);

    let provided_collateral_count = vector::length(all_collateral);
    assert!(provided_collateral_count == account_stats.collateral_count(), E_LIQUIDATE_COLLATERAL_COUNT_MISMATCH);
    let mut i = 0;
    while (i < provided_collateral_count) {
        let collat = vector::borrow(all_collateral, i);
        assert!(get_collateral_account_id(collat) == account_addr, E_LIQUIDATE_COLLATERAL_OWNER_MISMATCH);
        i = i + 1;
    };

    let provided_position_count = vector::length(all_positions);
    assert!(provided_position_count == num_open_positions(account_stats), E_LIQUIDATE_POSITION_COUNT_MISMATCH);
    i = 0;
    while (i < provided_position_count) {
        let pos = vector::borrow(all_positions, i);
        assert!(get_position_account_id(pos) == account_addr, E_LIQUIDATE_POSITION_OWNER_MISMATCH);
        i = i + 1;
    };

    zero_out_liquidated_counters(account_stats);

    destroy_positions(all_positions);

    transfer_all_collateral_to_vault_internal<CoinType, LPType>(
        global,
        all_collateral,
        vault,
        account_stats,
        ctx
    );
}