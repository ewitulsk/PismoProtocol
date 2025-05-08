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
use sui::event;

use std::vector;
use std::string::{Self, String};
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
    AccountStats,
    increment_collateral_count,
    collateral_count,
    stats_id as account_stats_id,
    assert_account_stats_match,
    account_id as stats_account_id
};
use pismo_protocol::lp::{Self as lp, Vault, deposit_coin};
use pismo_protocol::main::Global;
use pismo_protocol::lp::VaultMarker;

const E_INVALID_COLLATERAL: u64 = 9999999999;
const COLLATERAL_DEPRECATED: u64 = 8888888888;
const E_INSUFFICIENT_COLLATERAL_PROVIDED: u64 = 97777; // Keep for now
const E_COLLATERAL_ACCOUNT_MISMATCH: u64 = 9; // New error code from accounts.move
const E_COLLATERAL_PRICE_FEED_MISMATCH: u64 = 11; // New error code from accounts.move
const E_INPUT_LENGTH_MISMATCH: u64 = 12; // New error code from accounts.move
const E_CANNOT_WITHDRAW_ZERO: u64 = 13;
const E_MARKER_DOES_NOT_HAVE_AMOUNT: u64 = 18;

// --- Events ---

/// Event emitted when collateral is deposited.
public struct CollateralDepositEvent has copy, drop {
    collateral_id: address,
    collateral_marker_id: address,
    account_id: address,
    token_id: TokenIdentifier,
    amount: u64
}

/// Placeholder event for collateral withdrawal.
public struct CollateralWithdrawEvent has copy, drop {
    // Placeholder - fields to be defined later.
}

/// Event emitted when a collateral value assertion is started.
public struct StartCollateralValueAssertionEvent has copy, drop {
    cva_id: address,
    account_id: address,
    program_id: address,
    num_open_collateral_objects: u64
}

// Collateral struct needs key for sharing, and store for passing by value
public struct Collateral<phantom CoinType> has key, store {
    id: UID,
    account_id: address,
    program_id: address,
    collateral_marker_id: address,
    coin: Balance<CoinType>,
    collateral_index: u64 //Index into the program supported collateral array
}

// When a collateral transfer is created, it becomes a shared object. But it is referenced in a Collateral Marker.
public struct CollateralTransfer has key, store {
    id: UID,
    amount: u64,
    fufilled: bool,
    to_vault_address: address
}


//Everytime a CollateralTransfer is created, the remaining collateral is decremented.
public struct CollateralMarker has key, store {
    id: UID,
    collateral_id: address,
    account_id: address,
    remaining_collateral: u64, //We need to ensure that any time we refernce a collaterals amount, we reference this.  //decremented every time collateral is transfered out. 
    remaining_collateral_value: u128,
    remaining_collateral_value_set_timestamp_ms: u64, //We need to validate this everytime we use the remaining_collateral_value
    transfers: vector<CollateralTransfer>, //Can be infinitely long. Never iterate through.=
    token_id: TokenIdentifier
}

// Helper function to validate Collateral against AccountStats
public(package) fun assert_collateral_stats_match<CoinType>(collateral: &Collateral<CoinType>, stats: &AccountStats) {
    assert!(get_collateral_account_id(collateral) == stats_account_id(stats), E_COLLATERAL_ACCOUNT_MISMATCH);
}

public entry fun post_collateral<CoinType>(account: &Account, stats: &mut AccountStats, program: &Program, coin: Coin<CoinType>, ctx: &mut TxContext) {
    assert_account_program_match(account, program);
    assert_account_stats_match(account, stats);

    let type_str_ascii = type_name::get<CoinType>().into_string();
    let type_str = string::from_ascii(type_str_ascii);

    let initial_amount = coin.value(); // Capture the amount before consuming the coin
    let mut i = 0;
    while(i < program.supported_collateral().length()){
        let token_id = program.supported_collateral()[i];
        if(type_str == token_id.token_info()){
            assert!(!token_id.is_deprecated(), COLLATERAL_DEPRECATED);

            let collateral_marker_id = object::new(ctx);
            let collateral_id = object::new(ctx);

            let collateral_marker_id_address = collateral_marker_id.to_address();
            let collateral_id_address = collateral_id.to_address(); // Get address before moving

            transfer::share_object(CollateralMarker {
                id: collateral_marker_id,
                collateral_id: collateral_id_address,
                account_id: account.id(),
                remaining_collateral: coin.value(),
                remaining_collateral_value: 0,
                remaining_collateral_value_set_timestamp_ms: 0,
                transfers: vector::empty(),
                token_id
            });

            transfer::share_object( 
                Collateral<CoinType> {
                    id: collateral_id,
                    account_id: account.id(),
                    program_id: program.id(),
                    collateral_marker_id: collateral_marker_id_address,
                    coin: coin.into_balance(),
                    collateral_index: i
                }
            );
            stats.increment_collateral_count();

            // Emit the deposit event
            event::emit(CollateralDepositEvent {
                collateral_id: collateral_id_address,
                collateral_marker_id: collateral_marker_id_address,
                account_id: account.id(),
                token_id: token_id,
                amount: initial_amount
            });

            return;
        };
        i = i + 1;
    };
    assert!(false, E_INVALID_COLLATERAL);
    coin.destroy_zero();
}

public(package) fun post_collateral_to_arbitrary_account_internal<CoinType>(account_id_addr: address, stats: &mut AccountStats, program: &Program, coin: Coin<CoinType>, ctx: &mut TxContext) {
    assert!(stats_account_id(stats) == account_id_addr, E_COLLATERAL_ACCOUNT_MISMATCH); //We are running this check on multiple levels. I'm leaving it for rn, we can change it once the contracts are more finalized.

    let type_str_ascii = type_name::get<CoinType>().into_string();
    let type_str = string::from_ascii(type_str_ascii);

    let initial_amount = coin.value(); // Capture the amount before consuming the coin
    let mut i = 0;
    while(i < program.supported_collateral().length()){
        let token_id = program.supported_collateral()[i];
        if(type_str == token_id.token_info()){
             // Check if token is deprecated
            assert!(!token_id.is_deprecated(), E_INVALID_COLLATERAL);

            let collateral_marker_id = object::new(ctx);
            let collateral_id = object::new(ctx);

            let collateral_marker_id_address = collateral_marker_id.to_address();
            let collateral_id_address = collateral_id.to_address(); // Get address before moving

            transfer::share_object(CollateralMarker {
                id: collateral_marker_id,
                collateral_id: collateral_id_address,
                account_id: account_id_addr,
                remaining_collateral: coin.value(),
                remaining_collateral_value: 0,
                remaining_collateral_value_set_timestamp_ms: 0,
                transfers: vector::empty(),
                token_id
            });

            transfer::share_object(
                Collateral<CoinType> {
                    id: collateral_id,
                    account_id: account_id_addr,
                    program_id: program.id(),
                    collateral_marker_id: collateral_marker_id_address,
                    coin: coin.into_balance(),
                    collateral_index: i
                }
            );
            stats.increment_collateral_count();

            // Emit the deposit event
            event::emit(CollateralDepositEvent {
                collateral_id: collateral_id_address,
                collateral_marker_id: collateral_marker_id_address,
                account_id: account_id_addr,
                token_id: token_id,
                amount: initial_amount
            });

            return;
        };
        i = i + 1;
        debug::print(&type_str);
        debug::print(&token_id.token_info());
    };
    assert!(false, E_INVALID_COLLATERAL);
    coin.destroy_zero();
}

fun destroy_collateral_internal<CoinType>(collateral: Collateral<CoinType>, stats: &mut AccountStats) {
    let Collateral {
        id,
        account_id: _,
        program_id: _,
        collateral_marker_id: _,
        coin,
        collateral_index: _
    } = collateral;
    object::delete(id);
    coin.destroy_zero();
    stats.decrement_collateral_count();
}

public(package) fun return_collateral<CoinType>(collateral: Collateral<CoinType>, stats: &mut AccountStats) {
    if (collateral.value() > 0) {
        transfer::share_object(collateral);
    }
    else{
        stats.decrement_collateral_count();
        collateral.destroy_collateral_internal(stats);
    };
}

public(package) fun value<CoinType>(collateral: &Collateral<CoinType>): u64 {
    collateral.coin.value()
}

// Renamed to avoid clash with imported accounts::id as account_id
public(package) fun get_collateral_account_id<CoinType>(collateral: &Collateral<CoinType>): address {
    collateral.account_id
}

public(package) fun get_collateral_marker_account_id(marker: &CollateralMarker): address {
    marker.account_id
}

public fun get_collateral_marker_collateral_id(marker: &CollateralMarker): address {
    marker.collateral_id
}

public(package) fun assert_collateral_remaining_amount(marker: &CollateralMarker, to_assert: u64) {
    assert!(marker.remaining_collateral >= to_assert, E_MARKER_DOES_NOT_HAVE_AMOUNT);
}

public(package) fun remaining_collateral(marker: &CollateralMarker): u64 {
    marker.remaining_collateral
}

public(package) fun create_collateral_transfer(marker: &mut CollateralMarker, amount: u64, vault_address: address, ctx: &mut TxContext){
    let transfer = CollateralTransfer {
        id: object::new(ctx),
        amount,
        fufilled: false,
        to_vault_address: vault_address,
    };

    vector::push_back(&mut marker.transfers, transfer);
    marker.remaining_collateral = marker.remaining_collateral - amount;
}

public(package) fun get_token_id(marker: &mut CollateralMarker): TokenIdentifier {
    marker.token_id
}

public(package) fun set_remaining_collateral_value(marker: &mut CollateralMarker, value: u128, clock: &Clock) {
    marker.remaining_collateral_value = value;
    marker.remaining_collateral_value_set_timestamp_ms = clock.timestamp_ms();
}

public(package) fun get_remaining_collateral_value(marker: &CollateralMarker): u128 {
    marker.remaining_collateral_value
}

public(package) fun get_token_info(marker: &CollateralMarker): String {
    marker.token_id.token_info()
}

public(package) fun get_price_feed_bytes(marker: &CollateralMarker): vector<u8> {
    marker.token_id.token_price_feed_id_bytes()
}

// Renamed for consistency
public(package) fun get_collateral_program_id<CoinType>(collateral: &Collateral<CoinType>): address {
    collateral.program_id
}

// Renamed for consistency
public(package) fun get_collateral_index<CoinType>(collateral: &Collateral<CoinType>): u64 {
    collateral.collateral_index
}

public(package) fun id<CoinType>(collateral: &Collateral<CoinType>): address {
    collateral.id.to_address()
}

public(package) fun get_value_set_time(collateral_marker: &CollateralMarker): u64 {
    collateral_marker.remaining_collateral_value_set_timestamp_ms
}

// This function allows taking value *without* destroying the collateral object or updating the account count.
// Use with caution, primarily for internal logic like liquidations or partial withdrawals where the object persists.
public(package) fun take_coin<CoinType>(collateral: &mut Collateral<CoinType>, amount: u64): Balance<CoinType> {
    collateral.coin.split(amount)
}

//We don't need to substract from the collateral marker, it has already been subtracted from.
public fun execute_collateral_transfer<CoinType, LPType>(
    collateral: &mut Collateral<CoinType>,
    transfer: &mut CollateralTransfer,
    vault: &mut Vault<CoinType, LPType>,
    vault_marker: &mut VaultMarker,
    ctx: &mut TxContext
){
    let amount = transfer.amount;
    assert!(collateral.coin.value() >= amount, 0); // Insufficient balance
    let balance_out = collateral.coin.split(amount);
    let coin = balance_out.into_coin(ctx);
    
    lp::deposit_coin(vault, vault_marker, coin);

    transfer.fufilled = true;
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

public(package) fun liquidate_all_markers(markers: &mut vector<CollateralMarker>) {
    let len = vector::length(markers);
    let mut i = 0;
    while (i < len) {
        let marker = vector::borrow_mut(markers, i);
        marker.remaining_collateral = 0;
        i = i + 1;
    }
}