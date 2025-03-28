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