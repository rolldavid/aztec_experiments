// TEST ONLY. The parent fixture owns chain, mining, proof policy and transactions.
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir} from 'node:fs/promises';

export async function preparePrivateBokFees(ctx) {
  const {prepareW01PrivateFees} = await import('../w01-private-fee-flow.mjs');
  return createPrivateBokFeesPreparer({prepareFees: prepareW01PrivateFees, mkdir})(ctx);
}

// Explicit dependency seam for pure tests; production always uses W01 above.
export function createPrivateBokFeesPreparer({prepareFees, mkdir: makeDirectory}) {
  return async function prepare(ctx) {
    const {node, preparation, l1Client, directory, rpcUrl, mineL1, mark} = ctx;
    assert(path.isAbsolute(directory), 'Fee fixture directory must be absolute');
    const observation = {passed: false, ownerless: true, operatorFunding: false,
      humanPublicFeeFallback: false, privateCreditAndPoolReconciled: false, walletCleanupComplete: false};
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
        helpers.push(await prepareFees({node, preparation, l1Client, directory, fundingDirectory,
          rpcUrl, mineL1, reportStage: mark, standalone}));
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
      try { await close(); } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Private Bok fee setup and cleanup failed');
      }
      throw error;
    }
  };
}
