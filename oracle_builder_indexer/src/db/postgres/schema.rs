// @generated automatically by Diesel CLI.

diesel::table! {
    oracles (oracle_id) {
        oracle_id -> Text,
        owner -> Text,
        is_valid -> Bool,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
    }
}

diesel::table! {
    price_feeds (price_feed_id) {
        price_feed_id -> Text,
        oracle_id -> Text,
        is_valid -> Bool,
        api_key -> Text,
        underlying_url -> Text,
        response_field -> Text,
        live_url -> Text,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
    }
}

diesel::joinable!(price_feeds -> oracles (oracle_id));

diesel::allow_tables_to_appear_in_same_query!(
    oracles,
    price_feeds,
);
