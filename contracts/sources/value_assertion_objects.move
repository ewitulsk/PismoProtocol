module pismo_protocol::value_assertion_objects;

use sui::clock::Clock;
use sui::tx_context::{Self, TxContext};
use sui::object::{UID}; // UID might not be directly used by the moved code but good for context if object IDs are handled.

use std::vector;
use std::u128::pow;

use pyth::price_info::PriceInfoObject;

use pismo_protocol::programs::Program;
use pismo_protocol::tokens::{
    TokenIdentifier, 
    get_PYTH_MAX_PRICE_AGE_ms,
    get_value_pyth, // Corrected: removed alias, assuming get_value_pyth is the actual method/function name
    price_feed_id_bytes as token_price_feed_id_bytes,
    get_price_pyth
};
use pismo_protocol::accounts::{
    Account, 
    AccountStats, 
    assert_account_program_match, 
    id as account_id, 
    collateral_count, 
    assert_account_stats_match,
    num_open_positions,
    single_position_upnl
};
use pismo_protocol::collateral::{
    Collateral, 
    CollateralMarker, 
    get_collateral_account_id, 
    get_collateral_index,
    id_in_vector,
    ensure_collateral_vector_length,
    id as get_collateral_object_id,
    get_collateral_marker_collateral_id
};
use pismo_protocol::positions::{
    Position, 
    account_id as position_account_id, 
    supported_positions_token_i as position_token_index, 
    amount as position_amount, 
    id as position_id,
    get_type as position_type,
    leverage_multiplier as position_leverage_multiplier,
    entry_price as position_entry_price,
    entry_price_decimals as position_entry_price_decimals
};
use pismo_protocol::signed::{SignedU128, Sign, new_signed_u128, add_signed_u128, amount as signed_amount, is_positive as signed_is_positive, new_sign as signed_new_sign}; // Added new_sign as signed_new_sign


// --- Error Constants relevant to CollateralValueAssertionObject ---
const E_COLLATERAL_ACCOUNT_MISMATCH: u64 = 9; // From accounts.move, used here
const E_COLLATERAL_PROGRAM_MISMATCH: u64 = 10; // From accounts.move, used here
const E_COLLATERAL_MARKER_MISMATCH: u64 = 10101; // Specific to collateral/marker interaction
const E_COLLATERAL_ALREADY_VISITED: u64 = 14;
const E_VISITED_TOO_MANY_COLLATERALS: u64 = 15;
const E_PRICE_OBJS_DONT_MATCH_COLLATS: u64 = 16;
const E_INCOMPLETE_COLLATERAL_ASSERTION: u64 = 17;
const E_VALUE_UPDATED_TOO_LONG_AGO: u64 = 98888;

// --- Error Constants relevant to PositionValueAssertionObject ---
const E_POSITION_ACCOUNT_MISMATCH: u64 = 18;
const E_POSITION_PROGRAM_MISMATCH: u64 = 19;
const E_POSITION_ALREADY_VISITED: u64 = 20;
const E_VISITED_TOO_MANY_POSITIONS: u64 = 21;
const E_PRICE_OBJS_DONT_MATCH_POSITIONS: u64 = 22;
const E_INCOMPLETE_POSITION_ASSERTION: u64 = 23;


public struct CollateralValueAssertionObject has store {
    account_id: address,
    program_id: address,
    num_open_collateral_objects: u64,
    visited_collateral_object_ids: vector<address>,
    collateral_values: vector<u128>,
    collateral_set_times: vector<u64>
}

public struct PositionValueAssertionObject has store {
    account_id: address,
    program_id: address,
    num_open_position_objects: u64,
    visited_position_object_ids: vector<address>,
    position_values: vector<SignedU128>, // Changed to vector<SignedU128>
    position_set_times: vector<u64>
}

public fun start_collateral_value_assertion(
    account: &Account,
    stats: &AccountStats,
    program: &Program,
    ctx: &mut TxContext
): CollateralValueAssertionObject {
    assert_account_program_match(account, program);
    assert_account_stats_match(account, stats);
    let mut collat_assertion = CollateralValueAssertionObject {
        account_id: account_id(account),
        program_id: program.id(),
        num_open_collateral_objects: collateral_count(stats),
        visited_collateral_object_ids: vector::empty<address>(),
        collateral_values: vector::empty<u128>(),
        collateral_set_times: vector::empty<u64>()
    };
    ensure_collateral_vector_length(program, &mut collat_assertion.collateral_values, 0);
    ensure_collateral_vector_length(program, &mut collat_assertion.collateral_set_times, 0);
    
    collat_assertion
}

public fun start_position_value_assertion(
    account: &Account,
    stats: &AccountStats,
    program: &Program,
    ctx: &mut TxContext // Although ctx is not used, keeping for consistency
): PositionValueAssertionObject {
    assert_account_program_match(account, program);
    assert_account_stats_match(account, stats);
    let mut pos_assertion = PositionValueAssertionObject {
        account_id: account_id(account),
        program_id: program.id(),
        num_open_position_objects: num_open_positions(stats), // Corrected to use num_open_positions function
        visited_position_object_ids: vector::empty<address>(),
        position_values: vector::empty<SignedU128>(),
        position_set_times: vector::empty<u64>()
    };
    ensure_position_vector_length(program, &mut pos_assertion.position_values, new_signed_u128(0, signed_new_sign(true))); // Use signed::new_sign
    ensure_position_vector_length(program, &mut pos_assertion.position_set_times, 0u64);
    
    pos_assertion
}

// Helper function to ensure position vector lengths match program's supported positions
fun ensure_position_vector_length<T: drop + copy>(program: &Program, vec: &mut vector<T>, default: T){
    let num_pos_types = program.supported_positions().length();
    let vec_len = vec.length();
    let mut i = 0;
    if(vec_len > 0){
        i = vec_len;
    };
    while(i < num_pos_types){
        vec.push_back(default);
        i = i + 1;
    }
}

fun assert_price_obj_match_token_id(price_obj: &PriceInfoObject, token_id: &TokenIdentifier) {
    let p_id = price_obj.get_price_info_from_price_info_object().get_price_feed().get_price_identifier().get_bytes();
    assert!(p_id == token_id.price_feed_id_bytes(), E_PRICE_OBJS_DONT_MATCH_COLLATS);
}

//This method truncates the decimals, so it is within +/- $1
public fun set_collateral_value_assertion<CoinType>(
    cva: CollateralValueAssertionObject, 
    program: &Program,
    collateral: &Collateral<CoinType>,
    collateral_marker: &mut CollateralMarker,
    price_info_obj: &PriceInfoObject,
    clock: &Clock
): CollateralValueAssertionObject {
    let mut mut_cva = cva; // Make it mutable for modifications
    let collat_acc_id = get_collateral_account_id(collateral);
    assert!(collat_acc_id == mut_cva.account_id, E_COLLATERAL_ACCOUNT_MISMATCH); 
    assert!(program.id() == mut_cva.program_id, E_COLLATERAL_PROGRAM_MISMATCH);
    // Accessing collateral_id field directly from CollateralMarker
    assert!(get_collateral_object_id(collateral) == get_collateral_marker_collateral_id(collateral_marker), E_COLLATERAL_MARKER_MISMATCH);

    let collat_obj_id = get_collateral_object_id(collateral);
    assert!(!id_in_vector(&mut_cva.visited_collateral_object_ids, collat_obj_id), E_COLLATERAL_ALREADY_VISITED); 
    
    assert!(vector::length(&mut_cva.visited_collateral_object_ids) < mut_cva.num_open_collateral_objects, E_VISITED_TOO_MANY_COLLATERALS); 

    let collat_idx = get_collateral_index(collateral);
    // Calling remaining_collateral() method on CollateralMarker
    let collat_amount = collateral_marker.remaining_collateral(); 

    let token_id = program.supported_collateral()[collat_idx];
    assert_price_obj_match_token_id(price_info_obj, &token_id);

    let collat_value = token_id.get_value_pyth(price_info_obj, clock, collat_amount, program.shared_price_decimals());

    let collateral_value_no_decimals = collat_value / pow(10, token_id.token_decimals());

    // Calling set_remaining_collateral_value() method on CollateralMarker
    collateral_marker.set_remaining_collateral_value(collat_value, clock);

    let current_val_ref = vector::borrow_mut(&mut mut_cva.collateral_values, collat_idx);
    *current_val_ref = *current_val_ref + (collateral_value_no_decimals as u128);

    vector::push_back(&mut mut_cva.visited_collateral_object_ids, collat_obj_id);

    let time_ref = vector::borrow_mut(&mut mut_cva.collateral_set_times, collat_idx);
    *time_ref = clock.timestamp_ms();
    mut_cva 
}

public fun sum_collateral_values_assertion(
    cva: &CollateralValueAssertionObject,
    clock: &Clock
): u128 {
    let visited_count = vector::length(&cva.visited_collateral_object_ids);
    assert!(visited_count == cva.num_open_collateral_objects, E_INCOMPLETE_COLLATERAL_ASSERTION);

    let mut total_value: u128 = 0;
    let mut i = 0;
    let num_values = vector::length(&cva.collateral_values);
    let current_time_ms = clock.timestamp_ms();
    let max_age_ms = get_PYTH_MAX_PRICE_AGE_ms();

    while (i < num_values) {
        let value = *vector::borrow(&cva.collateral_values, i);
        let set_time_ms = *vector::borrow(&cva.collateral_set_times, i);

        if (value > 0) {
            assert!(set_time_ms > 0, 0); 
            assert!(current_time_ms <= set_time_ms + max_age_ms, E_VALUE_UPDATED_TOO_LONG_AGO);
        };

        total_value = total_value + value;
        i = i + 1;
    };
    total_value
}

public fun destroy_collateral_value_assertion(cva: CollateralValueAssertionObject) {
    let CollateralValueAssertionObject {
        account_id: _,
        program_id: _,
        num_open_collateral_objects: _,
        visited_collateral_object_ids: _,
        collateral_values: _,
        collateral_set_times: _
    } = cva;
}

public fun set_position_value_assertion(
    pva: PositionValueAssertionObject, 
    program: &Program,
    position: &Position, // Takes a Position object
    price_info_obj: &PriceInfoObject,
    clock: &Clock
): PositionValueAssertionObject {
    let mut mut_pva = pva;

    assert!(position_account_id(position) == mut_pva.account_id, E_POSITION_ACCOUNT_MISMATCH);

    let pos_obj_id = position_id(position);
    assert!(!id_in_vector(&mut_pva.visited_position_object_ids, pos_obj_id), E_POSITION_ALREADY_VISITED);
    
    assert!(vector::length(&mut_pva.visited_position_object_ids) < mut_pva.num_open_position_objects, E_VISITED_TOO_MANY_POSITIONS);

    let pos_idx = position_token_index(position);

    let token_id = program.supported_positions()[pos_idx];
    assert_price_obj_match_token_id(price_info_obj, &token_id); 

    let (current_price_val, current_price_decimals_from_feed) = get_price_pyth(price_info_obj, clock); 
    let current_val_no_decimals = current_price_val as u128 / pow(10, current_price_decimals_from_feed);

    let entry_val_no_decimals = position.entry_price() as u128 / pow(10, position.entry_price_decimals());
    
    let pnl = single_position_upnl(
        position_leverage_multiplier(position) as u64,
        entry_val_no_decimals,
        current_val_no_decimals
    );

    let position_value_to_add = pnl; 

    let current_val_ref = vector::borrow_mut(&mut mut_pva.position_values, pos_idx);
    *current_val_ref = add_signed_u128(current_val_ref, &position_value_to_add);

    vector::push_back(&mut mut_pva.visited_position_object_ids, pos_obj_id);

    let time_ref = vector::borrow_mut(&mut mut_pva.position_set_times, pos_idx);
    *time_ref = clock.timestamp_ms();
    mut_pva 
}

public fun sum_position_values_assertion(
    pva: &PositionValueAssertionObject,
    clock: &Clock
): SignedU128 {
    let visited_count = vector::length(&pva.visited_position_object_ids);
    assert!(visited_count == pva.num_open_position_objects, E_INCOMPLETE_POSITION_ASSERTION);

    let mut total_value = new_signed_u128(0, signed_new_sign(true)); 
    let mut i = 0;
    let num_values = vector::length(&pva.position_values);
    let current_time_ms = clock.timestamp_ms();
    let max_age_ms = get_PYTH_MAX_PRICE_AGE_ms();

    while (i < num_values) {
        let value = vector::borrow(&pva.position_values, i);
        let set_time_ms = *vector::borrow(&pva.position_set_times, i);

        if (set_time_ms > 0) { 
            assert!(current_time_ms <= set_time_ms + max_age_ms, E_VALUE_UPDATED_TOO_LONG_AGO);
        };

        total_value = add_signed_u128(&total_value, value); 
        i = i + 1;
    };
    total_value
}

public fun destroy_position_value_assertion(pva: PositionValueAssertionObject) {
    let PositionValueAssertionObject {
        account_id: _,
        program_id: _,
        num_open_position_objects: _,
        visited_position_object_ids: _,
        position_values: _,
        position_set_times: _
    } = pva;
} 