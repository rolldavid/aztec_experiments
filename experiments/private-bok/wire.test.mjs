import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeV1, assertRequest, FIELD_MODULUS} from './wire.mjs';

test('portal V1 preserves domain padding, word order and commitment position', () => {
  const bytes = encodeV1('PLUGIN_CREDIT_V1', [1n, 2n, 3n, 4n, 5n, 6n]);
  assert.equal(bytes.length, 224);
  assert.equal(bytes.subarray(0, 32).toString('hex'), Buffer.from('PLUGIN_CREDIT_V1').toString('hex').padEnd(64, '0'));
  for (let i = 1; i <= 6; i++) assert.equal(bytes.subarray(i * 32, (i + 1) * 32).toString('hex'), BigInt(i).toString(16).padStart(64, '0'));
  assert.equal(bytes.subarray(160, 192).at(-1), 5); // New semantics, old account byte position.
});

test('exit destination, amount, nonce and domain each change the bound bytes', () => {
  const fields = [1n, 2n, 3n, 4n, 5n, 6n, 7n];
  const original = encodeV1('PLUGIN_EXIT_V1', fields);
  for (let i = 0; i < fields.length; i++) {
    const changed = [...fields]; changed[i] += 1n;
    assert.notDeepEqual(encodeV1('PLUGIN_EXIT_V1', changed), original);
  }
  assert.equal(original.length, 256);
});

test('reject ambiguous portal domains, arity and out-of-field values', () => {
  assert.throws(() => encodeV1('PLUGIN_EXIT_V2', []));
  assert.throws(() => encodeV1('PLUGIN_READY_V1', [1n, 2n, 3n]));
  for (const value of [-1n, FIELD_MODULUS, 1, '1']) assert.throws(() => encodeV1('PLUGIN_READY_V1', [value, 2n, 3n, 4n]));
});

test('fenced liabilities remain conserved and exact flags are required', () => {
  const fenced = {state: 3n, budget: 600n, available: 0n, reserved: 400n, charged: 0n, refunded: 200n, primary_done: true, secondary_done: false};
  assertRequest(fenced, {state: 3n, primary_done: true, secondary_done: false});
  assert.throws(() => assertRequest({...fenced, reserved: 0n}, {}));
  assert.throws(() => assertRequest(fenced, {secondary_done: true}));
  assert.throws(() => assertRequest({...fenced, available: -1n, refunded: 201n}, {}));
});
