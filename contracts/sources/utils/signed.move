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