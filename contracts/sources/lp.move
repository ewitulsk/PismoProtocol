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

use pyth::price_info::PriceInfoObject;

use pismo_protocol::math;
use pismo_protocol::main::{Self, AdminCap, Global};
use pismo_protocol::tokens::{get_value_pyth};

/// Error code for when a vault is not found for a given token info
const E_VAULT_NOT_FOUND: u64 = 1;

public struct LPToken<phantom CoinType> has drop, store {}

public struct VaultMarker has key, store {
    id: UID,
    vault_id: address,
    vault_amount: u64, //We need to ensure that any time we reference a vaults value, we use this instead of the vault.
    vault_value: u128,
    vault_value_set_timestamp_ms: u64,
    token_info: std::ascii::String
}

public struct Vault<phantom CoinType, phantom LPType> has key {
    id: UID,
    coin: Balance<CoinType>,
    lp: Supply<LPToken<LPType>>,
    global_index: u64, //Index into the global supported lp vector.
    deprecated: bool,
}

public entry fun init_lp_vault<CoinType, LPType>(_: &AdminCap, global: &mut Global, supported_lp_global_indx: u64, ctx: &mut TxContext) {

    let token_info = type_name::get<CoinType>().into_string();

    let lp_supply = balance::create_supply(LPToken<LPType>{});

    let vault_id = object::new(ctx);
    let vault_marker_id = object::new(ctx);

    let vault_marker = VaultMarker {
        id: vault_marker_id,
        vault_id: vault_id.to_address(),
        vault_amount: 0,
        vault_value: 0,
        vault_value_set_timestamp_ms: 0,
        token_info
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
    global: &mut Global,
    vault: &mut Vault<CoinType, LPType>,
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

    vault.coin.join(coin.into_balance());
    
    transfer::public_transfer(balance_out.into_coin(ctx), ctx.sender());
}

public entry fun withdraw_lp<CoinType, LPType>(
    global: &mut Global,
    vault: &mut Vault<CoinType, LPType>,
    lp_token: Coin<LPToken<LPType>>,
    ctx: &mut TxContext
) {
    let reserve_amount = vault.coin.value();
    let lp_amount = lp_token.value(); // Adjusted from lp_token.balance().value()
    let lp_supply = vault.lp.supply_value();
    
    let amount_remove = calc_amount_to_remove(lp_amount, reserve_amount, lp_supply);
    vault.lp.decrease_supply(lp_token.into_balance());

    let balance_out = vault.coin.split(amount_remove);
    
    transfer::public_transfer(balance_out.into_coin(ctx), ctx.sender());
}

public(package) fun extract_coin<CoinType, LPType>(
    global: &mut Global,
    vault: &mut Vault<CoinType, LPType>,
    amount: u64,
    ctx: &mut TxContext
): Coin<CoinType> {
    assert!(vault.coin.value() >= amount, 0); // Insufficient balance
    let balance_out = vault.coin.split(amount);
    
    balance_out.into_coin(ctx)
}

public(package) fun deposit_coin<CoinType, LPType>(
    global: &mut Global,
    vault: &mut Vault<CoinType, LPType>,
    coin: Coin<CoinType>
) {
    vault.coin.join(coin.into_balance());
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

public fun get_value_set_time(marker: &VaultMarker): u64 {
    marker.vault_value_set_timestamp_ms
}

public fun find_vault_address(markers: &vector<VaultMarker>, token_info: String): Option<address> {
    let mut i = 0;
    let len = vector::length(markers);
    while(i < len){
        let marker = vector::borrow(markers, i);
        let marker_token_info_str = string::from_ascii(marker.token_info);
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

public fun set_vault_value<CoinType, LPType>(
    global: &Global,
    vault: &Vault<CoinType, LPType>,
    marker: &mut VaultMarker,
    price_info_obj: &PriceInfoObject,
    clock: &Clock
) {
    let token_id = global.get_supported_positions()[vault.global_index];
    let vault_value = get_value_pyth(&token_id, price_info_obj, clock, marker.vault_amount, token_id.token_decimals());
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