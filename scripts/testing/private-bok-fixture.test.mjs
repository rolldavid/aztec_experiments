import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceJson} from './private-bok-fixture.mjs';

test('fixture evidence crosses strict worker JSON boundary without losing token precision or cleanup', () => {
  const amount = (1n << 128n) - 1n;
  const observation = {passed: true, l1: [{gasUsed: 542500n, fee: 781346525452500n}],
    experiment: {states: [{available: amount, reserved: 0n}], withdrawals: [{amount}]}};
  assert.throws(() => JSON.stringify({node: {scenario: observation}}), TypeError);
  observation.walletStopped = true;
  observation.clientMining = {stopped: true};
  const result = JSON.parse(evidenceJson(observation));
  const worker = JSON.parse(JSON.stringify({passed: true, node: {scenario: result, nodeStopped: true}, singletonsStopped: true}));
  assert.equal(worker.node.scenario.experiment.withdrawals[0].amount, amount.toString());
  assert.equal(worker.node.scenario.experiment.states[0].reserved, '0');
  assert.equal(worker.node.scenario.l1[0].fee, '781346525452500');
  assert.equal(worker.node.scenario.walletStopped, true);
  assert.equal(worker.node.scenario.clientMining.stopped, true);
  assert.equal(worker.node.nodeStopped, true);
  assert.equal(worker.singletonsStopped, true);
});

test('evidence encoding preserves failure and rejects unserializable observations', () => {
  const failed = {passed: false, cleanupFailure: {errorClass: 'Error'}, accounting: {reserved: 9007199254740993n}};
  assert.deepEqual(JSON.parse(evidenceJson(failed)), {
    passed: false, cleanupFailure: {errorClass: 'Error'}, accounting: {reserved: '9007199254740993'},
  });
  const cycle = {}; cycle.self = cycle;
  assert.throws(() => evidenceJson(cycle), TypeError);
});
