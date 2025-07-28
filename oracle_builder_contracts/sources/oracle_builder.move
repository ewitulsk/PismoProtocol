/*
/// Module: oracle_builder
*/
module oracle_builder::oracle_builder {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use std::string::String;
    use std::option::Option;

    public struct AdminCap has key, store {
        id: UID,
    }

    public struct Oracle has key, store {
        id: UID,
        owner: address,
        is_valid: bool,
    }

    public struct PriceFeed has key, store {
        id: UID,
        oracle_id: address,
        is_valid: bool,
        api_key: Option<String>,
        api_key_config: Option<String>,
        underlying_url: String,
        response_field: String,
        live_url: String,
    }

    // ======== Events ========

    public struct OracleCreated has copy, drop {
        oracle_id: address,
        owner: address,
        is_valid: bool,
    }

    public struct PriceFeedCreated has copy, drop {
        price_feed_id: address,
        oracle_id: address,
        owner: address,
        is_valid: bool,
        api_key: Option<String>,
        api_key_config: Option<String>,
        underlying_url: String,
        response_field: String,
        live_url: String,
    }

    public struct OracleInvalidated has copy, drop {
        oracle_id: address,
        invalidated_by: address,
    }

    public struct PriceFeedInvalidated has copy, drop {
        price_feed_id: address,
        oracle_id: address,
        invalidated_by: address,
    }

    // ======== Functions ========

    fun init(ctx: &mut TxContext) {
        let admin_cap = AdminCap {
            id: object::new(ctx),
        };
        
        transfer::transfer(admin_cap, tx_context::sender(ctx));
    }

    public fun new_oracle(ctx: &mut TxContext) {
        let oracle_id = object::new(ctx);
        let oracle_address = object::uid_to_address(&oracle_id);
        let owner = tx_context::sender(ctx);
        
        let oracle = Oracle {
            id: oracle_id,
            owner,
            is_valid: true,
        };

        event::emit(OracleCreated {
            oracle_id: oracle_address,
            owner,
            is_valid: true,
        });

        transfer::public_share_object(oracle);
    }

    public fun new_price_feed(
        oracle: &Oracle,
        api_key: Option<String>,
        api_key_config: Option<String>,
        underlying_url: String,
        response_field: String,
        live_url: String,
        ctx: &mut TxContext
    ) {
        let caller = tx_context::sender(ctx);
        
        assert!(oracle.owner == caller, 0); 
        
        assert!(oracle.is_valid, 1);

        let price_feed_id = object::new(ctx);
        let price_feed_address = object::uid_to_address(&price_feed_id);
        let oracle_address = object::uid_to_address(&oracle.id);
        
        let price_feed = PriceFeed {
            id: price_feed_id,
            oracle_id: oracle_address,
            is_valid: true,
            api_key,
            api_key_config,
            underlying_url,
            response_field,
            live_url,
        };

        event::emit(PriceFeedCreated {
            price_feed_id: price_feed_address,
            oracle_id: oracle_address,
            owner: caller,
            is_valid: true,
            api_key,
            api_key_config,
            underlying_url,
            response_field,
            live_url,
        });

        transfer::public_share_object(price_feed);
    }

    public fun invalidate_oracle(
        _admin_cap: &AdminCap,
        oracle: &mut Oracle,
        ctx: &mut TxContext
    ) {
        oracle.is_valid = false;
        
        event::emit(OracleInvalidated {
            oracle_id: object::uid_to_address(&oracle.id),
            invalidated_by: tx_context::sender(ctx),
        });
    }

    public fun invalidate_price_feed(
        _admin_cap: &AdminCap,
        price_feed: &mut PriceFeed,
        ctx: &mut TxContext
    ) {
        price_feed.is_valid = false;
        
        event::emit(PriceFeedInvalidated {
            price_feed_id: object::uid_to_address(&price_feed.id),
            oracle_id: price_feed.oracle_id,
            invalidated_by: tx_context::sender(ctx),
        });
    }

    // ======== Getters ========

    public fun get_oracle_owner(oracle: &Oracle): address {
        oracle.owner
    }

    public fun get_oracle_validity(oracle: &Oracle): bool {
        oracle.is_valid
    }

    public fun get_price_feed_oracle_id(price_feed: &PriceFeed): address {
        price_feed.oracle_id
    }

    public fun get_price_feed_validity(price_feed: &PriceFeed): bool {
        price_feed.is_valid
    }
}


