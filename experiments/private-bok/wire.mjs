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

// Only fixed categories and source locations leave a failed disposable run.
// SDK SimulationError replaces its JS stack with Noir frames; never serialize
// its raw message, revertData, source text, argument values or contract addresses.
export function failureDiagnostic(error) {
  const message = String(error?.actual?.message ?? error?.message ?? '');
  const categories = ['Request not expirable', 'Request not expired', 'Out of gas', 'Insufficient fee',
    'Could not price the next block at slot', 'Cannot predict the next block',
    'Cannot simulate public calls: world state and archiver disagree',
    'Transaction expired', 'Fee provider not started', 'Contract not found',
    'Contract instance not found', 'Contract class not found'];
  const sourceError = error?.actual?.getNoirCallStack ? error.actual : error;
  const frames = (sourceError?.getNoirCallStack?.() ?? []).slice(0, 8).flatMap(frame => {
    if (!frame || typeof frame !== 'object' || !Number.isInteger(frame.line) || !Number.isInteger(frame.column)) return [];
    const file = String(frame.filePath).split(/[\\/]/).at(-1);
    return /^[a-zA-Z0-9_-]+\.nr$/.test(file) ? [{file, line: frame.line, column: frame.column}] : [];
  });
  const functions = (sourceError?.getCallStack?.() ?? []).slice(0, 8).flatMap(frame => {
    const name = frame?.functionName;
    return typeof name === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(name) ? [name] : [];
  });
  return {category: categories.find(value => message.includes(value)) ?? 'unclassified', frames, functions};
}
