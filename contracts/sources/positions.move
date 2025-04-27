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

use std::vector;

use pismo_protocol::tokens::{TokenIdentifier, assert_price_obj_match_identifiers_pyth, get_PYTH_ID, get_price_feed_bytes_pyth, get_price_pyth};
use pismo_protocol::main::{Self, AdminCap, Global};

const E_BAD_POSITION: u64 = 225;
const E_INVALID_POSITION_TOKEN_INDEX: u64 = 226;

public struct PositionCreatedEvent has copy, drop {
    position_id: address,
    position_type: PositionType,
    amount: u64,
    leverage_multiplier: u16,
    entry_price: u64,
    entry_price_decimals: u8,
    supported_positions_token_i: u64,
    price_feed_id_bytes: vector<u8>,
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
    transfer_amount: u128,
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
    global: &Global,
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
        global,
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
    global: &Global,
    pos_type: PositionType,
    amount: u64,
    leverage_multiplier: u16,
    entry_price: u64,
    entry_price_decimals: u8,
    supported_positions_token_i: u64, //We have a supported positions on both Global and Program... We shouldn't have the global one...
    account_id: address,
    ctx: &mut TxContext
) {
    // Validate that the position token index exists in global.supported_positions
    let supported_positions = main::get_supported_positions(global);
    assert!(supported_positions_token_i < vector::length(&supported_positions), E_INVALID_POSITION_TOKEN_INDEX);
    
    // Get the price feed ID bytes for this token
    let token_identifier = *vector::borrow(&supported_positions, supported_positions_token_i);
    let price_feed_id_bytes = pismo_protocol::tokens::price_feed_id_bytes(&token_identifier);
    
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
        price_feed_id_bytes,
        account_id
    });
    
    transfer::share_object(position);
}

public enum Sign has drop {
    Positive,
    Negative
}

public enum TransferTo has drop, copy {
    Vault,
    User
}

//THIS FUNCTION SHOULD NEVER HAVE THE DROP ABILITY. IF YOU NEED TO DROP IT, YOU'RE DOING SOMETHING WRONG.
public struct TransferData {
    transfer_to: TransferTo,
    amount: u128
}

public(package) fun transfer_to(data: &TransferData): TransferTo {
    data.transfer_to
}

public(package) fun transfer_amount(data: &TransferData): u128 {
    data.amount
}

public(package) fun is_transfer_to_vault(data: &TransferData): bool {
    match (data.transfer_to) {
        TransferTo::Vault => true,
        TransferTo::User => false
    }
}

public(package) fun is_transfer_to_user(data: &TransferData): bool {
    match (data.transfer_to) {
        TransferTo::Vault => false,
        TransferTo::User => true
    }
}

public(package) fun destroy_transfer_data(data: TransferData) {
    let TransferData { transfer_to: _, amount: _ } = data;
}

public(package) fun close_position_internal(
    position: Position,
    close_price: u64,
    close_price_decimals: u8,
    supported_positions_token_i: u64,
): TransferData {    
    let Position {
        id,
        _type: position_type,
        amount,
        leverage_multiplier,
        entry_price,
        entry_price_decimals,
        supported_positions_token_i: pos_token_i,
        account_id
    } = position;
    let position_id = object::uid_to_address(&id);
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

    let transfer_amount = (price_delta as u128) * (amount as u128) * (leverage_multiplier as u128);

    let transfer_data = match (position_type) {
        PositionType::Long => {
            match (sign) {
                Sign::Positive => {
                    TransferData {
                        transfer_to: TransferTo::User,
                        amount: transfer_amount
                    }
                },
                Sign::Negative => {
                    TransferData {
                        transfer_to: TransferTo::Vault,
                        amount: transfer_amount
                    }
                }
            }
        },
        PositionType::Short => {
            match (sign) {
                Sign::Positive => {
                    TransferData {
                        transfer_to: TransferTo::Vault,
                        amount: transfer_amount
                    }
                },
                Sign::Negative => {
                    TransferData {
                        transfer_to: TransferTo::User,
                        amount: transfer_amount
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

public(package) fun amount(position: &Position): u64 {
    position.amount
}

public(package) fun leverage_multiplier(position: &Position): u16 {
    position.leverage_multiplier
}

public(package) fun entry_price(position: &Position): u64 {
    position.entry_price
}

public(package) fun entry_price_decimals(position: &Position): u8 {
    position.entry_price_decimals
}

public(package) fun supported_positions_token_i(position: &Position): u64 {
    position.supported_positions_token_i
}

public(package) fun account_id(position: &Position): address {
    position.account_id
}

/// Destroys a vector of Position objects.
public(package) fun destroy_positions(positions: &mut vector<Position>) {
    while (!vector::is_empty(positions)) {
        let Position {
            id,
            _type: _,
            amount: _,
            leverage_multiplier: _,
            entry_price: _,
            entry_price_decimals: _,
            supported_positions_token_i: _,
            account_id: _,
        } = vector::pop_back(positions);
        object::delete(id);
    };
}