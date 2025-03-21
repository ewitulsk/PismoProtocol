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
use pismo_protocol::tokens::{TokenIdentifier, assert_price_obj_match_identifiers_pyth, get_PYTH_ID, get_price_feed_bytes_pyth};
use pismo_protocol::accounts::{Account, assert_account_program_match};

const E_INVALID_COLLATERAL: u64 = 9999999999;
const E_VALUE_UPDATED_TO_LONG_AGO: u64 = 98888;

public struct Collateral<phantom CoinType> has key {
    id: UID,
    account_id: address,
    program_id: address,
    coin: Balance<CoinType>,
    collateral_index: u64
}

public(package) fun ensure_collateral_vecs_length<T: copy + drop>(program: &Program, account_collateral_vec: &mut vector<T>, default: T){
    let num_collat_types = program.supported_collateral().length();
    let balances_len = account_collateral_vec.length();
    let mut i = 0;
    if(balances_len > 0){
        i = balances_len;
    };
    while(i < num_collat_types){
        account_collateral_vec.push_back(copy default);
        i = i + 1;
    }
}

public entry fun set_collateral_value_pyth(
    clock: &Clock,
    price_info_obj: &PriceInfoObject,
    collateral_i: u64,
    //Add other oracle price objects here.
    account: &mut Account,
    program: &Program
) {
    ensure_collateral_vecs_length(program, account.collateral_values_mut(), 0);
    ensure_collateral_vecs_length(program, account.collateral_balances_mut(), 0);
    ensure_collateral_vecs_length(program, account.collateral_update_times_mut(), 0);
    let token_id = program.supported_collateral().borrow(collateral_i);
    assert!(token_id.oracle_feed() as u64 == get_PYTH_ID(), E_INVALID_COLLATERAL);
    assert!(token_id.price_feed_id_bytes() == get_price_feed_bytes_pyth(price_info_obj), E_INVALID_COLLATERAL);
    let amount = *account.collateral_balances().borrow(collateral_i);

    let collateral_value = token_id.get_value_pyth(price_info_obj, clock, amount, program.shared_price_decimals());
    account.set_collateral_value(collateral_i, collateral_value, clock);
}   

public fun sum_collateral_values(account: &Account, clock: &Clock): u128{
    let mut total_value: u128 = 0;
    let cur_time = clock.timestamp_ms();
    let mut i = 0;
    while(i < account.collateral_values().length()){
        let value = *account.collateral_values().borrow(i);
        let updated_time = account.collateral_update_times().borrow(i);
        assert!(updated_time == cur_time, E_VALUE_UPDATED_TO_LONG_AGO);
        total_value = total_value + value;
        i = i + 1;
    };
    total_value
}

public entry fun post_collateral<CoinType>(account: &mut Account, program: &Program, coin: Coin<CoinType>, ctx: &mut TxContext) {
    assert_account_program_match(account, program);
    ensure_collateral_vecs_length(program, account.collateral_balances_mut(), 0);
    let coin_bal = coin.value();
    let type_str = type_name::get<CoinType>().into_string();
    let mut i = 0;
    while(i < program.supported_collateral().length()){
        if(type_str.to_string() == program.supported_collateral()[i].token_info()){
            account.collateral_balances_mut().push_back(coin_bal);
            account.collateral_balances_mut().swap_remove(i);
            transfer::share_object(
                Collateral<CoinType> {
                    id: object::new(ctx),
                    account_id: account.id(),
                    program_id: program.id(),
                    coin: coin.into_balance(),
                    collateral_index: i
                }
            );
            return;
        };
        i = i + 1;
    };
    assert!(false, E_INVALID_COLLATERAL);
    coin.destroy_zero();
}

public(package) fun post_collateral_to_arbitrary_account_internal<CoinType>(account_id: address, program: &Program, coin: Coin<CoinType>, ctx: &mut TxContext) {
    let coin_bal = coin.value();
    let type_str = type_name::get<CoinType>().into_string();
    let mut i = 0;
    while(i < program.supported_collateral().length()){
        if(type_str.to_string() == program.supported_collateral()[i].token_info()){
            transfer::share_object(
                Collateral<CoinType> {
                    id: object::new(ctx),
                    account_id,
                    program_id: program.id(),
                    coin: coin.into_balance(),
                    collateral_index: i
                }
            );
            return;
        };
        i = i + 1;
    };
    assert!(false, E_INVALID_COLLATERAL);
    coin.destroy_zero();
}

public(package) fun destroy_collateral<CoinType>(collateral: Collateral<CoinType>) {
    let Collateral {
        id,
        account_id,
        program_id,
        coin,
        collateral_index
    } = collateral;
    object::delete(id);
    coin.destroy_zero();
}

public(package) fun return_collateral<CoinType>(collateral: Collateral<CoinType>) {
    if (collateral.value() > 0) {
        transfer::share_object(collateral);
    }
    else{
        collateral.destroy_collateral();
    };
}

public(package) fun value<CoinType>(collateral: &Collateral<CoinType>): u64 {
    collateral.coin.value()
}

public(package) fun take_coin<CoinType>(collateral: &mut Collateral<CoinType>, amount: u64): Balance<CoinType> {
    collateral.coin.split(amount)
}