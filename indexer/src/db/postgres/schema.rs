// @generated automatically by Diesel CLI.

diesel::table! {
    close_position_events (transaction_hash) {
        transaction_hash -> Text,
        position_id -> Text,
        position_type -> Text,
        amount -> Numeric,
        leverage_multiplier -> Numeric,
        entry_price -> Numeric,
        entry_price_decimals -> Int4,
        close_price -> Numeric,
        close_price_decimals -> Int4,
        price_delta -> Numeric,
        transfer_amount -> Numeric,
        transfer_to -> Text,
        account_id -> Text,
        timestamp -> Timestamptz,
    }
}

diesel::table! {
    open_position_events (transaction_hash) {
        transaction_hash -> Text,
        position_id -> Text,
        position_type -> Text,
        amount -> Numeric,
        leverage_multiplier -> Numeric,
        entry_price -> Numeric,
        entry_price_decimals -> Int4,
        supported_positions_token_i -> Int4,
        price_feed_id_bytes -> Text,
        account_id -> Text,
        timestamp -> Timestamptz,
    }
}

diesel::allow_tables_to_appear_in_same_query!(
    close_position_events,
    open_position_events,
);
