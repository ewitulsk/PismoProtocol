module pismo_protocol::liquidation;

use sui::clock::Clock;
use sui::tx_context::TxContext;
use sui::address;

use std::vector;

use pyth::price_info::PriceInfoObject;

use pismo_protocol::accounts::{
    Account, AccountStats, assert_account_stats_program_positions_match, account_positions_upnl,
    account_id as get_account_stats_id, collateral_count, num_open_positions,
    zero_out_liquidated_counters
};
use pismo_protocol::collateral::{Collateral, get_collateral_marker_account_id, CollateralValueAssertionObject, sum_collateral_values_assertion, CollateralMarker, assert_collateral_remaining_amount, liquidate_all_markers};
use pismo_protocol::lp::Vault;
use pismo_protocol::main::Global;
use pismo_protocol::positions::{
    Position, account_id as get_position_account_id, destroy_positions
};
use pismo_protocol::programs::Program;

const E_LIQUIDATE_COLLATERAL_COUNT_MISMATCH: u64 = 100;
const E_LIQUIDATE_COLLATERAL_OWNER_MISMATCH: u64 = 101;
const E_LIQUIDATE_POSITION_COUNT_MISMATCH: u64 = 102;
const E_LIQUIDATE_POSITION_OWNER_MISMATCH: u64 = 103;
const E_NEGATIVE_TOTAL_ACCOUNT_VALUE: u64 = 5;
const E_ZERO_TOTAL_ACCOUNT_VALUE: u64 = 6;
const E_POSITIVE_TOTAL_ACCOUNT_VALUE: u64 = 7;

public fun assert_total_account_value_is_positive_pyth(
    account: &Account, 
    stats: &AccountStats,
    program: &Program,
    positions: &vector<Position>,
    collateral_assertion: &CollateralValueAssertionObject,
    price_infos: &vector<PriceInfoObject>,
    clock: &Clock
) {
    assert_account_stats_program_positions_match(account, stats, program, positions);
    let shared_decimals = program.shared_price_decimals();
    let total_positions_upnl = account_positions_upnl(
        account,
        stats,
        program,
        positions,
        price_infos,
        clock,
        shared_decimals
    );

    let total_collateral_value = sum_collateral_values_assertion(
        collateral_assertion,
        clock
    );

    let upnl_collateral_sum = total_positions_upnl.add_u128_to_signed(total_collateral_value);

    assert!(upnl_collateral_sum.is_positive(), E_NEGATIVE_TOTAL_ACCOUNT_VALUE);
}

//We also need to modify the assert_total_account_value_is_negative_pyth to accept and value collateral
//It is just asserting that the position value is negative. But really, we want to check if the 
//position value is less the the collateral value.
public fun assert_total_account_value_is_negative_pyth(
    account: &Account, 
    stats: &AccountStats,
    program: &Program,
    positions: &vector<Position>,
    collateral_assertion: &CollateralValueAssertionObject,
    price_infos: &vector<PriceInfoObject>,
    clock: &Clock
) {
    assert_account_stats_program_positions_match(account, stats, program, positions);
    let shared_decimals = program.shared_price_decimals();
    let total_positions_upnl = account_positions_upnl(
        account,
        stats,
        program,
        positions,
        price_infos,
        clock,
        shared_decimals
    );

    let total_collateral_value = sum_collateral_values_assertion(
        collateral_assertion,
        clock
    );

    let upnl_collateral_sum = total_positions_upnl.add_u128_to_signed(total_collateral_value);

    assert!(upnl_collateral_sum.is_negative(), E_POSITIVE_TOTAL_ACCOUNT_VALUE);
}




//This is a hot fucking mess....

//This assumes that the collaterals are all of the same type
//Which we don't want to be true.
//That means that transfer_all_collateral_to_vault_internal is also broken.
//We need some way of marking a collateral object as being liquidiated without having to pass in the collateral object
//The best way might just be to have a Collateral Marker that gets passed along side the collateral object.


//We also need to modify the assert_total_account_value_is_negative_pyth to accept and value collateral
//It is just asserting that the position value is negative. But really, we want to check if the 
//position value is less the the collateral value.
public(package) fun liquidate_account_internal(
    account_stats: &mut AccountStats,
    all_collateral_markers: &mut vector<CollateralMarker>,
    all_positions: &mut vector<Position>
) {
    let account_addr = get_account_stats_id(account_stats);

    let provided_collateral_count = vector::length(all_collateral_markers);
    assert!(provided_collateral_count == collateral_count(account_stats), E_LIQUIDATE_COLLATERAL_COUNT_MISMATCH);
    let mut i = 0;
    while (i < provided_collateral_count) {
        let marker = vector::borrow(all_collateral_markers, i);
        assert!(get_collateral_marker_account_id(marker) == account_addr, E_LIQUIDATE_COLLATERAL_OWNER_MISMATCH);
        assert_collateral_remaining_amount(marker, 0);
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

    liquidate_all_markers(all_collateral_markers);
}

public fun liquidate_account_pyth<CoinType, LPType>(
    account: &Account,
    stats: &mut AccountStats,
    program: &Program,
    all_positions: &mut vector<Position>,  
    collateral_assertion: &CollateralValueAssertionObject,
    all_collateral_markers: &mut vector<CollateralMarker>,           
    price_infos: &vector<PriceInfoObject>,        
    vault: &mut Vault<CoinType, LPType>,
    clock: &Clock,
) {
    assert_total_account_value_is_negative_pyth(
        account,
        stats,
        program,
        all_positions, 
        collateral_assertion,
        price_infos,  
        clock
    );

    liquidate_account_internal(
        stats,
        all_collateral_markers, 
        all_positions
    );
} 