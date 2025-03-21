module pismo_protocol::positions;
use pyth::price_info;
use pyth::price_identifier;
use pyth::price;
use pyth::pyth;
use pyth::price_info::PriceInfoObject;

use sui::clock::Clock;
use sui::coin::Coin;
use sui::balance::Balance;
use sui::transfer;
use sui::object::{Self, UID};
use sui::tx_context::TxContext;

use pismo_protocol::tokens::{TokenIdentifier, assert_price_obj_match_identifiers_pyth, get_PYTH_ID, get_price_feed_bytes_pyth, get_price_pyth};

const E_BAD_POSITION: u64 = 225;

public enum PositionType has store, drop {
    Long,
    Short,
    None
}

public struct Position has key, store {
    id: UID,
    _type: PositionType,
    amount: u64,
    entry_price:  u64,
    entry_price_decimals: u8,
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

public(package) fun new_position_internal (
    pos_type: PositionType,
    amount: u64,
    entry_price: u64,
    entry_price_decimals: u8,
    supported_positions_token_i: u64,
    ctx: &mut TxContext
): Position {
    Position {
        id: object::new(ctx),
        _type: pos_type,
        amount,
        entry_price,
        entry_price_decimals,
        supported_positions_token_i
    }
}

public enum Sign has drop {
    Positive,
    Negative
}

public enum TransferTo has drop {
    Vault,
    User
}

public struct TransferData {
    transfer_to: TransferTo,
    amount: u64
}

public(package) fun close_position_internal(
    position: Position,
    close_price: u64,
    close_price_decimals: u8,
    supported_positions_token_i: u64,
    ctx: &mut TxContext
): TransferData {
    let Position {
        id,
        _type,
        amount,
        entry_price,
        entry_price_decimals,
        supported_positions_token_i: pos_token_i
    } = position;
    object::delete(id);

    assert!(pos_token_i == supported_positions_token_i, 0);

    let sign: Sign;
    let price_delta = if (entry_price > close_price) {
        sign = Sign::Positive;
        entry_price - close_price
    } else {
        sign = Sign::Negative;
        close_price - entry_price
    };

    match (_type) {
        PositionType::Long => {
            match (sign) {
                Sign::Positive => {
                    TransferData {
                        transfer_to: TransferTo::User,
                        amount: price_delta
                    }
                },
                Sign::Negative => {
                    TransferData {
                        transfer_to: TransferTo::Vault,
                        amount: price_delta
                    }
                }
            }
        },
        PositionType::Short => {
            match (sign) {
                Sign::Positive => {
                    TransferData {
                        transfer_to: TransferTo::Vault,
                        amount: price_delta
                    }
                },
                Sign::Negative => {
                    TransferData {
                        transfer_to: TransferTo::User,
                        amount: price_delta
                    }
                }
            }
        },
        _ => {
            assert!(false, E_BAD_POSITION);
            TransferData {
                transfer_to: TransferTo::Vault,
                amount: 0
            }
        }  
    }   
}