module pismo_protocol::usdc_lp_coin;

use sui::coin::{Self, TreasuryCap};

public struct USDC_LP_COIN has drop {}

fun init(witness: USDC_LP_COIN, ctx: &mut TxContext) {
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
	init(USDC_LP_COIN{}, ctx)
}

#[test_only]
public(package) fun init_token(ctx: &mut TxContext): TreasuryCap<USDC_LP_COIN> {
	let (treasury, metadata) = coin::create_currency(
			USDC_LP_COIN {},
			6,
			b"USDC_LP_COIN",
			b"",
			b"",
			option::none(),
			ctx,
		);
		transfer::public_freeze_object(metadata);
	treasury
}

public entry fun mint(
		treasury_cap: &mut TreasuryCap<USDC_LP_COIN>,
		amount: u64,
		recipient: address,
		ctx: &mut TxContext
) {
		let coin = coin::mint(treasury_cap, amount, ctx);
		transfer::public_transfer(coin, recipient)
}