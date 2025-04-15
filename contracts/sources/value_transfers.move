module pismo_protocol::value_transfers;

use sui::balance;
use sui::coin;
use sui::tx_context::TxContext;
use sui::clock::Clock;

use pismo_protocol::collateral::{Self, Collateral, get_collateral_account_id, assert_collateral_stats_match, CollateralMarker};
use pismo_protocol::lp::{Self, Vault, VaultMarker};
use pismo_protocol::main::Global;
use pismo_protocol::accounts::{Account, AccountStats, account_id as stats_account_id};
use pismo_protocol::programs::Program;
use pismo_protocol::positions::{TransferData, TransferTo};
use pismo_protocol::tokens::{get_PYTH_MAX_PRICE_AGE_ms};
use pismo_protocol::math;
use pismo_protocol::positions as positions;
use std::vector;

const E_COLLATERAL_ACCOUNT_MISMATCH: u64 = 9;
const E_COLLATERAL_MARKERS_MISMATCH: u64 = 10;
const E_COLLATERAL_VALUE_TOO_OLD: u64 = 11;
const E_VAULT_VALUE_TOO_OLD: u64 = 12;

public fun transfer_collateral_to_vault_internal<CoinType, LPType>(
    global: &mut Global,
    eligible_collateral: &mut vector<Collateral<CoinType>>,
    eligible_collateral_markers: &vector<CollateralMarker>,
    vault: &mut Vault<CoinType, LPType>,
    account_stats: &mut AccountStats,
    amount: u64,
    ctx: &mut TxContext
) {
    let markers_len = vector::length(eligible_collateral_markers);
    assert!(markers_len == vector::length(eligible_collateral), E_COLLATERAL_MARKERS_MISMATCH);
    let mut i = 0;
    while(i < markers_len) {
        let marker = vector::borrow(eligible_collateral_markers, i);
        let collat = vector::borrow(eligible_collateral, i);
        assert!(marker.get_collateral_marker_account_id() == collat.get_collateral_account_id(), E_COLLATERAL_MARKERS_MISMATCH);
    };

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

//Before this can be called all collaterals must be valued, and all vaults must be valued.
public(package) fun create_collateral_to_vault_transfer(
    all_collaterals: &vector<CollateralMarker>,
    all_vaults: &vector<VaultMarker>,
    value_amount: u128,
    clock: &Clock
) {
    //We should move these to their own functions
    let now = clock.timestamp_ms();
    let max_age = get_PYTH_MAX_PRICE_AGE_ms();
    let collat_len = vector::length(all_collaterals);
    let mut i = 0;
    while(i < collat_len) {
        let collat_marker = vector::borrow(all_collaterals, i);
        let time_diff = now - collat_marker.get_value_set_time();
        assert!(time_diff <= max_age, E_COLLATERAL_VALUE_TOO_OLD);
        i = i + 1;
    };
    
    let mut total_collateral_value: u128 = 0;
    let collat_len = vector::length(all_collaterals);
    let mut i = 0;
    while(i < collat_len) {
        let collat_marker = vector::borrow(all_collaterals, i);
        total_collateral_value = total_collateral_value + collat_marker.get_remaining_collateral_value();
        i = i + 1;
    };

    let mut i = 0;
    while(i < collat_len) {
        let collat_marker = vector::borrow(all_collaterals, i);
        let to_transfer = math::mul_div(value_amount, collat_marker.get_remaining_collateral_value(), total_collateral_value);
        
        
        i = i + 1;
    }; 
}

//This method transfers from a vault to collateral
//It checks if the vault has enough coin before executing the transfer
// public(package) fun transfer_same_vault_to_collateral_internal<CoinType, LPType>(
//     global: &mut Global,
//     vault: &mut Vault<CoinType, LPType>,
//     account_id: address,
//     program: &Program,
//     account_stats: &mut AccountStats,
//     amount: u64,
//     ctx: &mut TxContext
// ) {
//     assert!(lp::coin_value(vault) >= amount, 0);
//     let coin = lp::extract_coin(global, vault, amount, ctx);
//     assert!(stats_account_id(account_stats) == account_id, E_COLLATERAL_ACCOUNT_MISMATCH);
//     collateral::post_collateral_to_arbitrary_account_internal(account_id, account_stats, program, coin, ctx);
// }