module pismo_protocol::liquidation;

use sui::clock::Clock;
use sui::tx_context::TxContext;
use sui::address;

use std::vector;

use pyth::price_info::PriceInfoObject;

use pismo_protocol::accounts::{
    Account, AccountStats,
    account_id as get_account_stats_id, collateral_count, num_open_positions,
    zero_out_liquidated_counters
};
use pismo_protocol::collateral::{Collateral, get_collateral_marker_account_id, CollateralMarker, assert_collateral_remaining_amount, liquidate_all_markers_no_sub};
use pismo_protocol::lp::Vault;
use pismo_protocol::main::Global;
use pismo_protocol::positions::{
    Position, account_id as get_position_account_id, destroy_positions
};
use pismo_protocol::programs::Program;
use pismo_protocol::value_assertion_objects::{CollateralValueAssertionObject, sum_collateral_values_assertion, sum_position_values_assertion, assert_value_assertion_account_matches_stats};
use pismo_protocol::value_assertion_objects::PositionValueAssertionObject;
use pismo_protocol::lp::VaultMarker;
use pismo_protocol::lp::find_vault_address;

const E_LIQUIDATE_COLLATERAL_COUNT_MISMATCH: u64 = 100;
const E_LIQUIDATE_COLLATERAL_OWNER_MISMATCH: u64 = 101;
const E_LIQUIDATE_POSITION_COUNT_MISMATCH: u64 = 102;
const E_LIQUIDATE_POSITION_OWNER_MISMATCH: u64 = 103;
const E_NEGATIVE_TOTAL_ACCOUNT_VALUE: u64 = 5;
const E_ZERO_TOTAL_ACCOUNT_VALUE: u64 = 6;
const E_POSITIVE_TOTAL_ACCOUNT_VALUE: u64 = 7;
const E_LIQUIDATION_COLLATERAL_MUST_HAVE_ASSOCIATED_VAULT: u64 = 1000;

public fun assert_total_account_value_is_positive_pyth(
    stats: &AccountStats,
    collateral_assertion: &CollateralValueAssertionObject,
    position_assertion: &PositionValueAssertionObject,
    clock: &Clock
) {
    assert_value_assertion_account_matches_stats(collateral_assertion, position_assertion, stats);
    let total_positions_upnl = sum_position_values_assertion(position_assertion, clock);

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
    stats: &AccountStats,
    collateral_assertion: &CollateralValueAssertionObject,
    position_assertion: &PositionValueAssertionObject,
    clock: &Clock
) {
    assert_value_assertion_account_matches_stats(collateral_assertion, position_assertion, stats);
    let total_positions_upnl = sum_position_values_assertion(position_assertion, clock);

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
    all_vault_markers: &vector<VaultMarker>,
    all_positions: &mut vector<Position>,
    ctx: &mut TxContext
) {
    let account_addr = get_account_stats_id(account_stats);

    let provided_collateral_count = vector::length(all_collateral_markers);
    assert!(provided_collateral_count == account_stats.collateral_count(), E_LIQUIDATE_COLLATERAL_COUNT_MISMATCH);
    let mut i = 0;
    while (i < provided_collateral_count) {
        let marker = all_collateral_markers.borrow(i);
        assert!(marker.get_collateral_marker_account_id() == account_addr, E_LIQUIDATE_COLLATERAL_OWNER_MISMATCH);
        marker.assert_collateral_remaining_amount(0);
        i = i + 1;
    };

    let provided_position_count = all_positions.length();
    assert!(provided_position_count == account_stats.num_open_positions(), E_LIQUIDATE_POSITION_COUNT_MISMATCH);
    i = 0;
    while (i < provided_position_count) {
        let pos = vector::borrow(all_positions, i);
        assert!(get_position_account_id(pos) == account_addr, E_LIQUIDATE_POSITION_OWNER_MISMATCH);
        i = i + 1;
    };

    zero_out_liquidated_counters(account_stats);

    destroy_positions(all_positions);

    liquidate_all_markers_no_sub(all_collateral_markers);

    let mut i = 0;
    while(i < all_collateral_markers.length()) {
        let collateral_marker = vector::borrow_mut(all_collateral_markers, i);
        let collateral_token_id = collateral_marker.get_token_id();
        //find_vault_address is WILDLY inefficient and we need to change it asap.
        let maybe_vault_address = find_vault_address(all_vault_markers, collateral_token_id.token_info());
        //When we support colalteral -> vault token swapping, we'll be able to replace this and the find_vault_address
        //Instead, we'll just evenly split the transfer value across all the vaults.
        assert!(maybe_vault_address.is_some(), E_LIQUIDATION_COLLATERAL_MUST_HAVE_ASSOCIATED_VAULT);
        let vault_address = *option::borrow(&maybe_vault_address);

        let remaining_collateral = collateral_marker.remaining_collateral();
        collateral_marker.create_collateral_transfer(remaining_collateral, vault_address, ctx);
        i = i + 1;
    };
}

public fun liquidate_account_pyth(
    stats: &mut AccountStats,
    mut all_positions: vector<Position>,  //We really don't need this AND the PositionValueAssertionObject being passed. But we'll leave it for now.
    collateral_assertion: &CollateralValueAssertionObject,
    position_assertion: &PositionValueAssertionObject,
    mut all_collateral_markers: vector<CollateralMarker>,
    mut all_vault_markers: vector<VaultMarker>,
    clock: &Clock,
    ctx: &mut TxContext
) {
    assert_total_account_value_is_negative_pyth(
        stats,
        collateral_assertion,
        position_assertion,
        clock
    );

    liquidate_account_internal(
        stats,
        &mut all_collateral_markers, 
        &all_vault_markers,
        &mut all_positions,
        ctx
    );

    while(vector::length(&all_collateral_markers) > 0) {
        let collateral_marker = vector::pop_back(&mut all_collateral_markers);
        transfer::public_share_object(collateral_marker);
    };
    all_collateral_markers.destroy_empty();

    while(vector::length(&all_vault_markers) > 0) {
        let vault_marker = vector::pop_back(&mut all_vault_markers);
        transfer::public_share_object(vault_marker);
    };
    all_vault_markers.destroy_empty();

    while(vector::length(&all_positions) > 0) {
        let positions = vector::pop_back(&mut all_positions);
        transfer::public_share_object(positions);
    };
    all_positions.destroy_empty();
} 

// Most of this code is usable, I just need to do a lot of double checking to validate 
// that it's still right with the new marker pattern.
// The biggest difference is going to be making Transfer objects between the collateral markers and the vaults.
// (note, it looks like this uses the marker pattern already. We might be good.)