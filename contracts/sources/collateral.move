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

use pismo_protocol::programs::{Program, CollateralIdentifier, new_collateral_identifier};
use pismo_protocol::accounts::{Account, assert_account_program_match};

const E_PRICE_OBJS_DONT_MATCH_COLLATS: u64 = 0;
const E_INVALID_COLLATERAL: u64 = 1;

public struct Collateral<phantom CoinType> has key {
    id: UID,
    coin: Balance<CoinType>
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

fun assert_price_obj_match_collateral(price_objs: &vector<PriceInfoObject>, collaterals: &vector<CollateralIdentifier>) {
    let mut i = 0;
    assert!(price_objs.length() == collaterals.length(), E_PRICE_OBJS_DONT_MATCH_COLLATS);
    while(i < price_objs.length()){
        let p_obj = price_objs.borrow(i);
        let p_id = p_obj.get_price_info_from_price_info_object().get_price_feed().get_price_identifier().get_bytes();
        let collat = collaterals.borrow(i);
        assert!(p_id == collat.price_feed_id_bytes(), E_PRICE_OBJS_DONT_MATCH_COLLATS);
        i = i + 1;
    };
}

public(package) fun sum_collateral_balances(
    clock: &Clock,
    price_info_objects: &vector<PriceInfoObject>,
    account: &Account,
    program: &Program
): u128 {
    assert_account_program_match(account, program);
    assert_price_obj_match_collateral(price_info_objects, program.supported_collateral());
    let max_age_seconds = 3;

    let shared_decimals = program.shared_price_decimals();

    let mut total_collateral_value = 0;
    
    let mut i = 0;
    while(i < price_info_objects.length()){
        let account_balance = account.collateral_balances().borrow(i);
        let collat_id = program.supported_collateral().borrow(i);
        let price_info_object = price_info_objects.borrow(i);
        let price_struct = pyth::get_price_no_older_than(price_info_object,clock, max_age_seconds);

        let price_decimal_i64 = price::get_expo(&price_struct);
        let price_i64 = price::get_price(&price_struct);

        let price_decimal_u8 = (price_decimal_i64).get_magnitude_if_negative() as u8; //There's a chance this needs to be .get_magnitude_if_positive
        let price_u128 = price_i64.get_magnitude_if_positive() as u128;
        let token_decimal = collat_id.token_decimals();
        let token_balance_u128 = *account_balance as u128;

        let local_decimals = price_decimal_u8 + token_decimal;
        let value = price_u128 * token_balance_u128;

        let mut normalized_value = value; 
        if(local_decimals > shared_decimals){
            let diff = local_decimals-shared_decimals;
            normalized_value = value / pow(10, diff);
        }
        else if(shared_decimals > local_decimals){
            let diff = shared_decimals-local_decimals;
            normalized_value = value * pow(10, diff);
        };
        //If shared_decimals == local_decimals, price will already by normalized;
        //normalized_value is now the value of the asset in shared_decimals

        total_collateral_value = total_collateral_value + normalized_value;

        i = i + 1;
    };

    total_collateral_value
}

public(package) fun post_collateral<CoinType>(account: &mut Account, program: &Program, coin: Coin<CoinType>, ctx: &mut TxContext) {
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
                    coin: coin.into_balance()
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