// TEST ONLY. The parent fixture owns chain, mining, proof policy and transactions.
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir} from 'node:fs/promises';

function publicFunding(record, amount, payer) {
  assert(record && typeof record === 'object', 'Public fee funding evidence required');
  const result = {};
  for (const flag of ['passed', 'realL1Deposit', 'independentL1Sender', 'testFaucetFunding',
    'productionFundingHelper', 'productionRecoveryHelper', 'publicRecoveryPersistedBeforeDeposit']) {
    assert(record[flag] === true, `Missing successful public funding flag: ${flag}`);
    result[flag] = record[flag];
  }
  assert(record.privateSecretsStored === false && record.depositSends === 1, 'Invalid funding secret/send evidence');
  assert(typeof record.amount === 'string' && /^[1-9][0-9]*$/.test(record.amount)
    && BigInt(record.amount) === amount, 'Funding amount evidence mismatch');
  assert(typeof record.l1TxHash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(record.l1TxHash), 'Invalid L1 funding hash');
  assert(typeof record.recipient === 'string' && /^0x[0-9a-fA-F]{64}$/.test(record.recipient)
    && record.recipient === payer, 'Funding recipient must be the shared FPC');
  return Object.assign(result, {amount: record.amount, l1TxHash: record.l1TxHash, recipient: record.recipient,
    depositSends: record.depositSends, privateSecretsStored: record.privateSecretsStored});
}

function publicStandalone(record, payer) {
  assert(record.passed === true && record.canonicalCheckpoint === true && record.executionResult === 'success'
    && record.nodeValidation === 'valid', 'Canonical standalone funding evidence required');
  assert(typeof record.applicationProof === 'boolean' && record.networkProof === false, 'Explicit standalone proof mode required');
  assert(typeof record.txHash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(record.txHash), 'Invalid standalone transaction hash');
  assert(['checkpointed', 'proven', 'finalized'].includes(record.status), 'Standalone receipt must be included');
  assert(record.payer === payer, 'Standalone payer must be the shared FPC');
  assert(typeof record.transactionFee === 'string' && /^[1-9][0-9]*$/.test(record.transactionFee), 'Standalone actual fee required');
  // Never copy future helper keys.
  return {passed: true, txHash: record.txHash, status: record.status, transactionFee: record.transactionFee,
    payer: record.payer, applicationProof: record.applicationProof, networkProof: false,
    proofMode: record.applicationProof ? 'real' : 'proofs-disabled', canonicalCheckpoint: true};
}

export async function preparePrivateBokFees(ctx) {
  const {prepareW01PrivateFees} = await import('../w01-private-fee-flow.mjs');
  return createPrivateBokFeesPreparer({prepareFees: prepareW01PrivateFees, mkdir})(ctx);
}

// Explicit dependency seam for pure tests; production always uses W01 above.
export function createPrivateBokFeesPreparer({prepareFees, mkdir: makeDirectory}) {
  return async function prepare(ctx) {
    const {node, preparation, l1Client, directory, rpcUrl, mineL1, mark} = ctx;
    assert(path.isAbsolute(directory), 'Fee fixture directory must be absolute');
    // operatorFunding concerns product fee issuance. The disposable L1 user still
    // receives local ETH/token faucet funding, explicitly retained below.
    const observation = {passed: false, ownerless: true, operatorFunding: false, testFaucetFunding: true,
      humanPublicFeeFallback: false, privateCreditAndPoolReconciled: false, walletCleanupComplete: false, funding: {}};
    const helpers = [];
    let closePromise;
    const close = () => {
      if (!closePromise) closePromise = (async () => {
        const results = await Promise.allSettled(helpers.map(helper => Promise.resolve().then(() => helper.close())));
        observation.walletCleanupComplete = results.every(result => result.status === 'fulfilled');
        if (!observation.walletCleanupComplete) {
          observation.passed = false;
          throw new AggregateError(results.filter(result => result.status === 'rejected').map(result => result.reason),
            'Private Bok fee wallet cleanup failed');
        }
      })();
      return closePromise;
    };
    try {
      // Both bridges precede A's cold claim; B's standalone claim starts from the
      // same public pool baseline as A. Distinct journals must never be reused.
      for (const [role, standalone] of [['owner', false], ['otherUser', true]]) {
        const fundingDirectory = path.join(directory, `private-bok-fees-${role}`);
        await makeDirectory(fundingDirectory, {mode: 0o700});
        const helper = await prepareFees({node, preparation, l1Client, directory, fundingDirectory,
          rpcUrl, mineL1, reportStage: mark, standalone});
        helpers.push(helper);
        // Persist only validated public receipt fields as soon as each helper
        // returns, so a later setup failure cannot erase completed funding.
        const payer = helper.browserFixture.instance.address.toString();
        observation.funding[role] = publicFunding(helper.funding, helper.browserFixture.fundedAmount, payer);
        if (standalone) observation.standaloneB = publicStandalone(helper.standalone, payer);
      }
      const [a, b] = helpers, wallet = a.browserFixture.wallet;
      const owner = a.authorAccount.address, otherUser = b.authorAccount.address, operator = preparation.account.address;
      assert(!owner.equals(otherUser) && !owner.equals(operator) && !otherUser.equals(operator), 'Fee roles must be distinct');
      assert(a.browserFixture.instance.address.equals(b.browserFixture.instance.address), 'Private fee pool mismatch');
      const ownerFunding = a.browserFixture.fundedAmount, otherFunding = b.browserFixture.fundedAmount;
      assert(typeof ownerFunding === 'bigint' && ownerFunding > 0n && typeof otherFunding === 'bigint' && otherFunding > 0n);
      assert.equal(b.standalone?.passed, true, 'Other user standalone funding must pass');
      assert.match(b.standalone.transactionFee, /^[1-9][0-9]*$/, 'Standalone actual fee required');
      const standaloneFee = BigInt(b.standalone.transactionFee);
      assert(standaloneFee <= otherFunding, 'Standalone fee exceeds funding');
      // Trusted fixture memory only: never expose either account record in evidence.
      await wallet.createSchnorrInitializerlessAccount(b.authorAccount.secret, b.authorAccount.salt,
        b.authorAccount.signingKey, 'private-bok-other-user');
      const requireOpen = () => assert(!closePromise, 'Private Bok fee wallets are closed');
      const bindPayment = (helper, address) => async args => {
        requireOpen();
        assert(args.wallet === wallet && address.equals(args.owner), 'Private fee actor or wallet mismatch');
        // W01 consumes its first-claim marker only after successful estimation.
        // Once preparation succeeds, a later proving/send failure aborts the run;
        // callers must not retry or reuse this callback to replay a paid action.
        return helper.privateFeeAction(args);
      };
      const ownerPayment = bindPayment(a, owner), otherPayment = bindPayment(b, otherUser);
      const paymentFor = actor => {
        requireOpen();
        if (owner.equals(actor)) return {role: 'owner', payerMode: 'private', privateFeeAction: ownerPayment};
        if (otherUser.equals(actor)) return {role: 'otherUser', payerMode: 'private', privateFeeAction: otherPayment};
        if (operator.equals(actor)) return {role: 'operator', payerMode: 'genesis'};
        throw new Error('Unknown private Bok fee actor');
      };
      const verify = async feeTotals => {
        requireOpen(); observation.passed = false; observation.privateCreditAndPoolReconciled = false;
        assert(feeTotals && Object.getPrototypeOf(feeTotals) === Object.prototype, 'Exact fee totals object required');
        assert.deepEqual(Reflect.ownKeys(feeTotals).sort(), ['otherUser', 'owner'], 'Exactly two human fee totals required');
        const {owner: ownerFees, otherUser: otherFees} = feeTotals;
        assert(typeof ownerFees === 'bigint' && ownerFees >= 0n && typeof otherFees === 'bigint' && otherFees >= 0n,
          'Actual canonical fee totals must be nonnegative bigint values');
        const ownerRemaining = ownerFunding - ownerFees, otherRemaining = otherFunding - otherFees - standaloneFee;
        assert(ownerRemaining >= 0n && otherRemaining >= 0n, 'Actual fees exceed private funding');
        // Each W01 verifier checks actual private balance, zero human public
        // FeeJuice, and the public FPC pool. B's standalone fee is counted once.
        await a.verify(ownerFees, otherRemaining);
        await b.verify(otherFees, ownerRemaining);
        assert.equal(a.poolBefore, b.poolBefore, 'Fee pool baselines differ');
        Object.assign(observation, {passed: true, privateCreditAndPoolReconciled: true,
          humanPublicBalancesZero: true, amounts: {
            ownerFunding: String(ownerFunding), otherUserFunding: String(otherFunding),
            ownerActualFees: String(ownerFees), otherUserActualFees: String(otherFees),
            otherUserStandaloneFee: String(standaloneFee), ownerPrivateBalance: String(ownerRemaining),
            otherUserPrivateBalance: String(otherRemaining), poolBefore: a.poolBefore,
            poolAfter: String(BigInt(a.poolBefore) + ownerRemaining + otherRemaining),
          }});
      };
      return Object.defineProperties(observation, {wallet: {value: wallet}, owner: {value: owner},
        operator: {value: operator}, otherUser: {value: otherUser}, paymentFor: {value: paymentFor},
        verify: {value: verify}, close: {value: close}});
    } catch (error) {
      let failure = error instanceof Error ? error : new Error('Private Bok fee setup failed');
      try { await close(); } catch (cleanupError) {
        failure = new AggregateError([failure, cleanupError], 'Private Bok fee setup and cleanup failed');
      }
      failure.privateBokFeesObservation = observation;
      throw failure;
    }
  };
}
