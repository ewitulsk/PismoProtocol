module pismo_protocol::test_nvda_coin;

use sui::coin::{Self, TreasuryCap};
use sui::transfer;
use sui::tx_context::{Self, TxContext};
use std::option;

public struct TEST_NVDA_COIN has drop {}

fun init(witness: TEST_NVDA_COIN, ctx: &mut TxContext) {
		let (treasury, metadata) = coin::create_currency(
				witness,
				8,
				b"TEST_NVDA",
				b"",
				b"",
				option::none(),
				ctx,
		);
		transfer::public_freeze_object(metadata);
		transfer::public_share_object(treasury)
}

#[test_only]
public(package) fun test_init(ctx: &mut TxContext){
	init(TEST_NVDA_COIN{}, ctx)
}

#[test_only]
public(package) fun init_token(ctx: &mut TxContext): TreasuryCap<TEST_NVDA_COIN> {
	let (treasury, metadata) = coin::create_currency(
			TEST_NVDA_COIN {},
			8,
			b"TEST_NVDA",
			b"",
			b"",
			option::none(),
			ctx,
		);
		transfer::public_freeze_object(metadata);
	treasury
}

public entry fun mint(
		treasury_cap: &mut TreasuryCap<TEST_NVDA_COIN>,
		amount: u64,
		recipient: address,
		ctx: &mut TxContext
) {
		let coin = coin::mint(treasury_cap, amount, ctx);
		transfer::public_transfer(coin, recipient)
}
