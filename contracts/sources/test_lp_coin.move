module pismo_protocol::test_lp;

use sui::coin::{Self, TreasuryCap};

public struct TEST_LP has drop {}

fun init(witness: TEST_LP, ctx: &mut TxContext) {
		let (treasury, metadata) = coin::create_currency(
				witness,
				6,
				b"TEST_LP",
				b"",
				b"",
				option::none(),
				ctx,
		);
		transfer::public_freeze_object(metadata);
		transfer::public_transfer(treasury, ctx.sender())
}

#[test_only]
public(package) fun test_init(ctx: &mut TxContext){
	init(TEST_LP{}, ctx)
}

#[test_only]
public(package) fun init_token(ctx: &mut TxContext): TreasuryCap<TEST_LP> {
	let (treasury, metadata) = coin::create_currency(
			TEST_LP {},
			6,
			b"TEST_LP",
			b"",
			b"",
			option::none(),
			ctx,
		);
		transfer::public_freeze_object(metadata);
	treasury
}

public entry fun mint(
		treasury_cap: &mut TreasuryCap<TEST_LP>,
		amount: u64,
		recipient: address,
		ctx: &mut TxContext
) {
		let coin = coin::mint(treasury_cap, amount, ctx);
		transfer::public_transfer(coin, recipient)
}