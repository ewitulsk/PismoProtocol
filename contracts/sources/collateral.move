module pismo_protocol::collateral;
use pyth::price_info;
use pyth::price_identifier;
use pyth::price;
use pyth::pyth;
use pyth::price_info::PriceInfoObject;

use sui::clock::Clock;
use sui::coin::Coin;
use sui::balance::Balance;
use sui::transfer;
use sui::object::UID;

use std::vector;
use std::string::String;
use std::type_name;
use std::debug;
use std::u128::pow;

use pismo_protocol::programs::Program;
use pismo_protocol::tokens::{TokenIdentifier, OracleInfoObjects, assert_price_obj_match_identifiers};
use pismo_protocol::accounts::{Account, assert_account_program_match};

const E_INVALID_COLLATERAL: u64 = 9999999999;

public struct Collateral<phantom CoinType> has key {
    id: UID,
    account_id: address,
    program_id: address,
    coin: Balance<CoinType>,
    collateral_index: u64
}

public(package) fun ensure_collateral_balance_length(program: &Program, account_balances: &mut vector<u64>){
    let num_collat_types = program.supported_collateral().length();
    let balances_len = account_balances.length();
    let mut i = 0;
    if(balances_len > 0){
        i = balances_len;
    };
    while(i < num_collat_types){
        account_balances.push_back(0);
        i = i + 1;
    }
}

public(package) fun sum_collateral_balances(
    clock: &Clock,
    oracle_info_objects: &vector<OracleInfoObjects>,
    account: &Account,
    program: &Program
): u128 {
    assert_account_program_match(account, program);
    assert_price_obj_match_identifiers(oracle_info_objects, program.supported_collateral());

    let shared_decimals = program.shared_price_decimals();

    let mut total_collateral_value = 0;
    
    let mut i = 0;
    while(i < oracle_info_objects.length()){
        let account_balance = *account.collateral_balances().borrow(i);
        let token_id = program.supported_collateral().borrow(i);
        let oracle_info_object = oracle_info_objects.borrow(i);

        let normalized_value = token_id.get_value(oracle_info_object, account_balance, shared_decimals);
        

        total_collateral_value = total_collateral_value + normalized_value;

        i = i + 1;
    };

    total_collateral_value
}

public entry fun post_collateral<CoinType>(account: &mut Account, program: &Program, coin: Coin<CoinType>, ctx: &mut TxContext) {
    assert_account_program_match(account, program);
    ensure_collateral_balance_length(program, account.collateral_balances_mut());
    let coin_bal = coin.value();
    let type_str = type_name::get<CoinType>().into_string();
    let mut i = 0;
    while(i < program.supported_collateral().length()){
        if(type_str.to_string() == program.supported_collateral()[i].token_info()){
            account.collateral_balances_mut().push_back(coin_bal);
            account.collateral_balances_mut().swap_remove(i);
            transfer::transfer(
                Collateral<CoinType> {
                    id: object::new(ctx),
                    account_id: account.id(),
                    program_id: program.id(),
                    coin: coin.into_balance(),
                    collateral_index: i
                },
                ctx.sender()
            );
            return;
        };
        i = i + 1;
    };
    assert!(false, E_INVALID_COLLATERAL);
    coin.destroy_zero();
}

public(package) fun value<CoinType>(collateral: &Collateral<CoinType>): u64 {
    collateral.coin.value()
}