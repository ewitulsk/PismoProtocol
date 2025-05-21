module pismo_protocol::test_usdc_coin;

use sui::coin::{Self, TreasuryCap};
use sui::transfer;
use sui::tx_context::{Self, TxContext};
use std::option;

public struct TEST_USDC_COIN has drop {}

fun init(witness: TEST_USDC_COIN, ctx: &mut TxContext) {
		let (treasury, metadata) = coin::create_currency(
				witness,
				8,
				b"TEST_USDC",
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
	init(TEST_USDC_COIN{}, ctx)
}

#[test_only]
public(package) fun init_token(ctx: &mut TxContext): TreasuryCap<TEST_USDC_COIN> {
	let (treasury, metadata) = coin::create_currency(
			TEST_USDC_COIN {},
			8,
			b"TEST_USDC",
			b"",
			b"",
			option::none(),
			ctx,
		);
		transfer::public_freeze_object(metadata);
	treasury
}

public entry fun mint(
		treasury_cap: &mut TreasuryCap<TEST_USDC_COIN>,
		amount: u64,
		recipient: address,
		ctx: &mut TxContext
) {
		let coin = coin::mint(treasury_cap, amount, ctx);
		transfer::public_transfer(coin, recipient)
}
