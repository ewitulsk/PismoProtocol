module pismo_protocol::position_functions;

use sui::clock::Clock;
use sui::tx_context::TxContext;
use std::type_name;
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
    sum_position_original_values_truncated_decimals
};
use pismo_protocol::positions as positions;
use pismo_protocol::tokens::{get_price_pyth, get_price_feed_bytes_pyth as token_get_price_feed_bytes_pyth, amount_for_target_value_pyth};
use pismo_protocol::collateral::{
    Collateral,
    CollateralMarker,
};
use pismo_protocol::value_assertion_objects::{CollateralValueAssertionObject, sum_collateral_values_assertion, PositionValueAssertionObject, calc_position_abs_values_assertion};
use pismo_protocol::signed::{new_signed_u128, new_sign};
use pismo_protocol::main::Global;
use pismo_protocol::lp::{Vault, find_vault_address, VaultMarker};
use pismo_protocol::value_transfers::{Self};
use pyth::price_info;
use std::u128;
use std::u128::pow;
use pismo_protocol::value_assertion_objects::sum_position_values_assertion;
use sui::event;
use sui::object::{Self as object, ID};

const E_TOKEN_INFO_PRICE_FEED_MISMATCH: u64 = 1;
const E_NOT_POSITION_OWNER: u64 = 8;
const E_COLLATERAL_MUST_HAVE_ASSOCIATED_VAULT: u64 = 100;
const E_COLLATERAL_PRICE_DOES_NOT_MATCH: u64 = 1005;

public struct ClosedPositionToVaultEvent has copy, drop, store {
    account_id: address,
    position_id: address,
    program_object_id: address,
    position_token_index: u64,
    position_type: u8, // 0 for Long, 1 for Short
    exit_price: u64,
    exit_price_decimal: u8,
    loss_amount_raw: u128, // P&L in terms of position token amount (absolute value)
    loss_value_raw: u128, // P&L in terms of quote currency value (absolute value)
    collaterals_processed_count: u64, // Number of collaterals iterated over to cover the loss
    total_value_deducted_from_collaterals: u128, // Actual value taken from collaterals
}

public struct ClosedPositionToUserEvent has copy, drop, store {
    account_id: address,
    position_id: address,
    program_object_id: address,
    position_token_index: u64,
    position_type: u8, // 0 for Long, 1 for Short
    exit_price: u64,
    exit_price_decimal: u8,
    profit_amount_raw: u128, // P&L in terms of position token amount (absolute value)
    profit_value_raw: u128, // P&L in terms of quote currency value (absolute value)
    payout_vaults_count: u64, // Number of vaults used for payout
    total_value_paid_to_user: u128, // Actual value (intended to be) transferred to user
}

public fun open_position_pyth(
    account: &Account,
    stats: &mut AccountStats,
    program: &Program,
    pos_type_int: u64,
    pos_amount: u64,
    leverage_multiplier: u16,
    program_pos_i: u64,
    position_price_info: &PriceInfoObject,
    collateral_value_assertion: &CollateralValueAssertionObject,
    position_value_assertion: &PositionValueAssertionObject,
    mut all_open_positions: vector<Position>,
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

    let total_upnl = sum_position_values_assertion(position_value_assertion, clock);

    let existing_position_sizes = sum_position_original_values_truncated_decimals(&all_open_positions, program.supported_positions());
    
    assert_inital_margin(collateral_value, total_upnl,existing_position_sizes, pos_amount, token_id.token_decimals(), entry_price, entry_price_decimals, leverage_multiplier as u64);

    stats.increment_open_positions(); //We need to validate we're not double counting positions.

    new_position_internal(
        program,
        pos_type,
        pos_amount,
        leverage_multiplier,
        entry_price,
        entry_price_decimals,
        program_pos_i,
        account.id(),
        ctx
    );

    while(vector::length(&all_open_positions) > 0) {
        let all_open_positions = vector::pop_back(&mut all_open_positions);
        transfer::public_share_object(all_open_positions);
    };
    all_open_positions.destroy_empty();
} 



//We could totally do all of the proper "finding" off chain.
public fun close_position_pyth(
    program: &Program,
    account: &Account,
    stats: &mut AccountStats,
    mut position: Position,
    position_price_info_i: u64,
    mut all_collateral_markers: vector<CollateralMarker>,
    all_collateral_price_info_is: vector<u64>,
    mut all_vault_markers: vector<VaultMarker>,
    all_vault_price_info_is: vector<u64>,
    mut all_price_info_objects: vector<PriceInfoObject>,
    clock: &Clock,
    ctx: &mut TxContext
) {
    assert_account_program_match(account, program);
    assert_account_stats_match(account, stats);
    assert!(position.account_id() == account.id(), E_NOT_POSITION_OWNER);
    assert!(vector::length(&all_collateral_markers) == vector::length(&all_collateral_price_info_is), E_COLLATERAL_PRICE_DOES_NOT_MATCH);

    let position_price_info = all_price_info_objects.borrow(position_price_info_i);
    let (exit_price, exit_price_decimal) = get_price_pyth(position_price_info, clock);

    let pos_token_i = position.supported_positions_token_i();
    let position_id = position.id();
    let event_position_type = position.get_type().match_type();

    let transfer_data = close_position_internal(
        position,
        exit_price,
        exit_price_decimal,
        pos_token_i
    );
    
    let position_token_id = program.supported_positions()[pos_token_i];

    let transfer_amount = transfer_data.transfer_amount();

    let pos_token_decimals = position_token_id.token_decimals();

    let mut transfer_value = ((transfer_amount * (exit_price as u128) * pow(10, pos_token_decimals)) / (pow(10, exit_price_decimal) * pow(10, pos_token_decimals))); 
    let initial_event_pnl_value = transfer_value;

    if (transfer_data.is_transfer_to_vault()) {
        let mut actual_value_deducted_from_collaterals = 0u128;
        let mut collaterals_processed_count_for_event = 0u64;
        let mut i = 0;
        while(i < vector::length(&all_collateral_markers) && transfer_value > 0) {
            let collateral_marker = vector::borrow_mut(&mut all_collateral_markers, i);
            let collateral_token_id = collateral_marker.get_token_id();
            //find_vault_address is WILDLY inefficient and we need to change it asap.
            let maybe_vault_address = find_vault_address(&all_vault_markers, collateral_token_id.token_info());
            //When we support colalteral -> vault token swapping, we'll be able to replace this and the find_vault_address
            //Instead, we'll just evenly split the transfer value across all the vaults.
            assert!(maybe_vault_address.is_some(), E_COLLATERAL_MUST_HAVE_ASSOCIATED_VAULT);
            let vault_address = *option::borrow(&maybe_vault_address);

            let collateral_price_info_i = *vector::borrow(&all_collateral_price_info_is, i);
            let collateral_price_info = all_price_info_objects.borrow(collateral_price_info_i);
            let collateral_price_info_byte = token_get_price_feed_bytes_pyth(collateral_price_info);
            assert!(collateral_price_info_byte == collateral_token_id.price_feed_id_bytes(), E_COLLATERAL_PRICE_DOES_NOT_MATCH);

            let remaining_collateral = collateral_marker.remaining_collateral();
            let collateral_value_pre_decimals = collateral_marker.get_token_id().get_value_pyth(collateral_price_info, clock, remaining_collateral); //The decimals might be fucked up here.
            let collateral_value = collateral_value_pre_decimals * pow(10, collateral_marker.get_token_id().token_decimals()); //This is still not the BEST way to be handling decimals here, get_value_pyth shouldnt truncate, or we have seperate methods for truncating
            let mut current_collateral_value_deducted: u128;
            if(collateral_value > transfer_value){
                let amount_collateral_to_remove = amount_for_target_value_pyth( //This function could be wildly wrong.
                    &collateral_token_id,
                    collateral_price_info,
                    clock,
                    transfer_value,
                    pos_token_decimals
                );
                collateral_marker.create_collateral_transfer(amount_collateral_to_remove, vault_address, ctx);
                current_collateral_value_deducted = transfer_value;
                transfer_value = 0;
            } else {
                collateral_marker.create_collateral_transfer(remaining_collateral, vault_address, ctx);
                current_collateral_value_deducted = collateral_value;
                transfer_value = transfer_value - collateral_value;
            };
            actual_value_deducted_from_collaterals = actual_value_deducted_from_collaterals + current_collateral_value_deducted;
            i = i + 1;
        };
        collaterals_processed_count_for_event = i; // Record how many collaterals were iterated through

        event::emit(ClosedPositionToVaultEvent {
            account_id: account.id(),
            position_id: position_id,
            program_object_id: program.id(),
            position_token_index: pos_token_i,
            position_type: event_position_type,
            exit_price: exit_price,
            exit_price_decimal: exit_price_decimal,
            loss_amount_raw: transfer_data.transfer_amount(),
            loss_value_raw: initial_event_pnl_value,
            collaterals_processed_count: collaterals_processed_count_for_event,
            total_value_deducted_from_collaterals: actual_value_deducted_from_collaterals,
        });
    } else if (positions::is_transfer_to_user(&transfer_data)) {
        //For right now, this is just going to transfer value from each of the vaults equally, ideally this still happens, but a swap takes place.
        //This means that the user will get paid out in each vault token equally.
        //...That could just happen in the execute transfer... this might work out extremely easily.
        let num_vaults_total = all_vault_markers.length();

        let mut num_vaults_w_money = 0;
        let mut j = 0;
        while(j < num_vaults_total) {
            let vault_marker = all_vault_markers.borrow_mut(j);
            if(vault_marker.amount() > 0) {
                num_vaults_w_money = num_vaults_w_money + 1;
            };
            j = j + 1;
        };

        
        let target_value_per_vault = transfer_value / (num_vaults_w_money as u128); //We need to validate that we're handling this div correctly.
        let mut i = 0;
        while(i < num_vaults_total) {
            let vault_marker = all_vault_markers.borrow_mut(i);
            if(vault_marker.amount() == 0) {
                i = i + 1;
                continue;
            };
            let vault_token_id = vault_marker.token_id();
            let vault_price_info_i = *all_vault_price_info_is.borrow(i);
            let vault_price_info = all_price_info_objects.borrow(vault_price_info_i);
            let amount_to_transfer_from_vault = amount_for_target_value_pyth( //This function could be wildly wrong.
                &vault_token_id,
                vault_price_info,
                clock,
                target_value_per_vault,
                pos_token_decimals
            );
            vault_marker.create_vault_transfer(amount_to_transfer_from_vault, ctx.sender(), ctx);
            i = i + 1;
        };

        event::emit(ClosedPositionToUserEvent {
            account_id: account.id(),
            position_id: position_id,
            program_object_id: program.id(),
            position_token_index: pos_token_i,
            position_type: event_position_type,
            exit_price: exit_price,
            exit_price_decimal: exit_price_decimal,
            profit_amount_raw: transfer_data.transfer_amount(),
            profit_value_raw: initial_event_pnl_value, // This is the total profit value intended for the user
            payout_vaults_count: num_vaults_total,
            total_value_paid_to_user: initial_event_pnl_value, // Assuming the full profit value is paid out
        });
    } else {
      abort(0);
    };

    positions::destroy_transfer_data(transfer_data);

    stats.decrement_open_positions();

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

    while(vector::length(&all_price_info_objects) > 0) {
        let price_info = vector::pop_back(&mut all_price_info_objects);
        transfer::public_share_object(price_info);
    };
    all_price_info_objects.destroy_empty();
}