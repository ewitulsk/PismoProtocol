module pismo_protocol::tokens;
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

const INVALID_ORACLE_INFO: u64 = 111;
const E_PRICE_OBJS_DONT_MATCH_IDENTIFIERS: u64 = 0;

const PYTH_MAX_PRICE_AGE: u64 = 2; //2 seconds

public struct TokenIdentifier has copy, drop, store {
    token_info: String,
    token_decimals: u8,
    price_feed_id_bytes: vector<u8>,
    deprecated: bool
}

public enum OracleInfoObjects {
    Pyth(PriceInfoObject, Clock)
}

public(package) fun get_price_feed_bytes(oracle_info: &OracleInfoObjects): vector<u8> {
    match (oracle_info) {
        OracleInfoObjects::Pyth(price_info_obj, _) => {
            price_info_obj.get_price_info_from_price_info_object().get_price_feed().get_price_identifier().get_bytes()
        }
    }
}

public(package) fun get_price(oracle_info: &OracleInfoObjects): (u64, u8) {
    match (oracle_info) {
        OracleInfoObjects::Pyth(price_info_object, clock) => {

            let price_struct = pyth::get_price_no_older_than(price_info_object,clock, PYTH_MAX_PRICE_AGE);

            let price_decimal_i64 = price::get_expo(&price_struct);
            let price_i64 = price::get_price(&price_struct);

            let price_decimal_u8 = (price_decimal_i64).get_magnitude_if_negative() as u8; //There's a chance this needs to be .get_magnitude_if_positive
            let price_u64 = price_i64.get_magnitude_if_positive();
            (price_u64, price_decimal_u8)
        },

        _ => {
            assert!(false, INVALID_ORACLE_INFO);
            (0, 0)
        }
    }
}

public(package) fun get_value(token_id: &TokenIdentifier, oracle_info: &OracleInfoObjects, amount: u64, shared_decimals: u8): u128 {
    assert!(token_id.price_feed_id_bytes() == oracle_info.get_price_feed_bytes());
    let (price, decimals) = get_price(oracle_info);

    let token_decimal = token_id.token_decimals();
    let token_balance_u128 = amount as u128;

    let local_decimals = decimals + token_decimal;
    let value = (price as u128) * token_balance_u128;

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

    normalized_value
}

public(package) fun assert_price_obj_match_identifiers(price_objs: &vector<OracleInfoObjects>, identifiers: &vector<TokenIdentifier>) {
    let mut i = 0;
    assert!(price_objs.length() == identifiers.length(), E_PRICE_OBJS_DONT_MATCH_IDENTIFIERS);
    while(i < price_objs.length()){
        let p_obj = price_objs.borrow(i);
        let p_id = match (p_obj){
            OracleInfoObjects::Pyth(pyth_info_obj, _) => {
                pyth_info_obj.get_price_info_from_price_info_object().get_price_feed().get_price_identifier().get_bytes()
            },
            _ => {vector::empty<u8>()}
        };
        let collat = identifiers.borrow(i);
        assert!(p_id == collat.price_feed_id_bytes(), E_PRICE_OBJS_DONT_MATCH_IDENTIFIERS);
        i = i + 1;
    };
}

public(package) fun new_token_identifier(
    token_info: String, 
    token_decimals: u8,
    price_feed_id_bytes: vector<u8>
): TokenIdentifier {
    TokenIdentifier { token_info, token_decimals, price_feed_id_bytes, deprecated: false }
}

public(package) fun token_info(token: &TokenIdentifier): String {
    token.token_info
}

public(package) fun token_decimals(token: &TokenIdentifier): u8 {
    token.token_decimals
}

public(package) fun price_feed_id_bytes(token: &TokenIdentifier): vector<u8> {
    token.price_feed_id_bytes
}

public(package) fun set_deprecated(token: &mut TokenIdentifier, val: bool) {
    token.deprecated = val;
}