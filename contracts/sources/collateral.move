module pismo_protocol::collateral;
use pyth::price_info;
use pyth::price_identifier;
use pyth::price;
use pyth::pyth;
use pyth::price_info::PriceInfoObject;

use sui::clock::Clock;
use sui::coin::{Self as coin, Coin};
use sui::balance::{Self as balance, Balance};
use sui::transfer;
use sui::object::{Self, UID};
use sui::tx_context::{Self, TxContext};

use std::vector;
use std::string::String;
use std::type_name;
use std::debug;
use std::u128::pow;

use pismo_protocol::programs::Program;
use pismo_protocol::tokens::{
    TokenIdentifier, assert_price_obj_match_identifiers_pyth, get_PYTH_ID, get_price_feed_bytes_pyth,
    get_value_pyth as token_get_value_pyth, price_feed_id_bytes as token_price_feed_id_bytes,
    get_PYTH_MAX_PRICE_AGE_ms
};
use pismo_protocol::accounts::{
    Account, assert_account_program_match, id as account_id,
    increment_collateral_count, decrement_collateral_count, collateral_count 
};
use pismo_protocol::lp::{Self as lp, Vault, deposit_coin};
use pismo_protocol::main::Global;

const E_INVALID_COLLATERAL: u64 = 9999999999;
const E_VALUE_UPDATED_TOO_LONG_AGO: u64 = 98888; // Keep for now
const E_INSUFFICIENT_COLLATERAL_PROVIDED: u64 = 97777; // Keep for now
const E_COLLATERAL_ACCOUNT_MISMATCH: u64 = 9; // New error code from accounts.move
const E_COLLATERAL_PROGRAM_MISMATCH: u64 = 10; // New error code from accounts.move
const E_COLLATERAL_PRICE_FEED_MISMATCH: u64 = 11; // New error code from accounts.move
const E_INPUT_LENGTH_MISMATCH: u64 = 12; // New error code from accounts.move
const E_CANNOT_WITHDRAW_ZERO: u64 = 13;
const E_COLLATERAL_ALREADY_VISITED: u64 = 14;
const E_VISITED_TOO_MANY_COLLATERALS: u64 = 15;
const E_PRICE_OBJS_DONT_MATCH_COLLATS: u64 = 16;
const E_INCOMPLETE_COLLATERAL_ASSERTION: u64 = 17; // Added error code


// Collateral struct needs key for sharing, and store for passing by value
public struct Collateral<phantom CoinType> has key, store {
    id: UID,
    account_id: address,
    program_id: address,
    coin: Balance<CoinType>,
    collateral_index: u64
}

public entry fun post_collateral<CoinType>(account: &mut Account, program: &Program, coin: Coin<CoinType>, ctx: &mut TxContext) {
    assert_account_program_match(account, program);

    let type_str = type_name::get<CoinType>().into_string();
    let mut i = 0;
    while(i < program.supported_collateral().length()){
        let token_id = program.supported_collateral()[i];
        if(type_str.to_string() == token_id.token_info()){
            assert!(!token_id.is_deprecated(), E_INVALID_COLLATERAL);

            transfer::share_object( 
                Collateral<CoinType> {
                    id: object::new(ctx),
                    account_id: account.id(),
                    program_id: program.id(),
                    coin: coin.into_balance(),
                    collateral_index: i
                }
            );
            account.increment_collateral_count();
            return;
        };
        i = i + 1;
    };
    assert!(false, E_INVALID_COLLATERAL);
    coin.destroy_zero();
}

public(package) fun post_collateral_to_arbitrary_account_internal<CoinType>(account_id_addr: address, program: &Program, coin: Coin<CoinType>, ctx: &mut TxContext) {
    let coin_bal = coin.value();
    let type_str = type_name::get<CoinType>().into_string();
    let mut i = 0;
    while(i < program.supported_collateral().length()){
         let token_id = program.supported_collateral()[i];
        if(type_str.to_string() == token_id.token_info()){
             // Check if token is deprecated
            assert!(!token_id.is_deprecated(), E_INVALID_COLLATERAL);
            transfer::share_object(
                Collateral<CoinType> {
                    id: object::new(ctx),
                    account_id: account_id_addr,
                    program_id: program.id(),
                    coin: coin.into_balance(),
                    collateral_index: i
                }
            );
            // Note: This internal function does *not* modify the account's counter.
            // The caller would need to manage that if using this.
            return;
        };
        i = i + 1;
    };
    assert!(false, E_INVALID_COLLATERAL);
    coin.destroy_zero();
}

// Simple internal destructor
fun destroy_collateral_internal<CoinType>(collateral: Collateral<CoinType>) {
    let Collateral {
        id,
        account_id: _,
        program_id: _,
        coin,
        collateral_index: _
    } = collateral;
    object::delete(id);
    coin.destroy_zero();
}

public(package) fun return_collateral<CoinType>(collateral: Collateral<CoinType>) {
    if (collateral.value() > 0) {
        transfer::share_object(collateral);
    }
    else{
        collateral.destroy_collateral_internal();
    };
}

public(package) fun value<CoinType>(collateral: &Collateral<CoinType>): u64 {
    collateral.coin.value()
}

// Renamed to avoid clash with imported accounts::id as account_id
public(package) fun get_collateral_account_id<CoinType>(collateral: &Collateral<CoinType>): address {
    collateral.account_id
}

// Renamed for consistency
public(package) fun get_collateral_program_id<CoinType>(collateral: &Collateral<CoinType>): address {
    collateral.program_id
}

// Renamed for consistency
public(package) fun get_collateral_index<CoinType>(collateral: &Collateral<CoinType>): u64 {
    collateral.collateral_index
}

// This function allows taking value *without* destroying the collateral object or updating the account count.
// Use with caution, primarily for internal logic like liquidations or partial withdrawals where the object persists.
public(package) fun take_coin<CoinType>(collateral: &mut Collateral<CoinType>, amount: u64): Balance<CoinType> {
    collateral.coin.split(amount)
}

public(package) fun ensure_collateral_vector_length<T: drop + copy>(program: &Program, vec: &mut vector<T>, default: T){
    let num_collat_types = program.supported_collateral().length();
    let vec_len = vec.length();
    let mut i = 0;
    if(vec_len > 0){
        i = vec_len;
    };
    while(i < num_collat_types){
        vec.push_back(default);
        i = i + 1;
    }
}

public(package) fun id_in_vector(vec: &vector<address>, id: address): bool {
    let mut i = 0;
    let len = vector::length(vec);
    while (i < len) {
        if (*vector::borrow(vec, i) == id) {
            return true
        };
        i = i + 1;
    };
    false
}

public struct CollateralValueAssertionObject has store, key {
    id: UID,
    account_id: address,
    program_id: address,
    num_open_collateral_objects: u64,
    visited_collateral_object_ids: vector<address>,
    collateral_values: vector<u128>,
    collateral_set_times: vector<u64>
}

public fun start_collateral_value_assertion(
    account: &Account,
    program: &Program,
    ctx: &mut TxContext
) {
    assert_account_program_match(account, program); 
    let mut collat_assertion = CollateralValueAssertionObject {
        id: object::new(ctx),
        account_id: account.id(), 
        program_id: program.id(), 
        num_open_collateral_objects: account.collateral_count(), 
        visited_collateral_object_ids: vector::empty<address>(),
        collateral_values: vector::empty<u128>(),
        collateral_set_times: vector::empty<u64>()
    };
    ensure_collateral_vector_length(program, &mut collat_assertion.collateral_values, 0);
    ensure_collateral_vector_length(program, &mut collat_assertion.collateral_set_times, 0);
    transfer::share_object(
        collat_assertion
    );
}

fun assert_price_obj_match_token_id(price_obj: &PriceInfoObject, token_id: &TokenIdentifier) {
    let p_id = price_obj.get_price_info_from_price_info_object().get_price_feed().get_price_identifier().get_bytes();
    assert!(p_id == token_id.price_feed_id_bytes(), E_PRICE_OBJS_DONT_MATCH_COLLATS);
}

public fun set_collateral_value_assertion<CoinType>(
    cva: &mut CollateralValueAssertionObject, 
    program: &Program,
    collateral: &Collateral<CoinType>,
    price_info_obj: &PriceInfoObject,
    clock: &Clock
) {
    let collat_acc_id = get_collateral_account_id(collateral);
    assert!(collat_acc_id == cva.account_id, E_COLLATERAL_ACCOUNT_MISMATCH); 

    assert!(program.id() == cva.program_id, E_COLLATERAL_PROGRAM_MISMATCH);

    let collat_obj_id = collateral.id.to_address();
    assert!(!id_in_vector(&cva.visited_collateral_object_ids, collat_obj_id), E_COLLATERAL_ALREADY_VISITED); 
    
    assert!(vector::length(&cva.visited_collateral_object_ids) < cva.num_open_collateral_objects, E_VISITED_TOO_MANY_COLLATERALS); 

    let collat_idx = get_collateral_index(collateral);
    let collat_amount = value(collateral);

    let token_id = program.supported_collateral()[collat_idx];
    assert_price_obj_match_token_id(price_info_obj, &token_id);

    let collat_value = token_id.token_get_value_pyth(price_info_obj, clock, collat_amount, program.shared_price_decimals());

    let current_val_ref = vector::borrow_mut(&mut cva.collateral_values, collat_idx);
    *current_val_ref = *current_val_ref + (collat_value as u128);

    vector::push_back(&mut cva.visited_collateral_object_ids, collat_obj_id);
    vector::push_back(&mut cva.collateral_set_times, clock.timestamp_ms());
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


// /// Takes exactly `amount` from the `collaterals` vector, consolidating it into a single Coin.
// /// Destroys any collateral objects emptied in the process using swap_remove.
// /// Deposits the resulting Coin into the `vault`.
// /// Asserts if the total value in `collaterals` is less than `amount`.
// public(package) fun rip_collateral_to_vault<CoinType, LPType>(
//     amount: u64,
//     collaterals: &mut vector<Collateral<CoinType>>,
//     vault: &mut Vault<CoinType, LPType>,
//     global: &mut Global,
//     ctx: &mut TxContext
// ) {
//     assert!(amount > 0, 0); // Cannot rip zero amount

//     let mut amount_needed = amount;
//     // Create an empty coin to collect the value
//     let mut collected_coin = coin::zero<CoinType>(ctx);

//     let mut i = 0;
//     // Iterate while we still need amount and there are collaterals left
//     while (i < vector::length(collaterals) && amount_needed > 0) {
//         // Get a mutable reference to the collateral at index i
//         let collateral = vector::borrow_mut(collaterals, i);
//         let collateral_value = value(collateral);

//         if (collateral_value == 0) {
//             // This collateral is already empty. Remove it and check the next element (which is now at index i).
//             let removed_collateral = vector::swap_remove(collaterals, i);
//             destroy_collateral(removed_collateral);
//             // Do not increment i, as swap_remove replaced the element at i.
//             // The loop condition handles the decreased vector length.
//             continue;
//         };

//         if (collateral_value <= amount_needed) {
//             // This collateral has less than or equal to the amount needed. Take it all.
//             let taken_balance = take_coin(collateral, collateral_value);
//             // Add the taken balance (converted to coin) to our collected coin
//             coin::join(&mut collected_coin, taken_balance.into_coin(ctx));
//             // Decrease the amount still needed
//             amount_needed = amount_needed - collateral_value;

//             // The collateral is now empty. Remove it from the vector and destroy it.
//             let removed_collateral = vector::swap_remove(collaterals, i);
//             destroy_collateral(removed_collateral);
//             // Do not increment i.
//         } else {
//             // This collateral has more than the amount needed. Take only what's needed.
//             // collateral_value > amount_needed
//             let taken_balance = take_coin(collateral, amount_needed);
//             // Add the taken balance (converted to coin) to our collected coin
//             coin::join(&mut collected_coin, taken_balance.into_coin(ctx));
//             // We now have the full amount needed
//             amount_needed = 0;

//             // This collateral still has value, so keep it and move to the next index.
//             i = i + 1;
//         }
//     };

//     // After the loop, ensure we collected exactly the required amount.
//     // If amount_needed is not 0, it means the provided collaterals were insufficient.
//     assert!(amount_needed == 0, E_INSUFFICIENT_COLLATERAL_PROVIDED);
//     // Double check the collected coin value (should always pass if amount_needed is 0)
//     assert!(collected_coin.value() == amount, 0); // Internal consistency check

//     // Deposit the fully collected coin into the specified vault.
//     lp::deposit_coin<CoinType, LPType>(global, vault, collected_coin);
// }