// These foreign calls execute only in the local unconstrained simulator. The
// host uses native WebCrypto; no cipher arithmetic enters a private proof.
#[oracle(rolling_owner_locator_v1)]
pub unconstrained fn locator(secret: Field, domain: [Field; 4], sequence: u64, role: u32) -> Field {}

#[oracle(rolling_owner_seal_v1)]
unconstrained fn seal_oracle(
    secret: Field, domain: [Field; 4], sequence: u64, role: u32,
    plaintext: [Field; 12], plaintext_len: u32,
) -> ([Field; 15], u32) {}

#[oracle(rolling_owner_open_v1)]
unconstrained fn open_oracle(
    secret: Field, domain: [Field; 4], sequence: u64, role: u32,
    ciphertext: [Field; 15], ciphertext_len: u32,
) -> (bool, [Field; 12], u32) {}

pub unconstrained fn seal(
    secret: Field, domain: [Field; 4], sequence: u64, role: u32,
    plaintext: BoundedVec<Field, 12>,
) -> BoundedVec<Field, 15> {
    let (fields, length) = seal_oracle(secret, domain, sequence, role, plaintext.storage(), plaintext.len());
    assert(length <= 15, "Invalid owner envelope length");
    BoundedVec::from_parts(fields, length)
}

pub unconstrained fn open(
    secret: Field, domain: [Field; 4], sequence: u64, role: u32,
    ciphertext: BoundedVec<Field, 15>,
) -> Option<BoundedVec<Field, 12>> {
    let (valid, fields, length) = open_oracle(secret, domain, sequence, role, ciphertext.storage(), ciphertext.len());
    if valid & length <= 12 { Option::some(BoundedVec::from_parts(fields, length)) } else { Option::none() }
}
