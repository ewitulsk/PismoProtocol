module pismo_protocol::signed;

//We need to validate that 0 is handled consistently as either a positive or negative number.

public enum Sign has drop, copy {
    Positive,
    Negative
}

public struct SignedU128 has drop, copy {
    amount: u128,
    sign: Sign
}

public fun sub_signed_u128(a: u128, b: u128): SignedU128 {
    if (a < b) {
        SignedU128 {
            amount: b - a,
            sign: Sign::Negative
        }
    } else {
        SignedU128 {
            amount: a - b,
            sign: Sign::Positive
        }
    }
}

public fun is_positive(val: &SignedU128): bool {
    match (val.sign) {
        Sign::Positive => {
            true
        },
        Sign::Negative => {
            false
        }
    }
}

public fun is_negative(val: &SignedU128): bool {
    match (val.sign) {
        Sign::Positive => {
            false
        },
        Sign::Negative => {
            true
        }
    }
}

public(package) fun amount(val: &SignedU128): u128 {
    val.amount
}

public(package) fun sign(val: &SignedU128): Sign {
    val.sign
}

public(package) fun new_signed_u128(amount: u128, sign: Sign): SignedU128 {
    SignedU128 { amount, sign }
}

public(package) fun new_sign(is_positive: bool): Sign {
    if (is_positive) {
        Sign::Positive
    } else {
        Sign::Negative
    }
}

public(package) fun add_signed_u128(a: &SignedU128, b: &SignedU128): SignedU128 {
    if (sign(a) == sign(b)) {
        // Same sign, just add amounts
        new_signed_u128(amount(a) + amount(b), sign(a))
    } else {
        // Different signs, subtract amounts
        if (amount(a) > amount(b)) {
            new_signed_u128(amount(a) - amount(b), sign(a))
        } else {
            new_signed_u128(amount(b) - amount(a), sign(b))
        }
    }
}

public(package) fun add_u128_to_signed(a: &SignedU128, b: u128): SignedU128 {
    let sign_a = sign(a);
    let amount_a = amount(a);

    if (sign_a == Sign::Positive) {
        new_signed_u128(amount_a + b, Sign::Positive)
    } else { // a is Negative
        if (amount_a >= b) {
            // e.g., -5 + 3 = -2
            new_signed_u128(amount_a - b, Sign::Negative)
        } else {
            // e.g., -3 + 5 = 2
            new_signed_u128(b - amount_a, Sign::Positive)
        }
    }
}

public(package) fun multiply(a: &SignedU128, b: &SignedU128): SignedU128 {
    let new_amount = amount(a) * amount(b);
    let new_sign = if (sign(a) == sign(b)) {
        Sign::Positive
    } else {
        Sign::Negative
    };
    new_signed_u128(new_amount, new_sign)
}

public(package) fun mul(a: &SignedU128, b: u128): SignedU128 {
    new_signed_u128(amount(a) * b, sign(a))
}

public(package) fun div(a: &SignedU128, b: u128): SignedU128 {
    // Aborts if b is 0, standard Move behavior
    new_signed_u128(amount(a) / b, sign(a))
}

public(package) fun mul_div(a: &SignedU128, numerator: u128, denominator: u128): SignedU128 {
    // Aborts if denominator is 0 or if amount(a) * numerator overflows u128
    let new_amount = (amount(a) * numerator) / denominator;
    new_signed_u128(new_amount, sign(a))
}

public(package) fun equal(a: &SignedU128, b: &SignedU128): bool {
    amount(a) == amount(b) && sign(a) == sign(b)
}

public(package) fun gt(a: &SignedU128, b: &SignedU128): bool {
    let sign_a = sign(a);
    let sign_b = sign(b);

    if (sign_a == Sign::Positive && sign_b == Sign::Negative) {
        true
    } else if (sign_a == Sign::Negative && sign_b == Sign::Positive) {
        false
    } else if (sign_a == Sign::Positive) { // Both Positive
        amount(a) > amount(b)
    } else { // Both Negative
        amount(a) < amount(b) // e.g., -2 > -5 means 2 < 5
    }
}

public(package) fun gte(a: &SignedU128, b: &SignedU128): bool {
    // Could also implement as gt(a, b) || equal(a, b)
    let sign_a = sign(a);
    let sign_b = sign(b);

    if (sign_a == Sign::Positive && sign_b == Sign::Negative) {
        true
    } else if (sign_a == Sign::Negative && sign_b == Sign::Positive) {
        false
    } else if (sign_a == Sign::Positive) { // Both Positive
        amount(a) >= amount(b)
    } else { // Both Negative
        amount(a) <= amount(b) // e.g., -2 >= -5 means 2 <= 5
    }
}

public(package) fun lt(a: &SignedU128, b: &SignedU128): bool {
    // Could also implement as !gte(a, b)
    let sign_a = sign(a);
    let sign_b = sign(b);

    if (sign_a == Sign::Positive && sign_b == Sign::Negative) {
        false
    } else if (sign_a == Sign::Negative && sign_b == Sign::Positive) {
        true
    } else if (sign_a == Sign::Positive) { // Both Positive
        amount(a) < amount(b)
    } else { // Both Negative
        amount(a) > amount(b) // e.g., -5 < -2 means 5 > 2
    }
}

public(package) fun lte(a: &SignedU128, b: &SignedU128): bool {
    // Could also implement as !gt(a, b)
    let sign_a = sign(a);
    let sign_b = sign(b);

    if (sign_a == Sign::Positive && sign_b == Sign::Negative) {
        false
    } else if (sign_a == Sign::Negative && sign_b == Sign::Positive) {
        true
    } else if (sign_a == Sign::Positive) { // Both Positive
        amount(a) <= amount(b)
    } else { // Both Negative
        amount(a) >= amount(b) // e.g., -5 <= -2 means 5 >= 2
    }
}