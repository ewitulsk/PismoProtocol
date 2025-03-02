module pismo_protocol::positions;

use sui::clock::Clock;
use sui::coin::Coin;
use sui::balance::Balance;
use sui::transfer;
use sui::object::UID;

use pismo_protocol::tokens::TokenIdentifier;

const E_BAD_POSITION: u64 = 225;

public enum PositionType has store {
    Long,
    Short,
    None
}

public struct Position has key, store {
    id: UID,
    _type: PositionType,
    amount: u64,
    entry_price:  u128,
    supported_positions_token_i: u64
}

public fun u64_to_position_type(pos_id: u64): PositionType {
    match (pos_id) {
        0 => PositionType::Long,
        1 => PositionType::Short,
        _ => {
            assert!(false, E_BAD_POSITION);
            PositionType::None
        }
    }
}

public(package) fun new_position(
    pos_type: PositionType,
    amount: u64,
    entry_price: u128,
    supported_positions_token_i: u64,
    ctx: &mut TxContext
): Position {
    Position {
        id: object::new(ctx),
        _type: pos_type,
        amount,
        entry_price,
        supported_positions_token_i
    }
}