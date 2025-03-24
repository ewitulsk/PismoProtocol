module pismo_protocol::value_transfers;

use sui::balance;
use sui::coin;
use sui::tx_context::TxContext;

use pismo_protocol::collateral::{Self, Collateral};
use pismo_protocol::lp::{Self, Vault};
use pismo_protocol::main::Global;
use pismo_protocol::accounts::Account;
use pismo_protocol::programs::Program;
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

//This method transfers from a vault to collateral
//It checks if the vault has enough coin before executing the transfer
public(package) fun transfer_same_vault_to_collateral_internal<CoinType, LPType>(
    global: &mut Global,
    vault: &mut Vault<CoinType, LPType>,
    account_id: address,
    program: &Program,
    amount: u64,
    ctx: &mut TxContext
) {
    // Check that the vault has enough coin
    assert!(lp::coin_value(vault) >= amount, 0);
    
    // Extract coin from vault
    let coin = lp::extract_coin(global, vault, amount, ctx);
    
    // Post coin as collateral to the specified account_id
    collateral::post_collateral_to_arbitrary_account_internal(account_id, program, coin, ctx);
}