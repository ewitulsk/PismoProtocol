module pismo_protocol::test_amount_for_target_value;

use pismo_protocol::tokens::{amount_for_target_value_numeric, normalize_value};
use std::u128::pow;

#[test]
public fun test_same_decimals() {
    let token_decimals: u8 = 8;
    let price: u64 = 2; // price = 2 units
    let price_decimals: u8 = 0;
    let shared_decimals: u8 = 8;
    let target_value: u128 = 11; // 11 units in shared_decimals

    let amt = amount_for_target_value_numeric(
        token_decimals,
        price,
        price_decimals,
        target_value
    );

    // Validate minimality: value >= target, value(amount-1) < target
    let value = normalize_value((price as u128) * (amt as u128), token_decimals + price_decimals, shared_decimals);
    assert!(value >= target_value, 0);
    if (amt > 0) {
        let value_prev = normalize_value((price as u128) * ((amt - 1) as u128), token_decimals + price_decimals, shared_decimals);
        assert!(value_prev < target_value, 1);
    };
}

#[test]
public fun test_local_smaller_than_shared() {
    // local_decimals (token+price) < shared_decimals branch
    let token_decimals: u8 = 4;
    let price: u64 = 250; // price = 250 * 10^-2 = 2.5 if shared decimals 8 (not used directly)
    let price_decimals: u8 = 0; // keep 0 for simplicity; we'll make shared bigger to trigger branch
    let shared_decimals: u8 = 8;
    let target_value: u128 = 10000; // some arbitrary value

    let amt = amount_for_target_value_numeric(
        token_decimals,
        price,
        price_decimals,
        target_value
    );

    let value = normalize_value((price as u128) * (amt as u128), token_decimals + price_decimals, shared_decimals);
    assert!(value >= target_value, 2);
    if (amt > 0) {
        let value_prev = normalize_value((price as u128) * ((amt - 1) as u128), token_decimals + price_decimals, shared_decimals);
        assert!(value_prev < target_value, 3);
    };
}

#[test]
public fun test_local_greater_than_shared() {
    // local_decimals > shared_decimals branch
    let token_decimals: u8 = 8;
    let price_decimals: u8 = 4; // price has 4 decimal places
    let price: u64 = 12345; // 0.000000? etc.
    let shared_decimals: u8 = 6; // smaller than local
    let target_value: u128 = 987654321;

    let amt = amount_for_target_value_numeric(
        token_decimals,
        price,
        price_decimals,
        target_value
    );

    let local_decimals: u8 = token_decimals + price_decimals;
    let pow10: u128 = if (local_decimals > shared_decimals) { pow(10, (local_decimals - shared_decimals)) } else { 1 };
    let value_raw: u128 = (price as u128) * (amt as u128);
    let value: u128 = value_raw / pow10; // replicate normalize_value for this branch
    let value_norm = normalize_value(value_raw, local_decimals, shared_decimals);
    // ensure algorithm matches normalize_value result
    assert!(value_norm == value, 4);
    assert!(value_norm >= target_value, 5);
} 