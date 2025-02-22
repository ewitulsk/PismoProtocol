module pismo_protocol::test;

use std::string;
use std::vector;
use sui::coin::{Self, TreasuryCap, Coin};

#[test_only]
use sui::test_scenario;

#[test_only]
use pismo_protocol::main::{Collateral, E_INVALID_COLLATERAL, post_collateral, Account, init_program, init_account, ensure_collateral_balance_length, init_program_internal, destroy_program, new_collateral_identifier};
#[test_only]
use pismo_protocol::test_coin::{Self, TEST_COIN};

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
    let test_program =  init_program_internal(collats, &mut ctx);

    let mut test_collats = vector::empty<u64>();
    ensure_collateral_balance_length(&test_program, &mut test_collats);
    assert!(test_collats.length() == test_program.supported_collateral().length(), 0);

    let mut test_collats_2 = vector[1, 2];
    ensure_collateral_balance_length(&test_program, &mut test_collats_2);
    assert!(test_collats_2.length() == test_program.supported_collateral().length(), 0);

    destroy_program(test_program);
}


#[test]
#[expected_failure(abort_code = E_INVALID_COLLATERAL)]
public fun test_post_collateral_bad() {
    let sender = @0xdeadbeef;
    let mut scenario = test_scenario::begin(sender);

    test_coin::test_init(scenario.ctx());

    scenario.next_tx(sender);

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
    let program =  init_program_internal(collats, scenario.ctx());

    let mut t_cap = scenario.take_from_sender<TreasuryCap<TEST_COIN>>();

    let mint_amount = 100;
    test_coin::mint(&mut t_cap, mint_amount, scenario.sender(), scenario.ctx());

    init_account(&program, scenario.ctx());

    scenario.next_tx(sender);

    let mut account = scenario.take_from_sender<Account>();
    let coin = scenario.take_from_sender<Coin<TEST_COIN>>();

    post_collateral(&mut account, &program, coin, scenario.ctx());
    
    scenario.return_to_sender<TreasuryCap<TEST_COIN>>(t_cap);
    scenario.return_to_sender<Account>(account);
    destroy_program(program);

    scenario.end();
}

#[test]
public fun test_post_collateral_good() {
    let sender = @0xdeadbeef;
    let mut scenario = test_scenario::begin(sender);

    test_coin::test_init(scenario.ctx());

    scenario.next_tx(sender);

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
            string::utf8(b"0000000000000000000000000000000000000000000000000000000000000000::test_coin::TEST_COIN"),
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
    let program =  init_program_internal(collats, scenario.ctx());

    let mut t_cap = scenario.take_from_sender<TreasuryCap<TEST_COIN>>();

    let mint_amount = 100;
    test_coin::mint(&mut t_cap, mint_amount, scenario.sender(), scenario.ctx());

    init_account(&program, scenario.ctx());

    scenario.next_tx(sender);

    let mut account = scenario.take_from_sender<Account>();
    let coin = scenario.take_from_sender<Coin<TEST_COIN>>();

    post_collateral(&mut account, &program, coin, scenario.ctx());
    let mut i = 0;
    while(i < account.collateral_balances().length()){
        let bal = account.collateral_balances().borrow(i);
        if(i != 2){
            assert!(bal == 0, 0);
        }
        else{
            assert!(bal == mint_amount, 0);
        };
        i = i + 1;
    };
    
    scenario.return_to_sender<TreasuryCap<TEST_COIN>>(t_cap);
    scenario.return_to_sender<Account>(account);
    destroy_program(program);

    scenario.next_tx(sender);
    let collateral = scenario.take_from_sender<Collateral<TEST_COIN>>();
    assert!(collateral.value() == mint_amount, 0);
    scenario.return_to_sender<Collateral<TEST_COIN>>(collateral);

    scenario.end();
}