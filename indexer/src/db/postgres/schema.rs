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
    collateral_deposit_events (transaction_hash) {
        transaction_hash -> Text,
        collateral_id -> Text,
        collateral_marker_id -> Text,
        account_id -> Text,
        token_address -> Text,
        amount -> Numeric,
        timestamp -> Timestamptz,
    }
}

diesel::table! {
    collateral_marker_liquidated_events (transaction_hash) {
        transaction_hash -> Text,
        collateral_marker_id -> Text,
        account_id -> Text,
        timestamp -> Timestamptz,
    }
}

diesel::table! {
    collateral_transfers (transfer_id) {
        transaction_hash -> Text,
        transfer_id -> Text,
        collateral_marker_id -> Text,
        collateral_address -> Text,
        amount -> Numeric,
        to_vault_address -> Text,
        fulfilled -> Bool,
        timestamp -> Timestamptz,
    }
}

diesel::table! {
    new_account_events (transaction_hash) {
        transaction_hash -> Text,
        account_id -> Text,
        stats_id -> Text,
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

diesel::table! {
    position_liquidated_events (transaction_hash) {
        transaction_hash -> Text,
        position_id -> Text,
        timestamp -> Timestamptz,
    }
}

diesel::table! {
    start_collateral_value_assertion_events (cva_id) {
        cva_id -> Text,
        transaction_hash -> Text,
        account_id -> Text,
        program_id -> Text,
        num_open_collateral_objects -> Int8,
        timestamp -> Timestamptz,
    }
}

diesel::table! {
    vault_created_events (transaction_hash) {
        transaction_hash -> Text,
        vault_address -> Text,
        vault_marker_address -> Text,
        coin_token_info -> Text,
        lp_token_info -> Text,
        timestamp -> Timestamptz,
    }
}

diesel::table! {
    vault_transfers (transfer_id) {
        transaction_hash -> Text,
        transfer_id -> Text,
        vault_marker_id -> Text,
        vault_address -> Text,
        amount -> Numeric,
        to_user_address -> Text,
        fulfilled -> Bool,
        timestamp -> Timestamptz,
    }
}

diesel::allow_tables_to_appear_in_same_query!(
    close_position_events,
    collateral_deposit_events,
    collateral_marker_liquidated_events,
    collateral_transfers,
    new_account_events,
    open_position_events,
    position_liquidated_events,
    start_collateral_value_assertion_events,
    vault_created_events,
    vault_transfers,
);
