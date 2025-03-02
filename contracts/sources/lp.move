module pismo_protocol::lp;

use sui::coin::{Self, Coin, TreasuryCap};
use sui::balance::{Self, Balance, Supply};
use sui::bag::{Self, Bag};
use std::type_name;
use std::string::{Self, String};
use sui::transfer;
use sui::object::{Self, UID};
use sui::tx_context::{Self, TxContext};

use pismo_protocol::math;
use pismo_protocol::main::{Self, AdminCap, Global};

public struct LPToken<phantom CoinType> has drop, store {}

public struct Vault<phantom CoinType, phantom LPType> has key {
    id: UID,
    coin: Balance<CoinType>,
    lp: Supply<LPToken<LPType>>,
    global_index: u64, //Index into the global supported lp vector.
    deprecated: bool,
}

public entry fun init_lp_vault<CoinType, LPType>(_: &AdminCap, global: &mut Global, vault_price_feed_bytes: vector<u8>, ctx: &mut TxContext) {

    let lp_supply = balance::create_supply(LPToken<LPType>{});

    let vault = Vault<CoinType, LPType> {
        id: object::new(ctx),
        coin: balance::zero(),
        lp: lp_supply,
        global_index: global.get_supported_lp_length(),
        deprecated: false,
    };

    transfer::share_object(vault);

    let token_info = type_name::get<CoinType>().into_string();
    global.push_supported_lp(token_info.to_string());
    global.push_vault_balance(0);
    global.push_price_feed_bytes(vault_price_feed_bytes);
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
    
    global.push_vault_balance(vault.coin.value());
    global.swap_remove_vault_balance(vault.global_index);
    
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
    
    global.push_vault_balance(vault.coin.value());
    global.swap_remove_vault_balance(vault.global_index);
    
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
    
    global.push_vault_balance(vault.coin.value());
    global.swap_remove_vault_balance(vault.global_index);
    
    balance_out.into_coin(ctx)
}

public(package) fun deposit_coin<CoinType, LPType>(
    global: &mut Global,
    vault: &mut Vault<CoinType, LPType>,
    coin: Coin<CoinType>
) {
    vault.coin.join(coin.into_balance());
    
    global.push_vault_balance(vault.coin.value());
    global.swap_remove_vault_balance(vault.global_index);
}

public fun coin_value<CoinType, LPType>(vault: &Vault<CoinType, LPType>): u64 {
    return vault.coin.value()
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

public fun get_supported_lp(global: &Global): vector<String> {
    global.get_supported_lp_vec()
}

public fun get_price_feed_bytes(global: &Global): vector<vector<u8>> {
    global.get_price_feed_bytes_vec()
}

public fun get_vault_balances(global: &Global): vector<u64> {
    global.get_vault_balances_vec()
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