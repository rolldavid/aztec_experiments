// Labelled pure fakes: these tests prove orchestration, not funding or privacy acceptance.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createPrivateBokFeesPreparer} from './private-bok-fees.mjs';

const address = id => ({id, equals: other => other?.id === id});
function fixture({failSetup, failRegister = false, failClose = [], badBaseline = false} = {}) {
  const calls = [], directories = [], registrations = [], closed = [0, 0], verified = [], paid = [];
  const owner = address('human-A'), otherUser = address('human-B'), operator = address('operator');
  const wallet = {createSchnorrInitializerlessAccount: async (...args) => {
    registrations.push(args); if (failRegister) throw Error('registration failure');
  }};
  const helpers = [owner, otherUser].map((account, index) => ({
    authorAccount: {address: account, secret: `fake-secret-${index}`, salt: `fake-salt-${index}`, signingKey: `fake-key-${index}`},
    browserFixture: {wallet: index ? {} : wallet, instance: {address: address('FPC')}, fundedAmount: index ? 200n : 100n},
    ...(index ? {standalone: {passed: true, transactionFee: '7'}} : {}),
    privateFeeAction: async args => {paid.push({index, args}); return `payment-${index}`;},
    verify: async (fees, netOther) => {
      verified.push({index, fees, netOther});
      helpers[index].poolBefore = badBaseline && index ? '51' : '50';
    },
    close: async () => {closed[index]++; if (failClose.includes(index)) throw Error(`close failure ${index}`);},
  }));
  const prepare = createPrivateBokFeesPreparer({
    mkdir: async (...args) => directories.push(args),
    prepareFees: async options => {
      const index = calls.length; calls.push(options);
      if (failSetup === index) throw Error('setup failure');
      return helpers[index];
    },
  });
  const ctx = {node: {}, preparation: {account: {address: operator}}, l1Client: {}, directory: '/fake-disposable',
    rpcUrl: 'fake://no-network', mineL1: () => {}, mark: () => {}};
  return {prepare: () => prepare(ctx), calls, directories, registrations, closed, verified, paid, helpers,
    owner, otherUser, operator, wallet, ctx};
}

test('pure fake: two isolated journals, cold owner, standalone other user, trusted registration', async () => {
  const f = fixture(), result = await f.prepare();
  assert.deepEqual(f.calls.map(call => call.standalone), [false, true]);
  assert.deepEqual(f.directories, [['/fake-disposable/private-bok-fees-owner', {mode: 0o700}],
    ['/fake-disposable/private-bok-fees-otherUser', {mode: 0o700}]]);
  assert(f.calls.every(call => call.reportStage === f.ctx.mark && call.directory === f.ctx.directory));
  assert.deepEqual(f.registrations, [['fake-secret-1', 'fake-salt-1', 'fake-key-1', 'private-bok-other-user']]);
  assert.equal(result.wallet, f.wallet);
  for (const key of ['wallet', 'owner', 'otherUser', 'operator', 'paymentFor', 'verify', 'close']) {
    assert.equal(Object.getOwnPropertyDescriptor(result, key).enumerable, false);
  }
  assert(!/human-A|human-B|fake-secret|fake-key/.test(JSON.stringify(result)));
  await result.close();
});

test('pure fake: exact actor binding, no human genesis fallback or unknown actor', async () => {
  const f = fixture(), result = await f.prepare();
  for (const [actor, role, expected] of [[f.owner, 'owner', 'payment-0'], [f.otherUser, 'otherUser', 'payment-1']]) {
    const payment = result.paymentFor(address(actor.id));
    assert.equal(payment.role, role); assert.equal(payment.payerMode, 'private');
    assert.equal(await payment.privateFeeAction({wallet: f.wallet, owner: actor, interaction: {}}), expected);
    await assert.rejects(payment.privateFeeAction({wallet: f.wallet, owner: f.operator}), /actor or wallet mismatch/);
    await assert.rejects(payment.privateFeeAction({wallet: {}, owner: actor}), /actor or wallet mismatch/);
  }
  assert.deepEqual(result.paymentFor(f.operator), {role: 'operator', payerMode: 'genesis'});
  assert.throws(() => result.paymentFor(address('unknown')), /Unknown/);
  assert.equal(f.paid.length, 2);
  await result.close();
  assert.throws(() => result.paymentFor(f.owner), /closed/);
});

test('pure fake: exact two-owner conservation counts standalone fee once', async () => {
  const f = fixture(), result = await f.prepare();
  await result.verify({owner: 11n, otherUser: 13n});
  assert.deepEqual(f.verified, [{index: 0, fees: 11n, netOther: 180n}, {index: 1, fees: 13n, netOther: 89n}]);
  assert.equal(result.passed, true);
  assert.deepEqual(result.amounts, {ownerFunding: '100', otherUserFunding: '200', ownerActualFees: '11',
    otherUserActualFees: '13', otherUserStandaloneFee: '7', ownerPrivateBalance: '89',
    otherUserPrivateBalance: '180', poolBefore: '50', poolAfter: '319'});
  assert(!/human-A|human-B|fake-secret|fake-key/.test(JSON.stringify(result)));
  await result.close();
});

test('pure fake: invalid or overdrawn totals fail before verification', async () => {
  const f = fixture(), result = await f.prepare();
  for (const totals of [null, {}, {owner: 1n}, {owner: 1n, otherUser: 1n, operator: 1n},
    {owner: 1, otherUser: 1n}, {owner: -1n, otherUser: 1n}, {owner: 101n, otherUser: 0n},
    {owner: 0n, otherUser: 194n}]) await assert.rejects(result.verify(totals));
  assert.equal(f.verified.length, 0); assert.equal(result.passed, false);
  await result.close();
});

test('pure fake: mismatched shared pool baseline fails', async () => {
  const f = fixture({badBaseline: true}), result = await f.prepare();
  await assert.rejects(result.verify({owner: 1n, otherUser: 1n}), /baselines differ/);
  assert.equal(result.passed, false); await result.close();
});

test('pure fake: partial setup and registration failures close created helpers', async () => {
  for (const [options, expected] of [[{failSetup: 0}, [0, 0]], [{failSetup: 1}, [1, 0]],
    [{failRegister: true}, [1, 1]], [{failRegister: true, failClose: [0]}, [1, 1]]]) {
    const f = fixture(options); await assert.rejects(f.prepare()); assert.deepEqual(f.closed, expected);
  }
});

test('pure fake: cleanup attempts both once, preserves failure, never silently retries', async () => {
  const f = fixture({failClose: [0]}), result = await f.prepare();
  const first = result.close(), second = result.close(); assert.equal(first, second);
  await assert.rejects(first, /cleanup failed/); await assert.rejects(second, /cleanup failed/);
  assert.deepEqual(f.closed, [1, 1]); assert.equal(result.walletCleanupComplete, false);
  await assert.rejects(result.verify({owner: 0n, otherUser: 0n}), /closed/);
});

test('pure fake: payment rejection propagates once without another actor or fallback', async () => {
  const f = fixture(); let attempts = 0;
  f.helpers[0].privateFeeAction = async () => {attempts++; throw Error('specific contract rejection');};
  const result = await f.prepare(), payment = result.paymentFor(f.owner);
  await assert.rejects(payment.privateFeeAction({wallet: f.wallet, owner: f.owner, interaction: {}}),
    /specific contract rejection/);
  assert.equal(attempts, 1); assert.deepEqual(f.paid, []);
  await result.close(); await result.close();
  assert.deepEqual(f.closed, [1, 1]); assert.equal(result.walletCleanupComplete, true);
});

test('pure fake: real-verifier failure cannot produce a passing observation', async () => {
  const f = fixture(), result = await f.prepare();
  f.helpers[1].verify = async () => {throw Error('private balance mismatch');};
  await assert.rejects(result.verify({owner: 1n, otherUser: 1n}), /private balance mismatch/);
  assert.equal(result.passed, false); assert.equal(result.privateCreditAndPoolReconciled, false);
  await result.close();
});
