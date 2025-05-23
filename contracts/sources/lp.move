module pismo_protocol::lp;

use sui::coin::{Self, Coin, TreasuryCap};
use sui::balance::{Self, Balance, Supply};
use sui::bag::{Self, Bag};
use std::type_name;
use std::string::{Self, String};
use sui::transfer;
use sui::object::{Self, UID};
use sui::tx_context::{Self, TxContext};
use sui::clock::Clock;
use std::ascii;
use std::vector;
use sui::event;

use pyth::price_info::PriceInfoObject;

use pismo_protocol::math;
use pismo_protocol::main::{Self, AdminCap, Global};
use pismo_protocol::tokens::{get_value_pyth, TokenIdentifier};

/// Error code for when a vault is not found for a given token info
const E_VAULT_NOT_FOUND: u64 = 1;
const E_INSUFFICIENT_VAULT_MARKER_BALANCE: u64 = 2;
const E_VAULT_TRANSFER_ALREADY_FILLED: u64 = 3;

public struct LPToken<phantom CoinType> has drop, store {}

public struct VaultCreatedEvent has copy, drop, store {
    vault_address: address,
    vault_marker_address: address,
    coin_token_info: String,
    lp_token_info: String,
}

public struct VaultTransferCreated has copy, drop, store {
    transfer_id: address,
    vault_marker_id: address,
    vault_address: address,
    amount: u64,
    to_user_address: address
}

// When a vault transfer is created, it becomes a shared object. But it is referenced in a Vault Marker.
public struct VaultTransfer has key, store {
    id: UID,
    amount: u64,
    fufilled: bool,
    to_user_address: address
}

public struct VaultMarker has key, store {
    id: UID,
    vault_id: address,
    vault_amount: u64, //We need to ensure that any time we reference a vaults value, we use this instead of the vault.
    vault_value: u128,
    vault_value_set_timestamp_ms: u64,
    // transfers: vector<VaultTransfer>,
    token_id: TokenIdentifier
}

public struct Vault<phantom CoinType, phantom LPType> has key {
    id: UID,
    coin: Balance<CoinType>,
    lp: Supply<LPToken<LPType>>,
    global_index: u64, //Index into the global supported lp vector.
    deprecated: bool,
}

public entry fun init_lp_vault<CoinType, LPType>(_: &AdminCap, global: &mut Global, supported_lp_global_indx: u64, ctx: &mut TxContext) {

    let token_id = global.get_supported_lp(supported_lp_global_indx);

    let lp_supply = balance::create_supply(LPToken<LPType>{});

    let vault_id = object::new(ctx);
    let vault_marker_id = object::new(ctx);
    let vault_address = object::uid_to_address(&vault_id);
    let vault_marker_address = object::uid_to_address(&vault_marker_id);
    let coin_token_info_str = token_id.token_info();
    let lp_token_info_type_name = type_name::get<LPType>();
    let lp_token_info_ascii_str = type_name::into_string(lp_token_info_type_name);
    let lp_token_info_bytes = ascii::into_bytes(lp_token_info_ascii_str);
    let lp_token_info_str = string::utf8(lp_token_info_bytes);

    let vault_marker = VaultMarker {
        id: vault_marker_id,
        vault_id: vault_address,
        vault_amount: 0,
        vault_value: 0,
        vault_value_set_timestamp_ms: 0,
        // transfers: vector::empty(),
        token_id
    };

    let vault = Vault<CoinType, LPType> {
        id: vault_id,
        coin: balance::zero(),
        lp: lp_supply,
        global_index: supported_lp_global_indx,
        deprecated: false,
    };

    transfer::share_object(vault);
    transfer::share_object(vault_marker);

    event::emit(VaultCreatedEvent {
        vault_address,
        vault_marker_address,
        coin_token_info: coin_token_info_str,
        lp_token_info: lp_token_info_str,
    });
}

fun calc_amount_to_mint(supply_amount: u64, lp_supply: u64, reserve_amount: u64): u64 {
    let amount_lp_coins_to_mint = if (lp_supply == 0) {
        supply_amount
    } else {
        (math::mul_div((supply_amount as u128), (lp_supply as u128), (reserve_amount as u128)) as u64)
    };

    assert!(amount_lp_coins_to_mint > 0, 0);
    amount_lp_coins_to_mint
}

fun calc_amount_to_remove(lp_amount: u64, reserve_amount: u64, lp_supply: u64): u64 {
    math::mul_div((lp_amount as u128), (reserve_amount as u128), (lp_supply as u128)) as u64
}

public entry fun deposit_lp<CoinType, LPType>(
    vault: &mut Vault<CoinType, LPType>,
    marker: &mut VaultMarker,
    coin: Coin<CoinType>,
    ctx: &mut TxContext
) {
    // Do not allow deposits if the vault is deprecated
    assert!(!vault.deprecated, 0);
    
    let reserve_amount = vault.coin.value();
    let supply_amount = coin.value(); // Adjusted from coin.balance().value()
    let lp_supply = vault.lp.supply_value();
    
    let amount_out = calc_amount_to_mint(supply_amount, lp_supply, reserve_amount);
    let balance_out = vault.lp.increase_supply(amount_out);

    marker.add_amount(coin.balance().value());
    vault.coin.join(coin.into_balance());
    
    transfer::public_transfer(balance_out.into_coin(ctx), ctx.sender());
}

public entry fun withdraw_lp<CoinType, LPType>(
    vault: &mut Vault<CoinType, LPType>,
    marker: &mut VaultMarker,
    lp_token: Coin<LPToken<LPType>>,
    ctx: &mut TxContext
) {
    let reserve_amount = vault.coin.value();
    let lp_amount = lp_token.value(); // Adjusted from lp_token.balance().value()
    let lp_supply = vault.lp.supply_value();
    
    let amount_remove = calc_amount_to_remove(lp_amount, reserve_amount, lp_supply);
    vault.lp.decrease_supply(lp_token.into_balance());

    marker.remove_amount(amount_remove);
    let balance_out = vault.coin.split(amount_remove);
    
    transfer::public_transfer(balance_out.into_coin(ctx), ctx.sender());
}

public(package) fun extract_coin<CoinType, LPType>(
    vault: &mut Vault<CoinType, LPType>,
    marker: &mut VaultMarker,
    amount: u64,
    ctx: &mut TxContext
): Coin<CoinType> {
    assert!(vault.coin.value() >= amount, 0); // Insufficient balance
    let balance_out = vault.coin.split(amount);
    
    marker.remove_amount(balance_out.value());
    balance_out.into_coin(ctx)
}

public(package) fun deposit_coin<CoinType, LPType>(
    vault: &mut Vault<CoinType, LPType>,
    marker: &mut VaultMarker,
    coin: Coin<CoinType>
) {
    marker.add_amount(coin.balance().value());
    vault.coin.join(coin.into_balance());
}

//We don't need to substract from the vault marker, it has already been subtracted from.
//We need to make a execute_vault_transfer_to_collateral. We just need to put it into a seperate file.
public fun execute_vault_transfer<CoinType, LPType>(
    vault: &mut Vault<CoinType, LPType>,
    transfer: &mut VaultTransfer,
    ctx: &mut TxContext
){
    assert!(!transfer.fufilled, E_VAULT_TRANSFER_ALREADY_FILLED);
    let amount = transfer.amount;
    assert!(vault.coin.value() >= amount, 0); // Insufficient balance
    let balance_out = vault.coin.split(amount);
    let coin = balance_out.into_coin(ctx);
    transfer::public_transfer(coin, transfer.to_user_address);
    transfer.fufilled = true;
}

public fun lp_value<CoinType, LPType>(vault: &Vault<CoinType, LPType>): u64 {
    vault.lp.supply_value()
}

public fun global_index<CoinType, LPType>(vault: &Vault<CoinType, LPType>): u64 {
    vault.global_index
}

public fun get_id(global: &Global): address {
    global.get_id_address()
}

public fun get_vault_id(marker: &VaultMarker): address {
    marker.vault_id
}

public fun token_id(marker: &VaultMarker): TokenIdentifier { //We need to straighten the nomenclature between getters. I.E. get_token_info() and token_info()
    marker.token_id
}

public fun get_value_set_time(marker: &VaultMarker): u64 {
    marker.vault_value_set_timestamp_ms
}

public fun find_vault_address(markers: &vector<VaultMarker>, token_info: String): Option<address> {
    let mut i = 0;
    let len = vector::length(markers);
    while(i < len){
        let marker = vector::borrow(markers, i);
        let marker_token_info_str = marker.token_id.token_info();
        if (marker_token_info_str == token_info) {
            return option::some(marker.vault_id)
        };
        i = i + 1;
    };

    abort E_VAULT_NOT_FOUND;
    return option::none()
}

public(package) fun set_vault_marker_value(marker: &mut VaultMarker, value: u128, clock: &Clock) {
    marker.vault_value = value;
    marker.vault_value_set_timestamp_ms = clock.timestamp_ms();
}

public(package) fun add_amount(marker: &mut VaultMarker, amount: u64) {
    marker.vault_amount = marker.vault_amount + amount;
}

public(package) fun remove_amount(marker: &mut VaultMarker, amount: u64) {
    marker.vault_amount = marker.vault_amount - amount;
}

public(package) fun amount(marker: &mut VaultMarker): u64 {
    marker.vault_amount
}

public(package) fun create_vault_transfer(marker: &mut VaultMarker, amount: u64, to_user_address: address, ctx: &mut TxContext){
    let transfer_id_object = object::new(ctx);
    let transfer_id_address = object::uid_to_address(&transfer_id_object);
    let transfer = VaultTransfer {
        id: transfer_id_object,
        amount,
        fufilled: false,
        to_user_address,
    };

    assert!(marker.vault_amount >= amount, E_INSUFFICIENT_VAULT_MARKER_BALANCE);
    transfer::share_object(transfer);
    marker.vault_amount = marker.vault_amount - amount;

    event::emit(VaultTransferCreated {
        transfer_id: transfer_id_address,
        vault_marker_id: object::uid_to_address(&marker.id),
        vault_address: marker.vault_id,
        amount,
        to_user_address
    });
}


public fun set_vault_value<CoinType, LPType>(
    global: &Global,
    vault: &Vault<CoinType, LPType>,
    marker: &mut VaultMarker,
    price_info_obj: &PriceInfoObject,
    clock: &Clock
) {
    let token_id = global.get_supported_positions()[vault.global_index];
    let vault_value = get_value_pyth(&token_id, price_info_obj, clock, marker.vault_amount);
    marker.set_vault_marker_value(vault_value, clock);
}

public fun is_deprecated<CoinType, LPType>(vault: &Vault<CoinType, LPType>): bool {
    vault.deprecated
}

public entry fun set_deprecated<CoinType, LPType>(
    _: &AdminCap,
    vault: &mut Vault<CoinType, LPType>,
    deprecated: bool,
    _ctx: &mut TxContext
) { 
    vault.deprecated = deprecated;
}

#[test_only]
public fun init_global(ctx: &mut TxContext){
    main::test_init(ctx);
}