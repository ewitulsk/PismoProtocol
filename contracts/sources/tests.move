module pismo_protocol::test;

use std::string;
use std::vector;

use pismo_protocol::main::{init_program, init_account, ensure_collateral_balance_length, init_test_program, destroy_program, new_collateral_identifier};

#[test]
fun test_ensure_balances() {
    let mut ctx = tx_context::dummy();
    let collats = vector[
        new_collateral_identifier (
            string::utf8(b"0x1"),
            x"01"
        ),
        new_collateral_identifier (
            string::utf8(b"0x2"),
            x"02"
        ),
        new_collateral_identifier (
            string::utf8(b"0x3"),
            x"03"
        ),
        new_collateral_identifier (
            string::utf8(b"0x4"),
            x"04"
        ),
        new_collateral_identifier (
            string::utf8(b"0x5"),
            x"05"
        ),
    ];
    let test_program =  init_test_program(collats, &mut ctx);

    let mut test_collats = vector::empty<u64>();
    ensure_collateral_balance_length(&test_program, &mut test_collats);
    assert!(test_collats.length() == test_program.supported_collateral().length(), 0);

    let mut test_collats_2 = vector[1, 2];
    ensure_collateral_balance_length(&test_program, &mut test_collats_2);
    assert!(test_collats_2.length() == test_program.supported_collateral().length(), 0);

    destroy_program(test_program);
}