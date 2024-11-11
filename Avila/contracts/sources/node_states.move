module avila::node_states {
    use aptos_framework::timestamp;
    use aptos_framework::account;
    use aptos_framework::event;

    use aptos_std::simple_map::{Self, SimpleMap};

    use std::bcs;
    use std::string::{Self, String};
    use std::vector;
    use std::signer;

    const SEED: vector<u8> = b"avila-node-states";

    const INIT_LIVENESS_CHECKIN_TIME_SECONDS: u64 = 3600;
    const INIT_CHECKIN_WINDOW_SECONDS: u64 = 300;
    
    #[event]
    struct WindowSwitchEvent has drop, store {
        window: vector<address>
    }

    struct State has key {
        signer_cap: account::SignerCapability,
        liveness_start_time_seconds: u64,
        last_checkin: u64,
        num_checks: u64,
        tokens_by_node_address: SimpleMap<address, vector<vector<u8>>>,
        liveness_checkin_time_seconds: u64,
        checkin_window_seconds: u64,
        current_checkin_window: vector<address>,
        previous_checkin_window: vector<address>
    }

    fun init_module(admin: &signer) {
        let now = timestamp::now_seconds();
        let tokens_by_node_address = simple_map::new<address, vector<vector<u8>>>();
        let (resource_account_signer, signer_cap) = account::create_resource_account(admin, SEED);
        move_to(&resource_account_signer,
            State{
                signer_cap,
                liveness_start_time_seconds: now,
                last_checkin: 0,
                num_checks: 1,
                tokens_by_node_address,
                liveness_checkin_time_seconds: INIT_LIVENESS_CHECKIN_TIME_SECONDS,
                checkin_window_seconds: INIT_CHECKIN_WINDOW_SECONDS,
                current_checkin_window: vector::empty(),
                previous_checkin_window: vector::empty()
            }
        )
    }

    public fun is_first(state: &State): bool {
        let start_cur_window = state.liveness_start_time_seconds + (state.num_checks * state.liveness_checkin_time_seconds);
        let now = timestamp::now_seconds();

        if(state.last_checkin < start_cur_window && now > start_cur_window){
            return true
        };
        return false
    }

    public fun is_in_checkin_window(state: &State): bool {
        let start_cur_window = state.liveness_start_time_seconds + (state.num_checks * state.liveness_checkin_time_seconds);
        let end_cur_window = start_cur_window + state.checkin_window_seconds;
        let now = timestamp::now_seconds();

        if(now >= start_cur_window && now <= end_cur_window){
            return true
        };
        return false
    }

    public fun liveness_report(admin: &signer) acquires State {
        let state = borrow_global_mut<State>(get_resource_address());
        if(is_first(state)){
            state.num_checks = state.num_checks + 1;
            state.previous_checkin_window = state.current_checkin_window;
            state.current_checkin_window = vector::empty();
            event::emit(
                WindowSwitchEvent {
                    window: state.previous_checkin_window
                }
            );
        };

        if(!is_in_checkin_window(state)){
            return
        };

        vector::push_back(&mut state.current_checkin_window, signer::address_of(admin));
    }
    
    public fun token_to_bytes(token_identifier: String, chain_id: u64): vector<u8> {
        let chain_id_bytes = bcs::to_bytes<u64>(&chain_id);
        string::append_utf8(&mut token_identifier, chain_id_bytes);
        *string::bytes(&token_identifier)
    }

    inline fun get_resource_address(): address {
        account::create_resource_address(&@avila, SEED)
    }

}