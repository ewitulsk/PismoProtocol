module pismo_protocol::test_lp;

use pismo_protocol::lp;
use pismo_protocol::lp::{Vault, LPToken};

use pismo_protocol::test_coin::{Self, TEST_COIN};

use sui::coin::{Self, Coin, TreasuryCap};
use sui::transfer;
use sui::tx_context::{Self, TxContext};
use sui::balance::{Self, Balance, Supply};
use std::option;

#[test_only]
use sui::test_scenario;

// Define dummy types for testing
public struct TEST_LP has drop {}

#[test]
fun test_lp() {

    // Addresses
    let admin = @0x1;
    let user1 = @0x2;
    let user2 = @0x3;

    // Start test scenario
    let mut scenario = test_scenario::begin(admin);

    // Transaction 1: Create TEST_COIN currency
    {
        let treasury_cap = test_coin::init_token(scenario.ctx());
        transfer::public_transfer(treasury_cap, scenario.sender());
    };

    // Transaction 2: Initialize the vault
    test_scenario::next_tx(&mut scenario, admin);
    {
        
        lp::init_lp_vault<TEST_COIN, TEST_LP>(scenario.ctx());
    };

    // Transaction 3: Mint 1000 TEST_COIN for user1
    test_scenario::next_tx(&mut scenario, admin);
    {
        let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<TEST_COIN>>(&scenario);
        
        let coin = coin::mint(&mut treasury_cap, 1000, scenario.ctx());
        transfer::public_transfer(coin, user1);
        test_scenario::return_to_sender(&scenario, treasury_cap);
    };

    // Transaction 4: User1 deposits 1000 TEST_COIN
    test_scenario::next_tx(&mut scenario, user1);
    {
        let mut vault = test_scenario::take_shared<Vault<TEST_COIN, TEST_LP>>(&scenario);
        let coin = test_scenario::take_from_sender<Coin<TEST_COIN>>(&scenario);
        
        lp::deposit_lp(&mut vault, coin, scenario.ctx());
        test_scenario::return_shared(vault);
    };

    // Transaction 5: Verify user1 has 1000 LP tokens and vault state
    test_scenario::next_tx(&mut scenario, user1);
    {
        let lp_token = test_scenario::take_from_sender<Coin<LPToken<TEST_LP>>>(&scenario);
        assert!(coin::value(&lp_token) == 1000, 0); // Initial deposit: 1000 LP tokens
        test_scenario::return_to_sender(&scenario, lp_token);

        let vault = test_scenario::take_shared<Vault<TEST_COIN, TEST_LP>>(&scenario);
        assert!(vault.coin_value() == 1000, 0); // Vault has 1000 TEST_COIN
        assert!(vault.lp_value() == 1000, 0); // LP supply is 1000
        test_scenario::return_shared(vault);
    };

    // Transaction 6: Mint 500 TEST_COIN for user1
    test_scenario::next_tx(&mut scenario, admin);
    {
        let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<TEST_COIN>>(&scenario);
        
        let coin = coin::mint(&mut treasury_cap, 500, scenario.ctx());
        transfer::public_transfer(coin, user1);
        test_scenario::return_to_sender(&scenario, treasury_cap);
    };

    // Transaction 7: User1 deposits 500 TEST_COIN
    test_scenario::next_tx(&mut scenario, user1);
    {
        let mut vault = test_scenario::take_shared<Vault<TEST_COIN, TEST_LP>>(&scenario);
        let coin = test_scenario::take_from_sender<Coin<TEST_COIN>>(&scenario);
        
        lp::deposit_lp(&mut vault, coin, scenario.ctx());
        test_scenario::return_shared(vault);
    };

    // Transaction 8: Verify user1's total LP tokens (1000 + 500 = 1500)
    test_scenario::next_tx(&mut scenario, user1);
    {
        let lp_token1 = test_scenario::take_from_sender<Coin<LPToken<TEST_LP>>>(&scenario);
        let lp_token2 = test_scenario::take_from_sender<Coin<LPToken<TEST_LP>>>(&scenario);
        assert!(coin::value(&lp_token1) + coin::value(&lp_token2) == 1500, 0);
        test_scenario::return_to_sender(&scenario, lp_token1);
        test_scenario::return_to_sender(&scenario, lp_token2);

        let vault = test_scenario::take_shared<Vault<TEST_COIN, TEST_LP>>(&scenario);
        assert!(vault.coin_value() == 1500, 0); // Vault has 1500 TEST_COIN
        assert!(vault.lp_value() == 1500, 0); // LP supply is 1500
        test_scenario::return_shared(vault);
    };

    // Transaction 9: User1 withdraws 300 LP tokens
    test_scenario::next_tx(&mut scenario, user1);
    {
        let mut lp_token = test_scenario::take_from_sender<Coin<LPToken<TEST_LP>>>(&scenario);
        
        let to_burn = coin::split(&mut lp_token, 300, scenario.ctx());
        let mut vault = test_scenario::take_shared<Vault<TEST_COIN, TEST_LP>>(&scenario);
        lp::withdraw_lp(&mut vault, to_burn, scenario.ctx());
        test_scenario::return_shared(vault);
        test_scenario::return_to_sender(&scenario, lp_token);
    };

    // Transaction 10: Verify withdrawal (300 TEST_COIN)
    test_scenario::next_tx(&mut scenario, user1);
    {
        let coin = test_scenario::take_from_sender<Coin<TEST_COIN>>(&scenario);
        assert!(coin::value(&coin) == 300, 0); // Withdrew 300 TEST_COIN
        test_scenario::return_to_sender(&scenario, coin);

        let vault = test_scenario::take_shared<Vault<TEST_COIN, TEST_LP>>(&scenario);
        assert!(vault.coin_value() == 1200, 0); // Vault has 1200 TEST_COIN
        assert!(vault.lp_value() == 1200, 0); // LP supply is 1200
        test_scenario::return_shared(vault);
    };

    // Transaction 11: Mint 600 TEST_COIN for user2
    test_scenario::next_tx(&mut scenario, admin);
    {
        let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<TEST_COIN>>(&scenario);
        
        let coin = coin::mint(&mut treasury_cap, 600, scenario.ctx());
        transfer::public_transfer(coin, user2);
        test_scenario::return_to_sender(&scenario, treasury_cap);
    };

    // Transaction 12: User2 deposits 600 TEST_COIN
    test_scenario::next_tx(&mut scenario, user2);
    {
        let mut vault = test_scenario::take_shared<Vault<TEST_COIN, TEST_LP>>(&scenario);
        let coin = test_scenario::take_from_sender<Coin<TEST_COIN>>(&scenario);
        
        lp::deposit_lp(&mut vault, coin, scenario.ctx());
        test_scenario::return_shared(vault);
    };

    // Transaction 13: Verify user2's deposit
    test_scenario::next_tx(&mut scenario, user2);
    {
        let lp_token = test_scenario::take_from_sender<Coin<LPToken<TEST_LP>>>(&scenario);
        assert!(coin::value(&lp_token) == 600, 0); // User2 has 600 LP tokens
        test_scenario::return_to_sender(&scenario, lp_token);

        let vault = test_scenario::take_shared<Vault<TEST_COIN, TEST_LP>>(&scenario);
        assert!(vault.coin_value() == 1800, 0); // Vault has 1800 TEST_COIN
        assert!(vault.lp_value() == 1800, 0); // LP supply is 1800
        test_scenario::return_shared(vault);
    };

    // Transaction 14: User2 withdraws 600 LP tokens
    test_scenario::next_tx(&mut scenario, user2);
    {
        let lp_token = test_scenario::take_from_sender<Coin<LPToken<TEST_LP>>>(&scenario);
        
        let mut vault = test_scenario::take_shared<Vault<TEST_COIN, TEST_LP>>(&scenario);
        lp::withdraw_lp(&mut vault, lp_token, scenario.ctx());
        test_scenario::return_shared(vault);
    };

    // Transaction 15: Verify user2's withdrawal
    test_scenario::next_tx(&mut scenario, user2);
    {
        let coin = test_scenario::take_from_sender<Coin<TEST_COIN>>(&scenario);
        assert!(coin::value(&coin) == 600, 0); // Withdrew 600 TEST_COIN
        test_scenario::return_to_sender(&scenario, coin);

        let vault = test_scenario::take_shared<Vault<TEST_COIN, TEST_LP>>(&scenario);
        assert!(vault.coin_value() == 1200, 0); // Vault has 1200 TEST_COIN
        assert!(vault.lp_value() == 1200, 0); // LP supply is 1200
        test_scenario::return_shared(vault);
    };

    // Transaction 15.5: User1 merges their LP token coins
    test_scenario::next_tx(&mut scenario, user1);
    {
        let mut coin1 = test_scenario::take_from_sender<Coin<LPToken<TEST_LP>>>(&scenario);
        let coin2 = test_scenario::take_from_sender<Coin<LPToken<TEST_LP>>>(&scenario);
        coin::join(&mut coin1, coin2);
        test_scenario::return_to_sender(&scenario, coin1);
    };

    // Transaction 16: User1 withdraws all 1200 LP tokens
    test_scenario::next_tx(&mut scenario, user1);
    {   
        let lp_token = test_scenario::take_from_sender<Coin<LPToken<TEST_LP>>>(&scenario);
        
        let mut vault = test_scenario::take_shared<Vault<TEST_COIN, TEST_LP>>(&scenario);
        lp::withdraw_lp(&mut vault, lp_token, scenario.ctx());
        test_scenario::return_shared(vault);
    };

    // Transaction 17: Verify full withdrawal
    test_scenario::next_tx(&mut scenario, user1);
    {
        let coin = test_scenario::take_from_sender<Coin<TEST_COIN>>(&scenario);
        let amount = coin::value(&coin);
        assert!(amount == 1200, amount); // Withdrew 1200 TEST_COIN
        test_scenario::return_to_sender(&scenario, coin);

        let vault = test_scenario::take_shared<Vault<TEST_COIN, TEST_LP>>(&scenario);
        assert!(vault.coin_value() == 0, 0); // Vault is empty
        assert!(vault.lp_value() == 0, 0); // LP supply is 0
        test_scenario::return_shared(vault);
    };

    // Transaction 18: Mint 200 TEST_COIN for user1
    test_scenario::next_tx(&mut scenario, admin);
    {
        let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<TEST_COIN>>(&scenario);
        
        let coin = coin::mint(&mut treasury_cap, 200, scenario.ctx());
        transfer::public_transfer(coin, user1);
        test_scenario::return_to_sender(&scenario, treasury_cap);
    };

    // Transaction 19: User1 deposits 200 TEST_COIN into empty vault
    test_scenario::next_tx(&mut scenario, user1);
    {
        let mut vault = test_scenario::take_shared<Vault<TEST_COIN, TEST_LP>>(&scenario);
        let coin = test_scenario::take_from_sender<Coin<TEST_COIN>>(&scenario);
        
        lp::deposit_lp(&mut vault, coin, scenario.ctx());
        test_scenario::return_shared(vault);
    };

    // Transaction 20: Verify deposit into empty vault
    test_scenario::next_tx(&mut scenario, user1);
    {
        let lp_token = test_scenario::take_from_sender<Coin<LPToken<TEST_LP>>>(&scenario);
        assert!(coin::value(&lp_token) == 200, 0); // 200 LP tokens minted
        test_scenario::return_to_sender(&scenario, lp_token);

        let vault = test_scenario::take_shared<Vault<TEST_COIN, TEST_LP>>(&scenario);
        assert!(vault.coin_value() == 200, 0); // Vault has 200 TEST_COIN
        assert!(vault.lp_value() == 200, 0); // LP supply is 200
        test_scenario::return_shared(vault);
    };
    
    test_scenario::end(scenario);
}

// Optional: Test depositing zero coins (should fail due to assertion)
#[test]
#[expected_failure]
fun test_deposit_zero() {
    let admin = @0x1;
    let user = @0x2;

    let mut scenario = test_scenario::begin(admin);
    {
        let treasury_cap = test_coin::init_token(scenario.ctx());
        transfer::public_transfer(treasury_cap, scenario.sender());
    };
    test_scenario::next_tx(&mut scenario, admin);
    {
        
        lp::init_lp_vault<TEST_COIN, TEST_LP>(scenario.ctx());
    };
    test_scenario::next_tx(&mut scenario, admin);
    {
        let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<TEST_COIN>>(&scenario);
        
        let coin = coin::mint(&mut treasury_cap, 0, scenario.ctx()); // Mint 0 TEST_COIN
        transfer::public_transfer(coin, user);
        test_scenario::return_to_sender(&scenario, treasury_cap);
    };
    test_scenario::next_tx(&mut scenario, user);
    {
        let mut vault = test_scenario::take_shared<Vault<TEST_COIN, TEST_LP>>(&scenario);
        let coin = test_scenario::take_from_sender<Coin<TEST_COIN>>(&scenario);
        
        lp::deposit_lp(&mut vault, coin, scenario.ctx()); // Should fail here
        test_scenario::return_shared(vault);
    };
    test_scenario::end(scenario);
}