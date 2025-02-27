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

    /// Capability that grants administrative permissions
    public struct AdminCap has key, store {
        id: UID
    }

    /// Initialize the module and transfer AdminCap to the sender
    fun init(ctx: &mut TxContext) {
        // Create AdminCap object
        let admin_cap = AdminCap {
            id: object::new(ctx)
        };
        
        // Transfer AdminCap to the sender
        transfer::transfer(admin_cap, tx_context::sender(ctx));
    }
    
    #[test_only]
    public fun create_admin_cap_for_testing(ctx: &mut TxContext): AdminCap {
        AdminCap {
            id: object::new(ctx)
        }
    }
}