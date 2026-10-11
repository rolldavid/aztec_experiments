import assert from 'node:assert/strict';

export const FIELD_MODULUS = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n;
const WORDS = Object.freeze({PLUGIN_READY_V1: 4, PLUGIN_CREDIT_V1: 6, PLUGIN_EXIT_V1: 7});

// Exact legacy portal word layout. The CREDIT account word is now a commitment.
export function encodeV1(domain, fields) {
  assert(Object.hasOwn(WORDS, domain), 'Unknown portal domain');
  assert.equal(fields.length, WORDS[domain], 'Wrong portal field count');
  const result = Buffer.alloc(32 * (fields.length + 1));
  result.write(domain, 'ascii');
  fields.forEach((field, index) => {
    assert(typeof field === 'bigint' && field >= 0n && field < FIELD_MODULUS, 'Noncanonical field');
    Buffer.from(field.toString(16).padStart(64, '0'), 'hex').copy(result, 32 * (index + 1));
  });
  return result;
}

export function assertRequest(actual, expected) {
  for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], value, `Request ${key}`);
  for (const key of ['budget', 'available', 'reserved', 'charged', 'refunded']) {
    assert(typeof actual[key] === 'bigint' && actual[key] >= 0n && actual[key] < 2n ** 128n, `Invalid ${key}`);
  }
  assert.equal(actual.available + actual.reserved + actual.charged + actual.refunded, actual.budget, 'Credit conservation');
}

export const json = value => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item, 2) + '\n';
