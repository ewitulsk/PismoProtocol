/*
/// Module: pismo_synthetics
module pismo_synthetics::pismo_synthetics;
*/

// For Move coding conventions, see
// https://docs.sui.io/concepts/sui-move-concepts/conventions

module pismo_protocol::main {
    use sui::transfer;
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::event;
    use std::vector;
    use std::string::String;
    use pismo_protocol::tokens::TokenIdentifier;

    public struct AdminCap has key, store {
        id: UID
    }
    
    public struct Global has key {
        id: UID,
        supported_lp: vector<String>,
        vault_balances: vector<u64>,
        price_feed_bytes: vector<vector<u8>>,
        supported_positions: vector<TokenIdentifier>
    }

    /// Emitted when a new Global object is created
    public struct GlobalCreatedEvent has copy, drop {
        global_id: address
    }

    fun init(ctx: &mut TxContext) {
        init_internal(ctx)
    }

    fun init_internal(ctx: &mut TxContext) {
        let admin_cap = AdminCap {
            id: object::new(ctx)
        };
        
        let global = Global {
            id: object::new(ctx),
            supported_lp: vector[],
            vault_balances: vector[],
            price_feed_bytes: vector[],
            supported_positions: vector[]
        };

        event::emit(GlobalCreatedEvent {
            global_id: object::uid_to_address(&global.id)
        });
        
        transfer::transfer(admin_cap, tx_context::sender(ctx));
        transfer::share_object(global);
    }

    #[test_only]
    public fun test_init(ctx: &mut TxContext) {
        init_internal(ctx)
    }
    
    public(package) fun push_supported_lp(global: &mut Global, lp: String) {
        vector::push_back(&mut global.supported_lp, lp);
    }
    
    public(package) fun push_vault_balance(global: &mut Global, balance: u64) {
        vector::push_back(&mut global.vault_balances, balance);
    }
    
    public(package) fun push_price_feed_bytes(global: &mut Global, feed_bytes: vector<u8>) {
        vector::push_back(&mut global.price_feed_bytes, feed_bytes);
    }
    
    public(package) fun swap_remove_vault_balance(global: &mut Global, index: u64) {
        vector::swap_remove(&mut global.vault_balances, index);
    }
    
    public(package) fun get_supported_lp_length(global: &Global): u64 {
        vector::length(&global.supported_lp)
    }
    
    public(package) fun get_id_address(global: &Global): address {
        global.id.to_address()
    }
    
    public(package) fun get_supported_lp_vec(global: &Global): vector<String> {
        global.supported_lp
    }
    
    public(package) fun get_price_feed_bytes_vec(global: &Global): vector<vector<u8>> {
        global.price_feed_bytes
    }
    
    public(package) fun get_vault_balances_vec(global: &Global): vector<u64> {
        global.vault_balances
    }
    
    #[test_only]
    public fun create_admin_cap_for_testing(ctx: &mut TxContext): AdminCap {
        AdminCap {
            id: object::new(ctx)
        }
    }
    
    #[test_only]
    public fun create_global_for_testing(ctx: &mut TxContext): Global {
        Global {
            id: object::new(ctx),
            supported_lp: vector[],
            vault_balances: vector[],
            price_feed_bytes: vector[],
            supported_positions: vector[]
        }
    }

    public(package) fun get_supported_positions(global: &Global): vector<TokenIdentifier> {
        global.supported_positions
    }
    
    public entry fun add_supported_position(
        _: &AdminCap, 
        global: &mut Global, 
        token_info: String,
        token_decimals: u8,
        price_feed_id_bytes: vector<u8>,
        oracle_feed: u16
    ) {
        let token_identifier = pismo_protocol::tokens::new_token_identifier(
            token_info,
            token_decimals,
            price_feed_id_bytes,
            oracle_feed
        );
        vector::push_back(&mut global.supported_positions, token_identifier);
    }
}