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
};
use pismo_protocol::positions as positions;
use pismo_protocol::tokens::{get_price_pyth, get_price_feed_bytes_pyth as token_get_price_feed_bytes_pyth, amount_for_target_value_pyth};
use pismo_protocol::collateral::{
    Collateral, CollateralValueAssertionObject, sum_collateral_values_assertion,
    CollateralMarker,
};
use pismo_protocol::signed::{new_signed_u128, new_sign};
use pismo_protocol::main::Global;
use pismo_protocol::lp::{Vault, find_vault_address, VaultMarker};
use pismo_protocol::value_transfers::{Self};

const E_TOKEN_INFO_PRICE_FEED_MISMATCH: u64 = 1;
const E_NOT_POSITION_OWNER: u64 = 8;
const E_COLLATERAL_MUST_HAVE_ASSOCIATED_VAULT: u64 = 100;
const E_COLLATERAL_PRICE_DOES_NOT_MATCH: u64 = 1005;

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
} 

public fun close_position_pyth(
    global: &mut Global,
    program: &Program,
    account: &Account,
    stats: &mut AccountStats,
    position: Position,
    position_price_info: &PriceInfoObject,
    all_collateral_markers: &mut vector<CollateralMarker>,
    all_collateral_price_info: &vector<PriceInfoObject>,
    all_vault_markers: &mut vector<VaultMarker>,
    all_vault_price_info: &vector<PriceInfoObject>,
    clock: &Clock,
    ctx: &mut TxContext
) {
    assert_account_program_match(account, program);
    assert_account_stats_match(account, stats);
    assert!(position.account_id() == account.id(), E_NOT_POSITION_OWNER);
    assert!(vector::length(all_collateral_markers) == vector::length(all_collateral_price_info), E_COLLATERAL_PRICE_DOES_NOT_MATCH);

    let (exit_price, exit_price_decimal) = get_price_pyth(position_price_info, clock);

    let pos_token_i = supported_positions_token_i(&position);

    let transfer_data = close_position_internal(
        position,
        exit_price,
        exit_price_decimal,
        pos_token_i
    );
    
    let mut transfer_value = transfer_data.transfer_amount();
    if (transfer_data.is_transfer_to_vault()) {
        let mut i = 0;
        while(i < vector::length(all_collateral_markers) || transfer_value == 0) {
            let collateral_price_info = vector::borrow(all_collateral_price_info, i);
            let collateral_marker = vector::borrow_mut(all_collateral_markers, i);
            let collateral_token_id = collateral_marker.get_token_id();
            //find_vault_address is WILDLY inefficient and we need to change it asap.
            let maybe_vault_address = find_vault_address(all_vault_markers, collateral_token_id.token_info());
            //When we support colalteral -> vault token swapping, we'll be able to replace this and the find_vault_address
            //Instead, we'll just evenly split the transfer value across all the vaults.
            assert!(maybe_vault_address.is_some(), E_COLLATERAL_MUST_HAVE_ASSOCIATED_VAULT);
            let vault_address = *option::borrow(&maybe_vault_address);

            let collateral_price_info_byte = token_get_price_feed_bytes_pyth(collateral_price_info);
            assert!(collateral_price_info_byte == collateral_token_id.price_feed_id_bytes(), E_COLLATERAL_PRICE_DOES_NOT_MATCH);

            let remaining_collateral = collateral_marker.remaining_collateral();
            let collateral_value = collateral_marker.get_token_id().get_value_pyth(collateral_price_info, clock, remaining_collateral, collateral_token_id.token_decimals()); //The decimals might be fucked up here.
            if(collateral_value > transfer_value){
                let amount_collateral_to_remove = amount_for_target_value_pyth( //This function could be wildly wrong.
                    &collateral_token_id,
                    collateral_price_info,
                    clock,
                    transfer_value,
                    collateral_token_id.token_decimals() //This isn't right. We need to rethink how we're handling shared decimals
                );
                collateral_marker.create_collateral_transfer(amount_collateral_to_remove, vault_address, ctx);
                transfer_value = 0;
            } else {
                collateral_marker.create_collateral_transfer(remaining_collateral, vault_address, ctx);
                transfer_value = transfer_value - collateral_value;
            }
            
        };
    } else if (positions::is_transfer_to_user(&transfer_data)) {
        //For right now, this is just going to transfer value from each of the vaults equally, ideally this still happens, but a swap takes place.
        //This means that the user will get paid out in each vault token equally.
        //...That could just happen in the execute transfer... this might work out extremely easily.
        let num_vaults = all_vault_markers.length();
        let target_value_per_vault = transfer_value / (num_vaults as u128); //We need to validate that we're handling this div correctly.
        let mut i = 0;
        while(i < num_vaults) {
            let vault_marker = all_vault_markers.borrow_mut(i);
            let vault_token_id = vault_marker.token_id();
            let vault_price_info = all_vault_price_info.borrow(i);
            let transfer_value = amount_for_target_value_pyth( //This function could be wildly wrong.
                &vault_token_id,
                vault_price_info,
                clock,
                target_value_per_vault,
                vault_token_id.token_decimals() //This isn't right. We need to rethink how we're handling shared decimals
            );
            vault_marker.create_vault_transfer(transfer_value, ctx.sender(), ctx);
        };
    } else {
      abort(0);
    };

    positions::destroy_transfer_data(transfer_data);

    stats.decrement_open_positions();
}