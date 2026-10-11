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
  const empty = () => ({category: 'unclassified', frames: [], functions: []});
  try {
    const message = String(error?.actual?.message ?? error?.message ?? '').slice(0, 8192);
    const categories = ['Request not expirable', 'Request not expired', 'Out of gas', 'Insufficient fee',
      'Could not price the next block at slot', 'Cannot predict the next block',
      'Cannot simulate public calls: world state and archiver disagree',
      'Transaction expired', 'Fee provider not started', 'Contract not found',
      'Contract instance not found', 'Contract class not found'];
    const files = new Set(['main.nr', 'public_mutable.nr', 'public_immutable.nr', 'private_context.nr',
      'public_context.nr', 'map.nr', 'mod.nr', 'utils.nr', 'serialize.nr', 'note_getter.nr']);
    const names = new Set(['request', 'balance_of', 'earned', 'expire', 'reserve', 'settle', 'reconcile',
      'claim', 'authorize_request', 'cancel', 'finish', 'withdraw', 'withdraw_earnings', 'subtract_more',
      '_open_escrow', '_cancel', 'on_invocation', 'invoke', 'target_hash', 'entrypoint']);
    const sourceError = error?.actual?.getNoirCallStack ? error.actual : error;
    const rawFrames = sourceError?.getNoirCallStack?.() ?? [];
    const rawFunctions = sourceError?.getCallStack?.() ?? [];
    if (!Array.isArray(rawFrames) || !Array.isArray(rawFunctions)) return empty();
    const coordinate = value => Number.isInteger(value) && value > 0 && value <= 1000000;
    const frames = rawFrames.slice(0, 8).flatMap(frame => {
      if (!frame || typeof frame !== 'object' || !coordinate(frame.line) || !coordinate(frame.column)) return [];
      const file = typeof frame.filePath === 'string' ? frame.filePath.split(/[\\/]/).at(-1) : '';
      return files.has(file) ? [{file, line: frame.line, column: frame.column}] : [];
    });
    const functions = rawFunctions.slice(0, 8).flatMap(frame => names.has(frame?.functionName) ? [frame.functionName] : []);
    return {category: categories.find(value => message.includes(value)) ?? 'unclassified', frames, functions};
  } catch {
    // Diagnostics must never replace the original failure, even if an SDK
    // accessor fails while attempting to resolve source locations.
    return empty();
  }
}
