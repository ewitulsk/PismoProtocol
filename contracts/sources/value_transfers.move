module pismo_protocol::value_transfers;

use sui::balance;
use sui::coin;
use sui::tx_context::TxContext;

use pismo_protocol::collateral::{Self, Collateral, get_collateral_account_id, assert_collateral_stats_match};
use pismo_protocol::lp::{Self, Vault};
use pismo_protocol::main::Global;
use pismo_protocol::accounts::{Account, AccountStats, account_id as stats_account_id};
use pismo_protocol::programs::Program;
use pismo_protocol::positions::{TransferData, TransferTo};
use pismo_protocol::positions as positions;
use std::vector;

const E_COLLATERAL_ACCOUNT_MISMATCH: u64 = 9;

//This method forgoes any checks on whethter this transfer is allowed to take place.
//It just does it.
public(package) fun transfer_same_collateral_to_same_vault_internal<CoinType, LPType>(
    global: &mut Global,
    eligible_collateral: &mut vector<Collateral<CoinType>>,
    vault: &mut Vault<CoinType, LPType>,
    account_stats: &mut AccountStats,
    amount: u64,
    ctx: &mut TxContext
) {

    let mut coin_bal = balance::zero<CoinType>();
    while(coin_bal.value() < amount && !vector::is_empty(eligible_collateral)){
        let mut collat = vector::pop_back(eligible_collateral);

        assert_collateral_stats_match(&collat, account_stats);

        let take_amount = if (collat.value() < amount) {
            amount
        } else {
            collat.value()
        };
        let taken_coin = collat.take_coin(take_amount);
        coin_bal.join(taken_coin);

        collat.return_collateral(account_stats);
    };
    
    lp::deposit_coin(global, vault, coin::from_balance(coin_bal, ctx));

    while (!vector::is_empty(eligible_collateral)) {
        let collat = vector::pop_back(eligible_collateral);
        collat.return_collateral(account_stats);
    };
}

//This method transfers from a vault to collateral
//It checks if the vault has enough coin before executing the transfer
public(package) fun transfer_same_vault_to_collateral_internal<CoinType, LPType>(
    global: &mut Global,
    vault: &mut Vault<CoinType, LPType>,
    account_id: address,
    program: &Program,
    account_stats: &mut AccountStats,
    amount: u64,
    ctx: &mut TxContext
) {
    assert!(lp::coin_value(vault) >= amount, 0);
    let coin = lp::extract_coin(global, vault, amount, ctx);
    assert!(stats_account_id(account_stats) == account_id, E_COLLATERAL_ACCOUNT_MISMATCH);
    collateral::post_collateral_to_arbitrary_account_internal(account_id, account_stats, program, coin, ctx);
}

public(package) fun handle_transfer<CoinType, LPType>(
    global: &mut Global,
    vault: &mut Vault<CoinType, LPType>,
    account_stats: &mut AccountStats,
    transfer_data: TransferData,
    eligible_collateral: &mut vector<Collateral<CoinType>>,
    account_id: address,
    program: &Program,
    ctx: &mut TxContext
) {
    let amount = positions::transfer_amount(&transfer_data);
    if (positions::is_transfer_to_vault(&transfer_data)) {
        transfer_same_collateral_to_same_vault_internal<CoinType, LPType>(
            global,
            eligible_collateral,
            vault,
            account_stats,
            amount,
            ctx
        );
    } else if (positions::is_transfer_to_user(&transfer_data)) {
        transfer_same_vault_to_collateral_internal<CoinType, LPType>(
            global,
            vault,
            account_id,
            program,
            account_stats,
            amount,
            ctx
        );
    } else {
      abort(0);
    };

    positions::destroy_transfer_data(transfer_data);
}

public(package) fun transfer_all_collateral_to_vault_internal<CoinType, LPType>(
    global: &mut Global,
    all_collateral: &mut vector<Collateral<CoinType>>,
    vault: &mut Vault<CoinType, LPType>,
    account_stats: &mut AccountStats,
    ctx: &mut TxContext
) {
    let mut collected_coin_bal = balance::zero<CoinType>();

    while(!vector::is_empty(all_collateral)) {
        let mut collat = vector::pop_back(all_collateral);
        assert_collateral_stats_match(&collat, account_stats);

        let value_to_take = collat.value();
        let taken_coin = collat.take_coin(value_to_take);

        collected_coin_bal.join(taken_coin);
        collat.return_collateral(account_stats);
    };

    let total_value = balance::value(&collected_coin_bal);
    if (total_value > 0) {
       lp::deposit_coin(global, vault, coin::from_balance(collected_coin_bal, ctx));
    } else {
        balance::destroy_zero(collected_coin_bal);
    };
}