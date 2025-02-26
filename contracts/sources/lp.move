module pismo_protocol::lp;

use sui::coin::{Self, Coin, TreasuryCap};
use sui::balance::{Self, Balance, Supply};
use sui::bag::{Self, Bag};
use std::type_name;
use std::string::{Self, String};

use pismo_protocol::math;

public struct LPToken<phantom CoinType> has drop, store {}

public struct Vault<phantom CoinType, phantom LPType> has key {
    id: UID,
    coin: Balance<CoinType>,
    lp: Supply<LPToken<LPType>>,
    global_index: u64,
}

public struct Global has key {
    id: UID,
    supported_lp: vector<String>,
    price_feed_bytes: vector<vector<u8>>,
    vault_balances: vector<u64>,
}

fun init(ctx: &mut TxContext) {
    transfer::share_object(Global {
        id: object::new(ctx),
        supported_lp: vector::empty(),
        price_feed_bytes: vector::empty(),
        vault_balances: vector::empty(),
    });
}

//This needs to be a permissioned function
public entry fun init_lp_vault<CoinType, LPType>(global: &mut Global, vault_price_feed_bytes: vector<u8>, ctx: &mut TxContext) {
    // PUT WHITELIST CALL HERE

    let lp_supply = balance::create_supply(LPToken<LPType>{});

    let vault = Vault<CoinType, LPType> {
        id: object::new(ctx),
        coin: balance::zero(),
        lp: lp_supply,
        global_index: global.supported_lp.length(),
    };

    transfer::share_object(vault);

    let token_info = type_name::get<CoinType>().into_string();
    global.supported_lp.push_back(token_info.to_string());
    global.vault_balances.push_back(0);
    global.price_feed_bytes.push_back(vault_price_feed_bytes);
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
    let reserve_amount = vault.coin.value();
    let supply_amount = coin.value(); // Adjusted from coin.balance().value()
    let lp_supply = vault.lp.supply_value();
    
    let amount_out = calc_amount_to_mint(supply_amount, lp_supply, reserve_amount);
    let balance_out = vault.lp.increase_supply(amount_out);

    vault.coin.join(coin.into_balance());
    
    global.vault_balances.push_back(vault.coin.value());
    global.vault_balances.swap_remove(vault.global_index);
    
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
    
    global.vault_balances.push_back(vault.coin.value());
    global.vault_balances.swap_remove(vault.global_index);
    
    transfer::public_transfer(balance_out.into_coin(ctx), ctx.sender());
}

public(package) fun extract_coin<CoinType, LPType>(
    global: &mut Global,
    vault: &mut Vault<CoinType, LPType>,
    amount: u64,
    ctx: &mut TxContext
): Coin<CoinType> {
    // THIS IS A PERMISSIONED METHOD ADD THE WHITELIST CALL HERE
    assert!(vault.coin.value() >= amount, 0); // Insufficient balance
    let balance_out = vault.coin.split(amount);
    
    global.vault_balances.push_back(vault.coin.value());
    global.vault_balances.swap_remove(vault.global_index);
    
    balance_out.into_coin(ctx)
}

public(package) fun deposit_coin<CoinType, LPType>(
    global: &mut Global,
    vault: &mut Vault<CoinType, LPType>,
    coin: Coin<CoinType>
) {
    vault.coin.join(coin.into_balance());
    
    global.vault_balances.push_back(vault.coin.value());
    global.vault_balances.swap_remove(vault.global_index);
}

public fun coin_value<CoinType, LPType>(vault: &Vault<CoinType, LPType>): u64 {
    return vault.coin.value()
}

public fun lp_value<CoinType, LPType>(vault: &Vault<CoinType, LPType>): u64 {
    vault.lp.supply_value()
}

#[test_only]
public fun init_global(ctx: &mut TxContext){
    init(ctx);
}