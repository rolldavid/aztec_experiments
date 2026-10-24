mod oracle;
use aztec::macros::aztec;

#[aztec]
pub contract OwnerEnvelopeFixture {
    use aztec::macros::functions::external;
    use crate::oracle as envelope;

    #[external("utility")]
    unconstrained fn envelope_roundtrip(secret: Field, domain: [Field; 4]) -> bool {
        let plaintext = BoundedVec::from_array([17, 23, 42]);
        let ciphertext = envelope::seal(secret, domain, 0, 1, plaintext);
        let restored = envelope::open(secret, domain, 0, 1, ciphertext).unwrap();
        assert_eq(restored, plaintext);
        assert(envelope::open(secret, domain, 0, 2, ciphertext).is_none());
        let second = envelope::seal(secret, domain, 0, 1, plaintext);
        assert(ciphertext != second, "Each attempted write needs a fresh nonce");
        assert_eq(envelope::locator(secret, domain, 0, 1), envelope::locator(secret, domain, 0, 1));
        assert(envelope::locator(secret, domain, 0, 1) != envelope::locator(secret, domain, 1, 1));
        true
    }
}
