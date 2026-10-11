// Labelled development-only observations: no SDK/node/provider calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertReplyAcceptance, assertReplyAccounting} from './reply-acceptance.mjs';
function fixture() {
  const expected = {id: '90', record: {subboard: '0', parent: '20', root: '10', kind: '4', name_id: '0', reference: '0', content_digest: '80'},
    count: '3', timestamp: '100', mainVersion: '2', localVersion: '0', length: '4', message: ['123', '0'],
    pluginId: '7', requestId: '8', parentId: '20', target: '9'};
  const observed = {requestUnchanged: true, exists: true, removed: '0', reason: '0', record: structuredClone(expected.record), count: '3', atOrder: '90', timestamp: '100',
    published: {schema: '1', id: '90', record: structuredClone(expected.record), timestamp: '100', main_policy_version: '2', local_policy_version: '0', length: '4', message: ['123', '0']},
    linked: {schema: '1', plugin_id: '7', request_id: '8', post_id: '90', parent_id: '20', target: '9'},
    requestBeforeReply: {state: '2', available: '280'}, requestAfterReply: {state: '2', available: '280'}};
  return {expected, observed};
}
test('labelled fake: exact public reply and nested thread accepted', () => {
  const {observed, expected} = fixture(); assertReplyAcceptance(observed, expected);
});
for (const field of ['kind', 'name_id', 'root', 'parent', 'subboard', 'reference', 'content_digest']) {
  test(`labelled fake: incorrect canonical ${field} rejected`, () => {
    const {observed, expected} = fixture(); observed.record[field] = '999';
    assert.throws(() => assertReplyAcceptance(observed, expected));
  });
}
for (const field of ['plugin_id', 'request_id', 'post_id', 'parent_id', 'target']) {
  test(`labelled fake: incorrect authenticated linkage ${field} rejected`, () => {
    const {observed, expected} = fixture(); observed.linked[field] = '999';
    assert.throws(() => assertReplyAcceptance(observed, expected));
  });
}
for (const mutate of [o => { o.published.message[1] = '1'; }, o => {o.published.main_policy_version = '1';},
  o => {o.atOrder = '91';}, o => {o.count = '4';}, o => {o.requestAfterReply.available = '0';},
  o => {o.requestUnchanged = false;}, o => {o.removed = '1';}, o => {o.published.record.kind = '1';}]) {
  test('labelled fake: event/content/order/accounting mutation rejected', () => {
    const {observed, expected} = fixture(); mutate(observed); assert.throws(() => assertReplyAcceptance(observed, expected));
  });
}
test('labelled fake: exact terminal accounting and independent completion flags', () => {
  const expected = {target: '9', receipt: '44'}, observed = {state: '4', invocation_hash: '9', sequence: '1', budget: '400',
    available: '0', reserved: '0', charged: '120', refunded: '280', receipt: '44', primary_done: true,
    secondary_done: true, ownerBalance: '880', operatorEarnings: '120'};
  assertReplyAccounting(observed, expected);
  for (const key of Object.keys(observed)) {
    assert.throws(() => assertReplyAccounting({...observed, [key]: typeof observed[key] === 'boolean' ? false : '999'}, expected));
  }
});
