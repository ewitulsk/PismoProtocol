module pismo_protocol::signed;

public enum Sign has drop, copy {
    Positive,
    Negative
}

public struct SignedU64 has drop, copy {
    amount: u64,
    sign: Sign
}

public fun sub_signed_u64(a: u64, b: u64): SignedU64 {
    if (a < b) {
        SignedU64 {
            amount: b - a,
            sign: Sign::Negative
        }
    } else {
        SignedU64 {
            amount: a - b,
            sign: Sign::Positive
        }
    }
}

public fun is_positive(val: &SignedU64): bool {
    match (val.sign) {
        Sign::Positive => {
            true
        },
        Sign::Negative => {
            false
        }
    }
}

public fun is_negative(val: &SignedU64): bool {
    match (val.sign) {
        Sign::Positive => {
            false
        },
        Sign::Negative => {
            true
        }
    }
}

public(package) fun amount(val: &SignedU64): u64 {
    val.amount
}

public(package) fun sign(val: &SignedU64): Sign {
    val.sign
}

public(package) fun new_signed_u64(amount: u64, sign: Sign): SignedU64 {
    SignedU64 { amount, sign }
}

public(package) fun new_sign(is_positive: bool): Sign {
    if (is_positive) {
        Sign::Positive
    } else {
        Sign::Negative
    }
}

public(package) fun add_signed_u64(a: &SignedU64, b: &SignedU64): SignedU64 {
    if (sign(a) == sign(b)) {
        // Same sign, just add amounts
        new_signed_u64(amount(a) + amount(b), sign(a))
    } else {
        // Different signs, subtract amounts
        if (amount(a) > amount(b)) {
            new_signed_u64(amount(a) - amount(b), sign(a))
        } else {
            new_signed_u64(amount(b) - amount(a), sign(b))
        }
    }
}

public(package) fun multiply(a: &SignedU64, b: &SignedU64): SignedU64 {
    let new_amount = amount(a) * amount(b);
    let new_sign = if (sign(a) == sign(b)) {
        Sign::Positive
    } else {
        Sign::Negative
    };
    new_signed_u64(new_amount, new_sign)
}

public(package) fun mul(a: &SignedU64, b: u64): SignedU64 {
    new_signed_u64(amount(a) * b, sign(a))
}

public(package) fun div(a: &SignedU64, b: u64): SignedU64 {
    // Aborts if b is 0, standard Move behavior
    new_signed_u64(amount(a) / b, sign(a))
}

public(package) fun mul_div(a: &SignedU64, numerator: u64, denominator: u64): SignedU64 {
    // Aborts if denominator is 0 or if amount(a) * numerator overflows u64
    let new_amount = (amount(a) * numerator) / denominator;
    new_signed_u64(new_amount, sign(a))
}

public(package) fun equal(a: &SignedU64, b: &SignedU64): bool {
    amount(a) == amount(b) && sign(a) == sign(b)
}

public(package) fun gt(a: &SignedU64, b: &SignedU64): bool {
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

public(package) fun gte(a: &SignedU64, b: &SignedU64): bool {
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

public(package) fun lt(a: &SignedU64, b: &SignedU64): bool {
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

public(package) fun lte(a: &SignedU64, b: &SignedU64): bool {
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