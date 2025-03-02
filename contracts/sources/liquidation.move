module pismo_protocol::liquidation;

use sui::clock::Clock;
use sui::tx_context::TxContext;
use sui::address;

use std::vector;

use pyth::price_info::PriceInfoObject;

use pismo_protocol::accounts::{
    Account, AccountStats, assert_total_upnl_is_negative_pyth,
    account_id as get_account_stats_id, collateral_count, num_open_positions,
    zero_out_liquidated_counters
};
use pismo_protocol::collateral::{Collateral, get_collateral_account_id};
use pismo_protocol::lp::Vault;
use pismo_protocol::main::Global;
use pismo_protocol::positions::{
    Position, account_id as get_position_account_id, destroy_positions
};
use pismo_protocol::programs::Program;
use pismo_protocol::value_transfers::transfer_all_collateral_to_vault_internal;

const E_LIQUIDATE_COLLATERAL_COUNT_MISMATCH: u64 = 100;
const E_LIQUIDATE_COLLATERAL_OWNER_MISMATCH: u64 = 101;
const E_LIQUIDATE_POSITION_COUNT_MISMATCH: u64 = 102;
const E_LIQUIDATE_POSITION_OWNER_MISMATCH: u64 = 103;

public(package) fun liquidate_account_internal<CoinType, LPType>(
    global: &mut Global,
    account_stats: &mut AccountStats,
    all_collateral: &mut vector<Collateral<CoinType>>,
    all_positions: &mut vector<Position>,
    vault: &mut Vault<CoinType, LPType>,
    ctx: &mut TxContext
) {
    let account_addr = get_account_stats_id(account_stats);

    let provided_collateral_count = vector::length(all_collateral);
    assert!(provided_collateral_count == collateral_count(account_stats), E_LIQUIDATE_COLLATERAL_COUNT_MISMATCH);
    let mut i = 0;
    while (i < provided_collateral_count) {
        let collat = vector::borrow(all_collateral, i);
        assert!(get_collateral_account_id(collat) == account_addr, E_LIQUIDATE_COLLATERAL_OWNER_MISMATCH);
        i = i + 1;
    };

    let provided_position_count = vector::length(all_positions);
    assert!(provided_position_count == num_open_positions(account_stats), E_LIQUIDATE_POSITION_COUNT_MISMATCH);
    i = 0;
    while (i < provided_position_count) {
        let pos = vector::borrow(all_positions, i);
        assert!(get_position_account_id(pos) == account_addr, E_LIQUIDATE_POSITION_OWNER_MISMATCH);
        i = i + 1;
    };

    zero_out_liquidated_counters(account_stats);

    destroy_positions(all_positions);

    transfer_all_collateral_to_vault_internal<CoinType, LPType>(
        global,
        all_collateral,
        vault,
        account_stats,
        ctx
    );
}

public fun liquidate_account_pyth<CoinType, LPType>(
    global: &mut Global,
    account: &Account,
    stats: &mut AccountStats,
    program: &Program,
    all_collateral: &mut vector<Collateral<CoinType>>, 
    all_positions: &mut vector<Position>,             
    price_infos: &vector<PriceInfoObject>,        
    vault: &mut Vault<CoinType, LPType>,
    clock: &Clock,
    ctx: &mut TxContext
) {
    // Note: assert_total_upnl_is_negative_pyth is in the accounts module
    pismo_protocol::accounts::assert_total_upnl_is_negative_pyth(
        account,
        stats,
        program,
        all_positions, 
        price_infos,  
        clock
    );

    liquidate_account_internal<CoinType, LPType>(
        global,
        stats,
        all_collateral, 
        all_positions,
        vault,
        ctx
    );
} 