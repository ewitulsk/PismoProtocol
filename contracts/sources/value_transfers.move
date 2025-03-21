module pismo_protocol::value_transfers;

use sui::balance;
use sui::coin;

use pismo_protocol::collateral::Collateral;
use pismo_protocol::lp::{Self, Vault, Global};
use std::vector;

//This method forgoes any checks on whethter this transfer is allowed to take place.
//It just does it.
public(package) fun transfer_same_collateral_to_same_vault_internal<CoinType, LPType>(
    global: &mut Global,
    eligible_collateral: &mut vector<Collateral<CoinType>>,
    vault: &mut Vault<CoinType, LPType>,
    amount: u64,
    ctx: &mut TxContext
) {

    let mut coin_bal = balance::zero<CoinType>();
    while(coin_bal.value() < amount && !vector::is_empty(eligible_collateral)){
        let mut collat = vector::pop_back(eligible_collateral);
        let take_amount = if (collat.value() < amount) {
            amount
        } else {
            collat.value()
        };
        let taken_coin = collat.take_coin(take_amount);
        coin_bal.join(taken_coin);

        collat.return_collateral();
    };
    
    lp::deposit_coin(global, vault, coin::from_balance(coin_bal, ctx));

    while (!vector::is_empty(eligible_collateral)) {
        let collat = vector::pop_back(eligible_collateral);
        collat.return_collateral();
    };
}