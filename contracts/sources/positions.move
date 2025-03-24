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
use sui::event;

use pismo_protocol::tokens::{TokenIdentifier, assert_price_obj_match_identifiers_pyth, get_PYTH_ID, get_price_feed_bytes_pyth, get_price_pyth};
use pismo_protocol::main::AdminCap;

const E_BAD_POSITION: u64 = 225;

public struct PositionCreatedEvent has copy, drop {
    position_id: address,
    position_type: PositionType,
    amount: u64,
    leverage_multiplier: u16,
    entry_price: u64,
    entry_price_decimals: u8,
    supported_positions_token_i: u64,
    account_id: address
}

public struct PositionClosedEvent has copy, drop {
    position_id: address,
    position_type: PositionType,
    amount: u64,
    leverage_multiplier: u16,
    entry_price: u64,
    entry_price_decimals: u8,
    close_price: u64,
    close_price_decimals: u8,
    price_delta: u64,
    transfer_amount: u64,
    transfer_to: TransferTo,
    account_id: address
}

public enum PositionType has store, drop, copy {
    Long,
    Short,
    None
}

public struct Position has key, store {
    id: UID,
    _type: PositionType,
    amount: u64,
    leverage_multiplier: u16,
    entry_price:  u64,
    entry_price_decimals: u8,
    supported_positions_token_i: u64,
    account_id: address
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

public entry fun admin_force_new_positon (
    _: &AdminCap,
    pos_type_u64: u64,
    amount: u64,
    leverage_multiplier: u16,
    entry_price: u64,
    entry_price_decimals: u8,
    supported_positions_token_i: u64,
    account_id: address,
    to_address: address,
    ctx: &mut TxContext
) {
    let pos_type = u64_to_position_type(pos_type_u64);
    new_position_internal(
        pos_type,
        amount,
        leverage_multiplier,
        entry_price,
        entry_price_decimals,
        supported_positions_token_i,
        account_id,
        ctx,
    );
}

public(package) fun new_position_internal (
    pos_type: PositionType,
    amount: u64,
    leverage_multiplier: u16,
    entry_price: u64,
    entry_price_decimals: u8,
    supported_positions_token_i: u64,
    account_id: address,
    ctx: &mut TxContext
) {
    let position = Position {
        id: object::new(ctx),
        _type: pos_type,
        amount,
        leverage_multiplier,
        entry_price,
        entry_price_decimals,
        account_id,
        supported_positions_token_i
    };

    event::emit(PositionCreatedEvent {
        position_id: object::uid_to_address(&position.id),
        position_type: pos_type,
        amount,
        leverage_multiplier,
        entry_price,
        entry_price_decimals,
        supported_positions_token_i,
        account_id
    });
    
    transfer::public_share_object(position);
}

public enum Sign has drop {
    Positive,
    Negative
}

public enum TransferTo has drop, copy {
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
    account_id: address,
    ctx: &mut TxContext
): TransferData {
    let position_id = object::uid_to_address(&position.id);
    let position_type = position._type;
    let amount = position.amount;
    let leverage_multiplier = position.leverage_multiplier;
    let entry_price = position.entry_price;
    let entry_price_decimals = position.entry_price_decimals;
    
    let Position {
        id,
        _type,
        amount: _,
        leverage_multiplier: _,
        entry_price: _,
        entry_price_decimals: _,
        supported_positions_token_i: pos_token_i,
        account_id
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

    let transfer_data = match (_type) {
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
    };
    
    event::emit(PositionClosedEvent {
        position_id,
        position_type,
        amount,
        leverage_multiplier,
        entry_price,
        entry_price_decimals,
        close_price,
        close_price_decimals,
        price_delta,
        transfer_amount: transfer_data.amount,
        transfer_to: transfer_data.transfer_to,
        account_id
    });
    
    transfer_data
}