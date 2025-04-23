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