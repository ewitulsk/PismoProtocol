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
use std::option;

use pismo_protocol::programs::Program;
use pismo_protocol::tokens::{
    TokenIdentifier, assert_price_obj_match_identifiers_pyth, get_PYTH_ID, get_price_feed_bytes_pyth,
    price_feed_id_bytes as token_price_feed_id_bytes,
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
const E_COLLATERAL_TRANSFER_ALREADY_FILLED: u64 = 19;
const E_COMBINE_PROGRAM_ID_MISMATCH: u64 = 20;
const E_COMBINE_MARKER_LINK_MISMATCH: u64 = 21;
const E_COMBINE_TOKEN_ID_MISMATCH: u64 = 22;
const E_COMBINE_VALUE_TRACKING_ERROR: u64 = 23;

// --- Events ---

public struct CollateralTransferCreated has copy, drop {
    transfer_id: address,
    collateral_marker_id: address,
    collateral_address: address,
    amount: u64,
    to_vault_address: address
}

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
    collateral_id: address,
    collateral_marker_id: address,
    account_id: address,
    token_id: TokenIdentifier,
    withdrawn_amount: u64,
    marker_destroyed: bool, // True if the marker (and collateral) were destroyed
    remaining_amount_in_marker: u64
}

/// Event emitted when a collateral value assertion is started.
public struct StartCollateralValueAssertionEvent has copy, drop {
    cva_id: address,
    account_id: address,
    program_id: address,
    num_open_collateral_objects: u64
}

public struct CollateralMarkerLiquidatedEvent has copy, drop {
    collateral_marker_id: address,
    account_id: address
}

/// Event emitted when two collateral objects are combined.
public struct CollateralCombineEvent has copy, drop {
    old_collateral_id1: address,
    old_collateral_marker_id1: address,
    old_collateral_id2: address,
    old_collateral_marker_id2: address,
    new_collateral_id: address,
    new_collateral_marker_id: address,
    account_id: address,
    token_id: TokenIdentifier,
    combined_amount: u64
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
    // transfers: vector<CollateralTransfer>, //Can be infinitely long. Never iterate through.=
    token_id: TokenIdentifier
}

public struct CombinedCollateral<phantom CoinType> {
    collateral: Collateral<CoinType>,
    marker: CollateralMarker
}

public struct CollateralIntermediary<phantom CoinType> {
    collateral: Option<Collateral<CoinType>>,
    marker: Option<CollateralMarker>,
    coin: Coin<CoinType>
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
                // transfers: vector::empty(),
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
                // transfers: vector::empty(),
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
    let transfer_id_object = object::new(ctx);
    let transfer_id_address = object::uid_to_address(&transfer_id_object);
    let transfer = CollateralTransfer {
        id: transfer_id_object,
        amount,
        fufilled: false,
        to_vault_address: vault_address,
    };

    transfer::share_object(transfer);
    marker.remaining_collateral = marker.remaining_collateral - amount;

    event::emit(CollateralTransferCreated {
        transfer_id: transfer_id_address,
        collateral_marker_id: object::uid_to_address(&marker.id),
        collateral_address: marker.collateral_id,
        amount,
        to_vault_address: vault_address
    });
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
    assert!(!transfer.fufilled, E_COLLATERAL_TRANSFER_ALREADY_FILLED);
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


public(package) fun liquidate_all_markers_no_sub(markers: &vector<CollateralMarker>) {
    let len = vector::length(markers);
    let mut i = 0;
    while (i < len) {
        let marker = markers.borrow(i);
        event::emit(CollateralMarkerLiquidatedEvent {
            collateral_marker_id: object::uid_to_address(&marker.id),
            account_id: marker.account_id
        });
        i = i + 1;
    }
}

public fun combine_collateral_w_combine_collateral<CoinType>(
    collateral1: Collateral<CoinType>,
    marker1: CollateralMarker,
    previously_combine: CombinedCollateral<CoinType>,
    stats: &mut AccountStats,
    ctx: &mut TxContext
): CombinedCollateral<CoinType> {
    let CombinedCollateral {collateral: previous_collateral, marker: previous_marker} = previously_combine;
    combine_collateral(collateral1, marker1, previous_collateral, previous_marker, stats, ctx)
}

public fun combine_collateral<CoinType>(
    collateral1: Collateral<CoinType>,
    marker1: CollateralMarker,
    collateral2: Collateral<CoinType>,
    marker2: CollateralMarker,
    stats: &mut AccountStats,
    ctx: &mut TxContext
): CombinedCollateral<CoinType> {
    // 1. Store IDs for event and reference
    let old_collateral1_id_addr = object::uid_to_address(&collateral1.id);
    let old_marker1_id_addr = object::uid_to_address(&marker1.id);
    let old_collateral2_id_addr = object::uid_to_address(&collateral2.id);
    let old_marker2_id_addr = object::uid_to_address(&marker2.id);

    // 2. Assertions
    assert!(collateral1.account_id == collateral2.account_id, E_COLLATERAL_ACCOUNT_MISMATCH);
    assert!(collateral1.program_id == collateral2.program_id, E_COMBINE_PROGRAM_ID_MISMATCH);
    assert!(marker1.account_id == marker2.account_id, E_COLLATERAL_ACCOUNT_MISMATCH);
    assert!(collateral1.account_id == marker1.account_id, E_COLLATERAL_ACCOUNT_MISMATCH); // Ensures all objects belong to the same account

    // Assert linking between collaterals and markers
    assert!(collateral1.collateral_marker_id == old_marker1_id_addr, E_COMBINE_MARKER_LINK_MISMATCH);
    assert!(collateral2.collateral_marker_id == old_marker2_id_addr, E_COMBINE_MARKER_LINK_MISMATCH);
    assert!(marker1.collateral_id == old_collateral1_id_addr, E_COMBINE_MARKER_LINK_MISMATCH);
    assert!(marker2.collateral_id == old_collateral2_id_addr, E_COMBINE_MARKER_LINK_MISMATCH);

    // Assert token IDs match
    assert!(marker1.token_id == marker2.token_id, E_COMBINE_TOKEN_ID_MISMATCH);

    // Assert AccountStats matches the account of the collateral
    assert!(stats_account_id(stats) == collateral1.account_id, E_COLLATERAL_ACCOUNT_MISMATCH);

    // Assert marker's remaining_collateral matches actual coin value
    let val1 = collateral1.coin.value();
    let val2 = collateral2.coin.value();
    assert!(marker1.remaining_collateral == val1, E_COMBINE_VALUE_TRACKING_ERROR);
    assert!(marker2.remaining_collateral == val2, E_COMBINE_VALUE_TRACKING_ERROR);

    // 3. Extract common info for new objects
    let account_id = collateral1.account_id; // All objects share this account_id
    let program_id = collateral1.program_id; // Both collaterals share this program_id
    let collateral_index = collateral1.collateral_index; // Consistent due to CoinType and program
    let token_id = marker1.token_id; // Both markers share this token_id

    let combined_total_amount = val1 + val2;

    // 4. Destructure old objects to get UIDs and balances
    let Collateral { id: uid_c1, coin: mut balance_c1, account_id: _, program_id: _, collateral_marker_id: _, collateral_index: _ } = collateral1;
    let CollateralMarker { id: uid_m1, collateral_id: _, account_id: _, remaining_collateral: _, remaining_collateral_value: _, remaining_collateral_value_set_timestamp_ms: _, token_id: _ } = marker1;
    let Collateral { id: uid_c2, coin: balance_c2, account_id: _, program_id: _, collateral_marker_id: _, collateral_index: _ } = collateral2;
    let CollateralMarker { id: uid_m2, collateral_id: _, account_id: _, remaining_collateral: _, remaining_collateral_value: _, remaining_collateral_value_set_timestamp_ms: _, token_id: _ } = marker2;

    // 5. Delete old UIDs
    object::delete(uid_c1);
    object::delete(uid_m1);
    object::delete(uid_c2);
    object::delete(uid_m2);

    // 6. Join balances
    balance::join(&mut balance_c1, balance_c2); // balance_c1 now holds the combined balance

    // 7. Create new UIDs for new objects
    let new_collateral_marker_uid = object::new(ctx);
    let new_collateral_uid = object::new(ctx);
    let new_collateral_marker_id_addr = object::uid_to_address(&new_collateral_marker_uid);
    let new_collateral_id_addr = object::uid_to_address(&new_collateral_uid);

    // 8. Create new CollateralMarker object (but don't share yet)
    let new_marker = CollateralMarker {
        id: new_collateral_marker_uid,
        collateral_id: new_collateral_id_addr,
        account_id: account_id,
        remaining_collateral: combined_total_amount,
        remaining_collateral_value: 0, // Reset, as price info is stale/uncombined
        remaining_collateral_value_set_timestamp_ms: 0, // Reset
        token_id: token_id
    };

    // 9. Create new Collateral<CoinType> object (but don't share yet)
    let new_collateral = Collateral<CoinType> {
        id: new_collateral_uid,
        account_id: account_id,
        program_id: program_id,
        collateral_marker_id: new_collateral_marker_id_addr,
        coin: balance_c1, // This is the combined balance
        collateral_index: collateral_index
    };

    // 10. Update AccountStats: two collaterals destroyed, one created -> net -1
    stats.decrement_collateral_count();

    // 11. Emit event
    event::emit(CollateralCombineEvent {
        old_collateral_id1: old_collateral1_id_addr,
        old_collateral_marker_id1: old_marker1_id_addr,
        old_collateral_id2: old_collateral2_id_addr,
        old_collateral_marker_id2: old_marker2_id_addr,
        new_collateral_id: new_collateral_id_addr,
        new_collateral_marker_id: new_collateral_marker_id_addr,
        account_id: account_id,
        token_id: token_id,
        combined_amount: combined_total_amount
    });

    //This is really just a temp fix so I don't have to do anything too complicated in the indexer
    //We are now just filtering at the repository level.
    event::emit(CollateralDepositEvent {
        collateral_id: new_collateral_id_addr,
        collateral_marker_id: new_collateral_marker_id_addr,
        account_id: account_id,
        token_id: token_id,
        amount: combined_total_amount
    });

    // 12. Return the combined objects wrapped
    CombinedCollateral<CoinType> {
        collateral: new_collateral,
        marker: new_marker
    }
}

public fun share_combined_collateral<CoinType>(combined: CombinedCollateral<CoinType>) {
    let CombinedCollateral { collateral, marker } = combined;
    transfer::share_object(collateral);
    transfer::share_object(marker);
}

public(package) fun withdraw_collateral_internal<CoinType>(
    mut collateral: Collateral<CoinType>,
    mut marker: CollateralMarker,
    amount_to_withdraw: u64,
    stats: &mut AccountStats,
    ctx: &mut TxContext
): Coin<CoinType> {
    assert!(amount_to_withdraw > 0, E_CANNOT_WITHDRAW_ZERO);
    assert_collateral_remaining_amount(&marker, amount_to_withdraw);

    let collateral_id_addr = object::uid_to_address(&collateral.id);
    let marker_id_addr = object::uid_to_address(&marker.id);
    let account_id = marker.account_id;
    let token_id = marker.token_id;

    marker.remaining_collateral = marker.remaining_collateral - amount_to_withdraw;

    let balance_out = take_coin(&mut collateral, amount_to_withdraw);
    let withdrawn_coin = coin::from_balance(balance_out, ctx);

    let mut destroyed = false;
    let mut final_remaining_amount = marker.remaining_collateral;

    if (marker.remaining_collateral == 0) {
        
        let Collateral { id: collateral_uid_to_delete, coin: zero_balance_coin, account_id: _, program_id: _, collateral_marker_id: _, collateral_index: _} = collateral;
        let CollateralMarker { id: marker_uid_to_delete, collateral_id: _, account_id: _, remaining_collateral: _, remaining_collateral_value: _, remaining_collateral_value_set_timestamp_ms: _, token_id: _ } = marker; 

        balance::destroy_zero(zero_balance_coin);
        object::delete(collateral_uid_to_delete);
        object::delete(marker_uid_to_delete);

        stats.decrement_collateral_count();
        destroyed = true;
        final_remaining_amount = 0; 
    } else {
        transfer::share_object(collateral);
        transfer::share_object(marker);
    };
    
    event::emit(CollateralWithdrawEvent {
        collateral_id: collateral_id_addr,
        collateral_marker_id: marker_id_addr,
        account_id: account_id,
        token_id: token_id,
        withdrawn_amount: amount_to_withdraw,
        marker_destroyed: destroyed,
        remaining_amount_in_marker: final_remaining_amount
    });

    withdrawn_coin
}


public fun withdraw_collateral<CoinType>(
    collateral: Collateral<CoinType>, 
    marker: CollateralMarker,  
    amount: u64,
    stats: &mut AccountStats,
    ctx: &mut TxContext
) {

    let withdrawn_coin = withdraw_collateral_internal( collateral, marker, amount, stats, ctx);

    transfer::public_transfer(withdrawn_coin, tx_context::sender(ctx));
}

// Entry function to withdraw from a CombinedCollateral object
public fun withdraw_from_combined_collateral<CoinType>(
    combined: CombinedCollateral<CoinType>,
    amount: u64,
    stats: &mut AccountStats,
    ctx: &mut TxContext
) {
    let CombinedCollateral { collateral, marker } = combined;

    let withdrawn_coin = withdraw_collateral_internal(collateral, marker, amount, stats, ctx);

    transfer::public_transfer(withdrawn_coin, tx_context::sender(ctx));
}