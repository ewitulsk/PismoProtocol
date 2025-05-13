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

const PYTH_ID: u64 = 0;

const PYTH_MAX_PRICE_AGE_SECONDS: u64 = 30; //5 seconds

public struct TokenIdentifier has copy, drop, store {
    token_info: String,
    token_decimals: u8,
    price_feed_id_bytes: vector<u8>,
    oracle_feed: u16, //0 is pyth
    deprecated: bool
}

public(package) fun get_PYTH_MAX_PRICE_AGE_SECONDS(): u64 {
    PYTH_MAX_PRICE_AGE_SECONDS
}

public(package) fun get_PYTH_MAX_PRICE_AGE_ms(): u64 {
    PYTH_MAX_PRICE_AGE_SECONDS * 1000
}

public(package) fun get_price_feed_bytes_pyth(price_info_obj: &PriceInfoObject): vector<u8> {
    price_info_obj.get_price_info_from_price_info_object().get_price_feed().get_price_identifier().get_bytes()
}

public(package) fun get_price_pyth(price_info_obj: &PriceInfoObject, clock: &Clock): (u64, u8) {
    let price_struct = pyth::get_price_no_older_than(price_info_obj,clock, get_PYTH_MAX_PRICE_AGE_SECONDS());

    let price_decimal_i64 = price::get_expo(&price_struct);
    let price_i64 = price::get_price(&price_struct);

    let price_decimal_u8 = (price_decimal_i64).get_magnitude_if_negative() as u8; //There's a chance this needs to be .get_magnitude_if_positive
    let price_u64 = price_i64.get_magnitude_if_positive();
    (price_u64, price_decimal_u8)
}

public(package) fun normalize_value(value: u128, local_decimals: u8, shared_decimals: u8): u128 {
    let mut normalized_value = value; 
    if(local_decimals > shared_decimals){
        let diff = local_decimals-shared_decimals;
        normalized_value = value / pow(10, diff);
    }
    else if(shared_decimals > local_decimals){
        let diff = shared_decimals-local_decimals;
        normalized_value = value * pow(10, diff);
    };
    normalized_value
}

public(package) fun get_value_pyth(token_id: &TokenIdentifier, price_info_obj: &PriceInfoObject, clock: &Clock, amount: u64, shared_decimals: u8): u128 {
    assert!(token_id.price_feed_id_bytes() == get_price_feed_bytes_pyth(price_info_obj));
    let (price, decimals) = get_price_pyth(price_info_obj, clock);

    let token_decimal = token_id.token_decimals();
    let token_balance_u128 = amount as u128;

    let local_decimals = decimals + token_decimal;
    let value = (price as u128) * token_balance_u128;

    normalize_value(value, local_decimals, shared_decimals)
}

fun internal_amount_for_target_value(
    price_u64: u64,
    price_decimals: u8,
    token_decimals: u8,
    target_value: u128,
    position_decimals: u8
): u64 {
    let price_u128 = price_u64 as u128;
    ((target_value * pow(10, price_decimals) * pow(10, token_decimals)) / (pow(10, position_decimals) * price_u128)) as u64
}

public fun amount_for_target_value_numeric(
    token_decimals: u8,
    price: u64,
    price_decimals: u8,
    target_value: u128,
    position_decimals: u8
): u64 {
    internal_amount_for_target_value(price, price_decimals, token_decimals, target_value, position_decimals)
}

public(package) fun amount_for_target_value_pyth(
    token_id: &TokenIdentifier, //This is the collateral token id
    price_info_obj: &PriceInfoObject, //This is the collateral price id
    clock: &Clock,
    target_value: u128,
    position_decimals: u8
): u64 {
    assert!(token_id.price_feed_id_bytes() == get_price_feed_bytes_pyth(price_info_obj));
    let (price_u64, price_decimals) = get_price_pyth(price_info_obj, clock);
    internal_amount_for_target_value(price_u64, price_decimals, token_id.token_decimals(), target_value, position_decimals)
}

// The order of PriceInfoObjects is the same order as they appear in the indentifiers vector.
// So, if Token Identifiers is in the order of [pyth, supra, pyth, pyth, stork, stork, stork, pyth]
// The Price Info Objs arr will by [PriceInfoObj, PriceInfoObj, PriceInfoObj, PriceInfoObj]
// Where the first PriceInfoObj relates to the 1st token identifier, the second PriceInfoObj relates to the third Identifier
// The 3rd PriceInfoObj relates to the 4th Identifier and the 4th PriceInfoObj relates to the 8th Identifier
public(package) fun assert_price_obj_match_identifiers_pyth(price_info_objs: &vector<PriceInfoObject>, identifiers: &vector<TokenIdentifier>) {
    let mut identifiers_i = 0;
    let mut objs_i = 0;
    while(identifiers_i < price_info_objs.length()){
        if(identifiers.borrow(identifiers_i).oracle_feed as u64 == PYTH_ID){
            let p_obj = price_info_objs.borrow(objs_i);
            let p_id = p_obj.get_price_info_from_price_info_object().get_price_feed().get_price_identifier().get_bytes();
            let collat = identifiers.borrow(identifiers_i);
            assert!(p_id == collat.price_feed_id_bytes(), E_PRICE_OBJS_DONT_MATCH_IDENTIFIERS);
            objs_i = objs_i + 1;
        };
        
        identifiers_i = identifiers_i + 1;
    };
}

public(package) fun new_token_identifier(
    token_info: String, 
    token_decimals: u8,
    price_feed_id_bytes: vector<u8>,
    oracle_feed: u16
): TokenIdentifier {
    TokenIdentifier { token_info, token_decimals, price_feed_id_bytes, deprecated: false, oracle_feed }
}

public(package) fun token_info(token: &TokenIdentifier): String {
    token.token_info
}

public(package) fun token_decimals(token: &TokenIdentifier): u8 {
    token.token_decimals
}

public(package) fun oracle_feed(token: &TokenIdentifier): u16 {
    token.oracle_feed
}

public(package) fun price_feed_id_bytes(token: &TokenIdentifier): vector<u8> {
    token.price_feed_id_bytes
}

public(package) fun set_deprecated(token: &mut TokenIdentifier, val: bool) {
    token.deprecated = val;
}

public(package) fun is_deprecated(token: &TokenIdentifier): bool {
    token.deprecated
}

public(package) fun get_PYTH_ID(): u64 {
    PYTH_ID
}