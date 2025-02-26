module pismo_protocol::lp;

use sui::coin::{Self, Coin, TreasuryCap};
use sui::balance::{Self, Balance, Supply};

use pismo_protocol::math;

public struct LPToken<phantom CoinType> has drop, store {}

public struct Vault<phantom CoinType, phantom LPType> has key {
    id: UID,
    coin: Balance<CoinType>,
    lp: Supply<LPToken<LPType>>
}

//This needs to be a permissioned function
public entry fun init_lp_vault<CoinType, LPType>(ctx: &mut TxContext) {
    //PUT WHITELIST CALL HERE

    let lp_supply = balance::create_supply(LPToken<LPType>{});

    transfer::share_object(Vault<CoinType, LPType>{
        id: object::new(ctx),
        coin: balance::zero(),
        lp: lp_supply
    })
}

fun calc_amount_to_mint(supply_amount: u64, lp_supply: u128, reserve_amount: u64): u64 {
    let amount_lp_coins_to_mint = if (lp_supply == 0) {
        supply_amount
    } else {
        (math::mul_div((supply_amount as u128), lp_supply, (reserve_amount as u128)) as u64)
    };

    assert!(amount_lp_coins_to_mint > 0, 0);
    amount_lp_coins_to_mint
}

// public entry fun deposit_lp<CoinType, LPType>(vault: &Vault<CoinType, LPType>, coin: Coin<CoinType>){
//     let reserve_amount = vault.coin.value();
//     let supply_amount = coin.balance().value();


// }