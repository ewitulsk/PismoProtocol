module pismo_protocol::test_post_collateral;

use std::string;
use std::vector;
use sui::coin::{Self, TreasuryCap, Coin};
use sui::tx_context;

#[test_only]
use sui::test_scenario;

#[test_only]
use pismo_protocol::programs::{Program, init_program_internal, destroy_program};
#[test_only]
use pismo_protocol::tokens::new_token_identifier;
#[test_only]
use pismo_protocol::accounts::{Account, init_account};
#[test_only]
use pismo_protocol::collateral::{Collateral, post_collateral, E_INVALID_COLLATERAL, value};
#[test_only]
use pismo_protocol::test_coin::{Self, TEST_COIN};

#[test]
#[expected_failure(abort_code = E_INVALID_COLLATERAL)]
public fun test_post_collateral_bad() {
    let sender = @0xdeadbeef;
    let mut scenario = test_scenario::begin(sender);

    test_coin::test_init(scenario.ctx());

    scenario.next_tx(sender);

    let collats = vector[
        new_token_identifier (
            string::utf8(b"0x1"),
            8,
            x"01",
            0
        ),
        new_token_identifier (
            string::utf8(b"0x2"),
            8,
            x"02",
            0
        ),
        new_token_identifier (
            string::utf8(b"0x3"),
            8,
            x"03",
            0
        ),
        new_token_identifier (
            string::utf8(b"0x4"),
            8,
            x"04",
            0
        ),
        new_token_identifier (
            string::utf8(b"0x5"),
            8,
            x"05",
            0
        ),
    ];
    let positions = vector[
        new_token_identifier (
            string::utf8(b"0x1"),
            8,
            x"01",
            0
        ),
        new_token_identifier (
            string::utf8(b"0x2"),
            8,
            x"02",
            0
        ),
        new_token_identifier (
            string::utf8(b"0x3"),
            8,
            x"03",
            0
        ),
        new_token_identifier (
            string::utf8(b"0x4"),
            8,
            x"04",
            0
        ),
        new_token_identifier (
            string::utf8(b"0x5"),
            8,
            x"05",
            0
        ),
    ];
    let max_leverage = vector[1, 1, 1, 1, 1];
    let program =  init_program_internal(scenario.ctx(), collats, positions, 8, max_leverage);

    let mut t_cap = scenario.take_from_sender<TreasuryCap<TEST_COIN>>();

    let mint_amount = 100;
    let sender = scenario.sender();
    test_coin::mint(&mut t_cap, mint_amount, sender, scenario.ctx());

    init_account(&program, scenario.ctx());

    scenario.next_tx(sender);

    let mut account = scenario.take_from_sender<Account>();
    let coin = scenario.take_from_sender<Coin<TEST_COIN>>();

    post_collateral( &mut account, &program, coin, scenario.ctx());
    
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
        new_token_identifier (
            string::utf8(b"0x1"),
            8,
            x"01",
            0
        ),
        new_token_identifier (
            string::utf8(b"0x2"),
            8,
            x"02",
            0
        ),
        new_token_identifier (
            string::utf8(b"0000000000000000000000000000000000000000000000000000000000000000::test_coin::TEST_COIN"),
            8,
            x"03",
            0
        ),
        new_token_identifier (
            string::utf8(b"0x4"),
            8,
            x"04",
            0
        ),
        new_token_identifier (
            string::utf8(b"0x5"),
            8,
            x"05",
            0
        ),
    ];
    let positions = vector[
        new_token_identifier (
            string::utf8(b"0x1"),
            8,
            x"01",
            0
        ),
        new_token_identifier (
            string::utf8(b"0x2"),
            8,
            x"02",
            0
        ),
        new_token_identifier (
            string::utf8(b"0000000000000000000000000000000000000000000000000000000000000000::test_coin::TEST_COIN"),
            8,
            x"03",
            0
        ),
        new_token_identifier (
            string::utf8(b"0x4"),
            8,
            x"04",
            0
        ),
        new_token_identifier (
            string::utf8(b"0x5"),
            8,
            x"05",
            0
        ),
    ];
    let max_leverage = vector[1, 1, 1, 1, 1];
    let program =  init_program_internal(scenario.ctx(), collats, positions, 8, max_leverage);

    let mut t_cap = scenario.take_from_sender<TreasuryCap<TEST_COIN>>();

    let mint_amount = 100;
    let sender = scenario.sender();
    test_coin::mint( &mut t_cap, mint_amount, sender, scenario.ctx());

    init_account(&program, scenario.ctx());

    scenario.next_tx(sender);

    let mut account = scenario.take_from_sender<Account>();
    let coin = scenario.take_from_sender<Coin<TEST_COIN>>();

    post_collateral(&mut account, &program, coin, scenario.ctx());
    
    // Check collateral count is 1 after successful post
    assert!(account.collateral_count() == 1, 0);
    
    scenario.return_to_sender<TreasuryCap<TEST_COIN>>(t_cap);
    scenario.return_to_sender<Account>(account);
    
    scenario.next_tx(sender);
    let collateral = scenario.take_shared<Collateral<TEST_COIN>>();
    assert!(collateral.value() == mint_amount, 0);
    test_scenario::return_shared(collateral);
    
    destroy_program(program);
    scenario.end();
}

#[test]
public fun test_post_collateral_good_2() {
    let sender = @0xdeadbeef;
    let mut scenario = test_scenario::begin(sender);

    test_coin::test_init(scenario.ctx());

    scenario.next_tx(sender);

    let collats = vector[
        new_token_identifier (
            string::utf8(b"0000000000000000000000000000000000000000000000000000000000000000::test_coin::TEST_COIN"),
            8,
            x"03",
            0
        )
    ];
    let positions = vector[
        new_token_identifier (
            string::utf8(b"0000000000000000000000000000000000000000000000000000000000000000::test_coin::TEST_COIN"),
            8,
            x"03",
            0
        )
    ];
    let max_leverage = vector[1];
    let program =  init_program_internal(scenario.ctx(), collats,positions, 8, max_leverage);

    let mut t_cap = scenario.take_from_sender<TreasuryCap<TEST_COIN>>();

    let mint_amount = 100;
    let sender = scenario.sender();
    test_coin::mint( &mut t_cap, mint_amount, sender, scenario.ctx());

    init_account(&program, scenario.ctx());

    scenario.next_tx(sender);

    let mut account = scenario.take_from_sender<Account>();
    let coin = scenario.take_from_sender<Coin<TEST_COIN>>();

    post_collateral(&mut account, &program, coin, scenario.ctx());
    
    // Check collateral count is 1 after successful post
    assert!(account.collateral_count() == 1, 0);
    
    scenario.return_to_sender<TreasuryCap<TEST_COIN>>(t_cap);
    scenario.return_to_sender<Account>(account);
    
    scenario.next_tx(sender);
    let collateral = scenario.take_shared<Collateral<TEST_COIN>>();
    assert!(collateral.value() == mint_amount, 0);
    test_scenario::return_shared(collateral);
    
    destroy_program(program);
    scenario.end();
}