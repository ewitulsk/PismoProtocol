module pismo_protocol::math;

const DENOMINATOR_NOT_EQ_ZERO: u64 = 0;

//returns a * b / c
public(package) fun mul_div(a: u128, b: u128, c: u128): u128 {
    assert!(c != 0, DENOMINATOR_NOT_EQ_ZERO);
    (((a as u256) * (b as u256) / (c as u256)) as u128)
}