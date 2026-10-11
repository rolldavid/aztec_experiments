// TEST ONLY consumer. Parent owns the real portal claims, accounts, chain,
// eligibility, proof policy, service deadlines and cleanup. Never retries sends.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {Contract} from '@aztec-labs/aztec.js/contracts';
import {getFeeJuiceBalance} from '@aztec-labs/aztec.js/utils';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {poseidon2HashWithSeparator} from '@aztec-labs/foundation/crypto/poseidon';
import {sha256ToField} from '@aztec-labs/foundation/crypto/sha256';
import {loadContractArtifact, decodeFromAbi, decodeFunctionSignature, EventSelector} from '@aztec-labs/stdlib/abi';
import {getContractClassFromArtifact} from '@aztec-labs/stdlib/contract';
import {computeLogTag} from '@aztec-labs/stdlib/hash';
import {Gas, GasSettings} from '@aztec-labs/stdlib/gas';
import {NoteStatus} from '@aztec-labs/stdlib/note';
import {TxStatus, TxExecutionResult, TxHash, mergeExecutionPayloads} from '@aztec-labs/stdlib/tx';
import {DomainSeparator, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH,
  MAX_PUBLIC_LOG_SIZE_IN_FIELDS, MAX_TX_BLOB_DATA_SIZE_IN_FIELDS} from '@aztec-labs/constants';
import {ROOT, assertNodeVersion, assertAztecPackages} from '../../scripts/toolchain.mjs';
import {checkNoirEmbeddedSources} from '../../scripts/check-noir-dependencies.mjs';
import {proveApplicationAction, measureApplicationGas} from '../../scripts/prove-application-action.mjs';
import {applicationProofsEnabled} from '../../scripts/testing/proof-policy.mjs';
import {classifyT03PublicFootprint} from '../../scripts/t03-public-footprint.mjs';
import {derivePrivateFeeInstance, requirePublishedPrivateFee} from '../../shared/private-fee-client.mjs';
import {PrivateFeePaymentMethod} from '../../shared/private-fee-payment.mjs';
import {encodeConfigCommitment} from '../../shared/protocol-commitments.mjs';
import {nameRegistration, NAME_DOMAIN} from '../../shared/rolling/name-policy.mjs';
import {invocationPreimage, invocationHash} from '../../shared/rolling/invocation.mjs';
import {createRollingNoteMembership} from '../../scripts/testing/rolling-note-membership.mjs';
import {assertMinedCallbackRollback} from './callback-rollback.mjs';
import {assertReplyAcceptance, assertReplyAccounting} from './reply-acceptance.mjs';

const n = value => typeof value === 'bigint' ? value : typeof value === 'number' ? BigInt(value)
  : value.toBigInt?.() ?? value.toField().toBigInt();
const json = value => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? String(item) : item, 2) + '\n';
const sha = value => createHash('sha256').update(value).digest('hex');
const equalPrivate = (left, right, message) => assert(isDeepStrictEqual(left, right), message);
const accepted = [TxStatus.CHECKPOINTED, TxStatus.PROVEN, TxStatus.FINALIZED];
const fresh = () => { let result; do { result = Fr.random(); } while (result.isZero()); return result; };

/**
 * board/bok: actual SDK Contract.at instances for this wallet.
 * privateFee: preparePrivateBokFees result; no new wallet lifetime here.
 * claimedDeposit: {depositId, logicalFields:[10], txHash, evidenceRef, economics}.
 * economics: exact encodeConfigCommitment six decimal-string fields.
 * initialHumanFees: actual canonical owner/otherUser fees since fee-helper setup,
 * excluding B's standalone fee. Includes preceding board/Bok claim fees.
 * Fresh isolated board/name namespace, pristine eligible claimed deposit, and
 * actual 1000 private Bok credits are required. No synthetic funding accepted.
 */
export async function runRollingBokJourney({node, wallet, owner, operator, board, bok, privateFee,
  claimedDeposit, pluginId, initialHumanFees, outputDirectory, mineL1, finalizeReverted, mark = () => {}, harnessFiles = []}) {
  assertNodeVersion(); assertAztecPackages();
  assert(path.isAbsolute(outputDirectory)); assert.equal(typeof mineL1, 'function'); assert.equal(typeof finalizeReverted, 'function');
  assert(wallet === privateFee.wallet && owner.equals(privateFee.owner) && operator.equals(privateFee.operator));
  assert.equal(privateFee.paymentFor(owner).payerMode, 'private');
  assert(n(pluginId) > 0n); assert.equal(board.artifact.name, 'RollingBoard'); assert.equal(bok.artifact.name, 'PrivateBok');
  assert.deepEqual(Object.keys(initialHumanFees).sort(), ['otherUser', 'owner']);
  assert(Object.values(initialHumanFees).every(value => typeof value === 'bigint' && value >= 0n));
  const humanFees = {...initialHumanFees};
  const feeSummary = () => Object.fromEntries(Object.entries(humanFees).map(([role, amount]) => [role, String(amount)]));
  const observedPublic = [];
  const report = {schema: 1, passed: false, applicationProofs: applicationProofsEnabled(), networkProofs: false,
    proofMode: applicationProofsEnabled() ? 'real' : 'proofs-disabled', payerMode: 'private',
    stage: 'preflight', transactions: [], humanActualFees: feeSummary(), privacyAcceptance: false,
    limits: 'Local real-portal journey; exact public-field smoke checks do not establish anonymity. Network proof, specialist review and production qualification remain open.'};
  await fs.mkdir(outputDirectory, {recursive: true, mode: 0o700});
  // Refuse an existing run before preparing any new signed/paid operation.
  const lease = await fs.open(path.join(outputDirectory, 'journey-intent.json'), 'wx', 0o600);
  try { await lease.writeFile(json({scope: 'rolling-bok-journey', createdAt: new Date().toISOString()})); await lease.sync(); }
  finally { await lease.close(); }
  let noteMembership;
  const save = async () => {
    if (noteMembership) {await noteMembership.flush(); report.noteMembership = noteMembership.snapshot();}
    return fs.writeFile(path.join(outputDirectory, 'journey.json'), json(report), {mode: 0o600});
  };
  const stage = async label => { report.stage = label; await mark('rolling-bok:' + label); await save(); };
  const sourcePaths = [...new Set(['billboard/rolling_contract/journey.mjs', 'billboard/rolling_contract/reply-acceptance.mjs', 'billboard/rolling_contract/callback-rollback.mjs',
    'billboard/rolling_contract/src/main.nr', 'billboard/rolling_contract/src/posting.nr', 'billboard/rolling_contract/src/admission.nr',
    'billboard/rolling_contract/src/encoding.nr', 'experiments/private-bok/escrow/src/main.nr',
    'scripts/testing/private-bok-fees.mjs', 'scripts/w01-private-fee-flow.mjs', 'scripts/prove-application-action.mjs',
    'scripts/testing/reverted-finality.mjs', 'scripts/testing/rolling-note-membership.mjs', 'scripts/testing/proof-policy.mjs', 'scripts/t03-public-footprint.mjs', 'shared/private-fee-payment.mjs',
    'shared/private-fee-estimation.mjs', 'shared/rolling/name-policy.mjs', 'shared/rolling/invocation.mjs', ...harnessFiles])];
  const sourceHashes = async () => Object.fromEntries(await Promise.all(sourcePaths.map(async relative => {
    const resolved = path.resolve(ROOT, relative);
    assert(!path.isAbsolute(relative) && resolved.startsWith(ROOT + path.sep), 'Evidence path escapes repository');
    return [relative, sha(await fs.readFile(resolved))];
  })));
  const query = async (contract, method, ...args) => (await contract.methods[method](...args).simulate({from: owner})).result;
  const depositId = claimedDeposit.depositId, before = claimedDeposit.logicalFields.map(n);
  const artifactHashes = {};
  try {
    const info = await node.getNodeInfo();
    assert.equal(Number(info.l1ChainId), 31337, 'Disposable local chain only');
    assert.equal((await node.getConfig()).realProofs, report.applicationProofs);
    report.sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: ROOT, encoding: 'utf8'}).trim();
    report.sourceHashes = await sourceHashes();
    report.environment = {node: process.version, chainId: Number(info.l1ChainId), rollupVersion: Number(info.rollupVersion)};
    for (const [contract, relative, localPrefix] of [[board, 'billboard/target/rolling_contract-RollingBoard.json', 'billboard/rolling_contract/src/'],
      [bok, 'experiments/private-bok/target/private_bok-PrivateBok.json', 'experiments/private-bok/escrow/src/']]) {
      const bytes = await fs.readFile(path.join(ROOT, relative)), raw = JSON.parse(bytes);
      assert.equal(raw.transpiled, true); checkNoirEmbeddedSources(raw);
      const privateFunctions = raw.functions.filter(fn => fn.custom_attributes?.includes('abi_private'));
      assert(privateFunctions.length > 0 && privateFunctions.every(fn => fn.verification_key), 'Normal processed private VKs required');
      const expected = await getContractClassFromArtifact(loadContractArtifact(raw));
      assert((await getContractClassFromArtifact(contract.artifact)).id.equals(expected.id));
      assert((await node.getContract(contract.address)).currentContractClassId.equals(expected.id));
      let localCount = 0;
      for (const entry of Object.values(raw.file_map)) {
        const index = entry.path.indexOf(localPrefix); if (index < 0) continue;
        const local = entry.path.slice(index); assert(!local.includes('..'));
        assert.equal(entry.source, await fs.readFile(path.join(ROOT, local), 'utf8'), 'Stale local artifact source'); localCount++;
      }
      assert(localCount > 0); artifactHashes[relative] = sha(bytes);
    }
    const feePath = 'apps/src/billboard/private_fee_artifact.json', feeBytes = await fs.readFile(path.join(ROOT, feePath));
    artifactHashes[feePath] = sha(feeBytes);
    const feeRaw = JSON.parse(feeBytes), feeInstance = await derivePrivateFeeInstance(feeRaw);
    await requirePublishedPrivateFee(node, feeInstance);
    const feeContract = Contract.at(feeInstance.address, loadContractArtifact(feeRaw), wallet);
    assert.equal(feeInstance.address.toString(), privateFee.funding.owner.recipient);
    report.artifactHashes = artifactHashes;
    const economics = {...claimedDeposit.economics};
    const configHash = sha256ToField([Buffer.from(encodeConfigCommitment({l1ChainId: String(info.l1ChainId),
      rollupAddress: info.l1ContractAddresses.rollupAddress.toString(), rollupVersion: String(info.rollupVersion),
      boardAddress: board.address.toString()}, economics))]);
    assert(n(await query(board, 'get_config_hash')) === n(configHash), 'Economics not bound to deployed board');
    assert(typeof claimedDeposit.evidenceRef === 'string' && claimedDeposit.evidenceRef.length > 0);
    report.claimEvidence = claimedDeposit.evidenceRef; report.configHash = String(configHash);
    const claimHash = typeof claimedDeposit.txHash === 'string' ? TxHash.fromString(claimedDeposit.txHash) : claimedDeposit.txHash;
    const claimReceipt = await node.getTxReceipt(claimHash);
    assert(accepted.includes(claimReceipt.status) && claimReceipt.executionResult === TxExecutionResult.SUCCESS);
    assert((await node.getBlock(claimReceipt.blockNumber)).hash.equals(claimReceipt.blockHash));
    assert(before.length === 10 && before[0] === 1n && before[1] === n(depositId) && before[1] !== 0n);
    assert([4, 5, 6, 7, 8].every(index => before[index] === 0n), 'Pristine claimed deposit required');
    await wallet.pxe.sync();
    equalPrivate((await query(board, 'get_deposit_info', owner, depositId)).map(n), before, 'Canonical claimed deposit differs');
    const exactDeposit = async (fields, txHash) => {
      const notes = (await wallet.pxe.debug.getNotes({contractAddress: board.address, owner, status: NoteStatus.ACTIVE,
        scopes: [owner], storageSlot: board.artifact.storageLayout.deposits.slot})).filter(note => n(note.note.items[1]) === n(depositId));
      assert(notes.length === 1 && notes[0].txHash.equals(txHash), 'Exact claimed deposit provenance required');
      const note = notes[0]; assert(note.owner.equals(owner) && note.contractAddress.equals(board.address));
      equalPrivate(note.note.items.map(n), [fields[0], fields[1], fields[2], fields[3], fields[4], fields[6],
        fields[5] + (fields[7] << 64n) + (fields[8] << 128n), fields[9]], 'Private deposit packing mismatch');
      return note;
    };
    const oldNote = await exactDeposit(before, claimHash);
    assert(n((await wallet.pxe.getSyncedBlockHeader()).globalVariables.timestamp) >= before[9], 'Parent must provide eligible canonical deposit');
    assert(n(await query(bok, 'balance_of', owner)) === 1000n, 'Actual 1000 private Bok credits required');
    assert.equal(await getFeeJuiceBalance(owner, node), 0n);

    function inspect(tx, effect, human, gasUsed) {
      const footprint = classifyT03PublicFootprint({tx, effect, roles: {author: owner, otherAuthor: privateFee.otherUser,
        sharedPayer: feeInstance.address, board: board.address, moderator: operator}});
      for (const category of ['feePayer', 'publicCallSenders', 'publicCallTargets', 'publicCallCalldata',
        'publicWriteSlots', 'publicWriteValues', 'publicLogContracts', 'publicLogFields']) {
        assert(!footprint.rolePresence[category].author && !footprint.rolePresence[category].otherAuthor,
          'Human identity exposed in ' + category);
      }
      if (human) assert(footprint.sharedFeePayer && !footprint.authorIsPublicFeePayer);
      const gas = tx.getGasSettings();
      for (const dimension of ['daGas', 'l2Gas']) {
        assert(gas.gasLimits[dimension] <= info.txsLimits.gas[dimension], 'Declared gas exceeds node limit');
        if (gasUsed) {
          assert(gasUsed.totalGas[dimension] <= gas.gasLimits[dimension], 'Measured gas exceeds declaration');
          assert(gasUsed.teardownGas[dimension] <= gas.teardownGasLimits[dimension], 'Teardown gas exceeds reservation');
        }
      }
      assert(effect.publicDataWrites.length <= MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX);
      assert(effect.publicLogs.reduce((sum, log) => sum + log.sizeInFields(), 0) <= FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH);
      assert(effect.publicLogs.every(log => log.fields.length <= MAX_PUBLIC_LOG_SIZE_IN_FIELDS));
      assert(effect.toBlobFields().length <= MAX_TX_BLOB_DATA_SIZE_IN_FIELDS);
      assert.equal(effect.l2ToL1Msgs.length, 0);
      return footprint;
    }
    async function send(label, interaction, actor) {
      await stage(label); await wallet.pxe.sync();
      const selected = privateFee.paymentFor(actor), started = performance.now();
      const proof = await proveApplicationAction({wallet, owner: actor, interaction, ...selected});
      const {tx} = proof, gas = await measureApplicationGas(node, tx);
      assert.equal((await node.isValidTx(tx)).result, 'valid');
      const row = {label, actorRole: selected.role, payerMode: selected.payerMode, txHash: String(tx.getTxHash()),
        gas, serializedTxBytes: tx.toBuffer().length, prepareMs: Math.round(performance.now() - started), submission: 'outcome unknown'};
      const intent = await fs.open(path.join(outputDirectory, `${label}-intent.json`), 'wx', 0o600);
      try { await intent.writeFile(json({txHash: row.txHash, sourceRevision: report.sourceRevision, artifactHashes})); await intent.sync(); }
      finally { await intent.close(); }
      report.transactions.push(row); await save(); await node.sendTx(tx);
      let receipt; const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        receipt = await node.getTxReceipt(tx.getTxHash());
        if (accepted.includes(receipt.status)) break;
        assert.notEqual(receipt.status, TxStatus.DROPPED); await mineL1();
      }
      assert(receipt && accepted.includes(receipt.status), 'Inclusion unknown; reconcile saved hash before any retry');
      assert(receipt.txHash.equals(tx.getTxHash()));
      assert((await node.getBlock(receipt.blockNumber)).hash.equals(receipt.blockHash));
      const found = await node.getTxEffect(tx.getTxHash()), effect = found?.data;
      assert(effect && effect.txHash.equals(tx.getTxHash()) && found.l2BlockHash.equals(receipt.blockHash)
        && Number(found.l2BlockNumber) === Number(receipt.blockNumber), 'Canonical effect mismatch');
      assert(typeof receipt.transactionFee === 'bigint' && receipt.transactionFee > 0n);
      if (selected.role !== 'operator') {
        humanFees[selected.role] += receipt.transactionFee;
      }
      report.humanActualFees = feeSummary();
      const bytes = effect.toBuffer(); await fs.writeFile(path.join(outputDirectory, `${label}-effect.bin`), bytes, {flag: 'wx', mode: 0o600});
      Object.assign(row, {submission: 'canonical inclusion', executionResult: receipt.executionResult, transactionFee: String(receipt.transactionFee),
        blockNumber: Number(receipt.blockNumber), blockHash: String(receipt.blockHash), effectSha256: sha(bytes)});
      await save(); // Reverted execution or policy failure cannot erase charged fees.
      assert.equal(receipt.executionResult, TxExecutionResult.SUCCESS);
      if (selected.role !== 'operator') assert(BigInt(proof.maximumFee) >= receipt.transactionFee);
      row.publicObservation = {publicWrites: effect.publicDataWrites.length,
        logFields: effect.publicLogs.reduce((sum, log) => sum + log.sizeInFields(), 0),
        blobFields: effect.toBlobFields().length,
        footprint: classifyT03PublicFootprint({tx, effect, roles: {author: owner, otherAuthor: privateFee.otherUser,
          sharedPayer: feeInstance.address, board: board.address, moderator: operator}})};
      await save(); // Preserve bounded public diagnostics before privacy/limit assertions.
      row.footprint = inspect(tx, effect, selected.role !== 'operator', gas);
      observedPublic.push({tx, effect});
      await wallet.pxe.sync(); await save(); return {tx, effect, receipt};
    }

    const name = nameRegistration('Rowan', 'Vale'), nameId = await poseidon2HashWithSeparator(name.preimage, NAME_DOMAIN);
    assert.equal(await query(board, 'name_registered', nameId), false, 'Fresh name namespace required');
    await send('register-name', board.methods.register_name(...name.arguments), owner);
    const names = (await query(board, 'owned_names', owner, 0)).map(n);
    assert(names.filter(id => id === n(nameId)).length === 1 && await query(board, 'name_registered', nameId));
    await send('configure-plugin', board.methods.configure_plugin(pluginId, bok.address, true), operator);
    const plugin = await query(board, 'get_plugin', pluginId);
    assert(plugin.enabled && n(plugin.adapter) === n(bok.address));
    const nonce = fresh(), requestId = fresh(), content = '@Bok build a quiet reading page.';
    const input = {chainId: BigInt(info.l1ChainId), rollupVersion: BigInt(info.rollupVersion), board: n(board.address),
      plugin: n(bok.address), name: n(nameId), nonce: n(nonce), content};
    const preimage = invocationPreimage(input), target = await invocationHash(input);
    const [mainVersion] = await query(board, 'main_policy');
    const draft = {subboard: Fr.ZERO, parent: Fr.ZERO, root_reference: Fr.ZERO, kind: 1, name_id: nameId, reference: Fr.ZERO,
      message: preimage.slice(13).map(value => new Fr(value)), length: Number(preimage[12]),
      expected_main_policy_version: Number(mainVersion), expected_local_policy_version: 0};
    const authorization = await send('authorize-request', bok.methods.authorize_request(requestId, target, 400n), owner);
    const waiting = await query(bok, 'request', requestId);
    assert(n(waiting.state) === 1n && n(waiting.invocation_hash) === n(target) && n(waiting.budget) === 400n
      && n(waiting.available) === 400n && n(waiting.reserved) === 0n && n(waiting.charged) === 0n && n(waiting.refunded) === 0n);
    assert(n(await query(bok, 'balance_of', owner)) === 600n);

    noteMembership = createRollingNoteMembership({node, wallet, owner, contracts: [
      {role: 'board', address: board.address, configSlot: board.artifact.storageLayout.config.slot, portalSlot: board.artifact.storageLayout.portal_address.slot},
      {role: 'FPC', address: feeInstance.address}, {role: 'Bok', address: bok.address}, {role: 'owner-account', address: owner},
    ], categories: [
      {role: 'board-name', contractAddress: board.address, storageSlot: board.artifact.storageLayout.names.slot},
      {role: 'board-deposit', contractAddress: board.address, storageSlot: board.artifact.storageLayout.deposits.slot},
      {role: 'FPC-balance', contractAddress: feeInstance.address, storageSlot: feeContract.artifact.storageLayout.balances.slot},
      {role: 'Bok-balance', contractAddress: bok.address, storageSlot: bok.artifact.storageLayout.balances.slot},
    ]});
    await stage('matching-post-preflight'); await wallet.pxe.sync();
    await noteMembership.capture('before-preflight');
    noteMembership.setPhase('preflight');
    report.matchingPreflight = {passed: false, method: 'W01 privateFeeAction', submitted: false}; await save();
    const preflightHints = await query(board, 'get_screen_hints', owner, depositId);
    assert(preflightHints.length === 2 && !preflightHints[0] && !preflightHints[1]);
    // Same successful-path estimator as the later post; no proof/send and no
    // changed reservation, note selection, SDK override or negative-case bypass.
    await privateFee.paymentFor(owner).privateFeeAction({wallet, owner,
      interaction: board.methods.post_with_bok(depositId, nonce, draft, preflightHints[0], preflightHints[1], pluginId, requestId)});
    noteMembership.markPreflightSucceeded(); report.matchingPreflight.passed = true; await save();
    const beforeRollbackAnchor = await noteMembership.capture('before-rollback'); await save();

    // Deliberate local negative only: fixed signed reservation after cold claims
    // have mined. Success paths continue to use the unchanged W01 estimator.
    const authorizedGas = authorization.tx.getGasSettings();
    const negativeGas = GasSettings.fallback({gasLimits: Gas.from(info.txsLimits.gas),
      teardownGasLimits: authorizedGas.teardownGasLimits.clone(), maxFeesPerGas: authorizedGas.maxFeesPerGas.clone(),
      maxPriorityFeesPerGas: authorizedGas.maxPriorityFeesPerGas.clone()});
    const reservation = negativeGas.getFeeLimit().toBigInt();
    await wallet.pxe.sync(); assert(n(await query(feeContract, 'balance_of', owner)) >= reservation, 'Insufficient private fee reservation');
    const rejectedPayment = async ({wallet: actionWallet, owner: actor, interaction}) => {
      assert(actionWallet === wallet && actor.equals(owner));
      const payment = new PrivateFeePaymentMethod(feeInstance.address, reservation);
      const payload = mergeExecutionPayloads([await payment.getExecutionPayload(), await interaction.request()]);
      return {maximumFee: String(reservation), interaction: {request: async () => payload},
        options: {from: owner, additionalScopes: [owner], fee: {gasSettings: negativeGas}}, expectedFeePayer: feeInstance.address};
    };
    const mismatched = {...draft, message: [...draft.message]}; mismatched.message[0] = new Fr(n(mismatched.message[0]) ^ (1n << 240n));
    noteMembership.setPhase('rollback');
    await stage('mined-target-mismatch');
    report.rollback = await assertMinedCallbackRollback({node, wallet, owner, board, bok, depositId, nonce,
      draft: mismatched, requestId, pluginId, reason: 'mismatch', outputDirectory: path.join(outputDirectory, 'rollback'),
      mineL1, payerMode: 'private', privateFeeAction: rejectedPayment});
    const rejected = report.rollback;
    assert(rejected.passed && rejected.tx && rejected.effect && rejected.receipt, 'Canonical rollback handles required');
    assert(rejected.receipt.transactionFee > 0n && rejected.receipt.transactionFee <= reservation);
    humanFees.owner += rejected.receipt.transactionFee;
    report.humanActualFees = feeSummary();
    report.rollbackFee = String(rejected.receipt.transactionFee);
    await save();
    report.rollbackFootprint = inspect(rejected.tx, rejected.effect, true);
    observedPublic.push({tx: rejected.tx, effect: rejected.effect});
    await privateFee.verify(humanFees);

    await stage('finalize-exact-reverted-transaction');
    report.revertedFinality = await finalizeReverted({txHash: rejected.txHash, blockNumber: rejected.blockNumber,
      blockHash: rejected.blockHash, effectSha256: rejected.effectSha256, transactionFee: String(rejected.receipt.transactionFee)});
    assert(report.revertedFinality.passed && report.revertedFinality.controlledSettlement && !report.revertedFinality.epochProof);
    await save();
    // Ordinary PXE reconciliation now sees FINALIZED+REVERTED and can resolve
    // constrained-delivery predecessors. No cache, note or pending-tx mutation.
    await wallet.pxe.sync();
    await noteMembership.capture('after-rollback-old-anchor', beforeRollbackAnchor);
    await noteMembership.capture('after-rollback'); await save();
    noteMembership.setPhase('matching-post');
    await stage('matching-post'); await wallet.pxe.sync();
    const countBefore = n(await query(board, 'get_post_count'));
    equalPrivate((await query(board, 'get_deposit_info', owner, depositId)).map(n), before, 'Rollback changed deposit');
    const hints = await query(board, 'get_screen_hints', owner, depositId); assert(hints.length === 2 && !hints[0] && !hints[1]);
    const posted = await send('post-with-bok', board.methods.post_with_bok(depositId, nonce, draft, hints[0], hints[1], pluginId, requestId), owner);
    assert(posted.effect.nullifiers.filter(value => value.equals(oldNote.siloedNullifier)).length === 1, 'Original collateral note not spent exactly once');
    const postId = await poseidon2HashWithSeparator([1n, n(board.address), n(nonce)], 0x42420102);
    const digest = await poseidon2HashWithSeparator([BigInt(draft.length), ...draft.message.map(n)], 0x52435431);
    const publicPost = await query(board, 'get_post', postId);
    const expectedRecord = {subboard: 0n, parent: 0n, root: n(postId), kind: 1n, name_id: n(nameId), reference: 0n, content_digest: n(digest)};
    assert(publicPost[0] && n(publicPost[2]) === 0n && n(publicPost[4]) === 0n);
    for (const [key, value] of Object.entries(expectedRecord)) assert(n(publicPost[1][key]) === value, 'Canonical post metadata mismatch');
    assert(n(await query(board, 'get_post_count')) === countBefore + 1n && n(await query(board, 'get_post_id', countBefore)) === n(postId));
    const publishedAt = n((await node.getBlock(posted.receipt.blockNumber)).header.globalVariables.timestamp);
    assert(n(publicPost[3]) === publishedAt);
    async function event(name, effect = posted.effect) {
      const abi = board.artifact.outputs.structs.events.find(item => item.path === `RollingBoard::${name}`); assert(abi);
      const selector = await EventSelector.fromSignature(decodeFunctionSignature(name, abi.fields));
      const tag = await computeLogTag(selector.toField(), DomainSeparator.EVENT_LOG_TAG);
      const logs = effect.publicLogs.filter(log => log.contractAddress.equals(board.address) && log.fields[0]?.equals(tag));
      if (effect !== posted.effect) {
        report.reply.authenticatedEventCounts ??= {};
        report.reply.authenticatedEventCounts[name] = logs.length; await save();
      }
      assert.equal(logs.length, 1, 'Exactly one authenticated event required');
      return decodeFromAbi(abi, logs[0].getEmittedFieldsWithoutTag());
    }
    const published = await event('PostPublished'), invoked = await event('PluginInvoked');
    assert(n(published.schema) === 1n && n(published.id) === n(postId) && n(published.timestamp) === publishedAt
      && n(published.main_policy_version) === n(mainVersion) && n(published.local_policy_version) === 0n);
    for (const [key, value] of Object.entries(expectedRecord)) assert(n(published.record[key]) === value);
    assert(n(published.length) === BigInt(draft.length));
    equalPrivate(published.message.map(n), draft.message.map(n), 'Authenticated public body differs');
    const decoded = Buffer.concat(published.message.map(value => Buffer.from(n(value).toString(16).padStart(62, '0'), 'hex')));
    assert(decoded.subarray(0, draft.length).equals(Buffer.from(content)) && decoded.subarray(draft.length).every(byte => byte === 0));
    assert(n(invoked.schema) === 1n && n(invoked.plugin_id) === n(pluginId) && n(invoked.post_id) === n(postId)
      && n(invoked.request_id) === n(requestId) && n(invoked.target) === n(target));
    const active = await query(bok, 'request', requestId);
    equalPrivate(active, {...waiting, state: 2n}, 'Bok request did not activate without changing accounting');
    assert(n(await query(bok, 'balance_of', owner)) === 600n);
    equalPrivate((await query(board, 'owned_names', owner, 0)).map(n), names, 'Name ownership not retained');
    const after = (await query(board, 'get_deposit_info', owner, depositId)).map(n);
    equalPrivate(after.slice(0, 4), before.slice(0, 4), 'Deposit identity/economics changed');
    assert(after[4] !== 0n); equalPrivate(after.slice(5, 9), [1n, 0n, 0n, 1n], 'Deposit sequence transition incorrect');
    const now = n(posted.tx.data.constants.anchorBlockHeader.globalVariables.timestamp);
    const numerator = BigInt(economics.baseCooldown) * BigInt(economics.minDeposit);
    const cooldown = (numerator + before[2] - 1n) / before[2], saved = cooldown * (BigInt(economics.maxSaveUp) - 1n);
    const floor = now > saved ? now - saved : 0n;
    assert(after[9] === (before[9] > floor ? before[9] : floor) + cooldown, 'Exact collateral cooldown transition differs');
    await exactDeposit(after, posted.tx.getTxHash());
    const postNotes = (await wallet.pxe.debug.getNotes({contractAddress: board.address, owner, status: NoteStatus.ACTIVE,
      scopes: [owner], storageSlot: board.artifact.storageLayout.posts.slot})).filter(note => note.txHash.equals(posted.tx.getTxHash()));
    assert(postNotes.length === 1, 'Exactly one authenticated private posting history note required');
    equalPrivate(postNotes[0].note.items.map(n), [1n, n(depositId), 1n, n(postId), now, 0n, 0n], 'Private history note differs');
    // Real chain transactions, explicitly synthetic provider billing. The separate
    // actual provider campaign owns its paid-call journal and must never be replayed here.
    const numberFields = object => Object.fromEntries(Object.entries(object).map(([key, value]) => [key,
      typeof value === 'boolean' ? value : String(n(value))]));
    const accounting = request => numberFields(Object.fromEntries(['state', 'invocation_hash', 'sequence', 'budget',
      'available', 'reserved', 'charged', 'refunded', 'receipt', 'primary_done', 'secondary_done'].map(key => [key, request[key]])));
    report.reply = {passed: false, billing: 'synthetic-provider-fixture', actualProviderCall: false,
      independentProviderDebitVerified: false, reservedMaximum: '200', fixtureCharge: '120'};
    await save();
    const initialEarnings = n(await query(bok, 'earned'));
    report.reply.initialOperatorEarnings = String(initialEarnings); await save(); assert.equal(initialEarnings, 0n);
    await send('bok-reserve', bok.methods.reserve(requestId, 0, 200n), operator);
    const reserved = await query(bok, 'request', requestId);
    report.reply.reserved = accounting(reserved); await save();
    assert(n(reserved.state) === 2n && n(reserved.invocation_hash) === n(target) && n(reserved.budget) === 400n
      && n(reserved.available) === 200n && n(reserved.reserved) === 200n && n(reserved.charged) === 0n && n(reserved.refunded) === 0n);
    const syntheticReceipt = fresh();
    report.reply.syntheticReceipt = String(syntheticReceipt); await save();
    await send('bok-settle', bok.methods.settle(requestId, 0, 120n, syntheticReceipt), operator);
    const settled = await query(bok, 'request', requestId);
    report.reply.settled = accounting(settled); await save();
    assert(n(settled.state) === 2n && n(settled.invocation_hash) === n(target) && n(settled.sequence) === 1n
      && n(settled.available) === 280n && n(settled.reserved) === 0n && n(settled.charged) === 120n
      && n(settled.refunded) === 0n && n(settled.receipt) === n(syntheticReceipt));
    const replyContent = 'Fixture reply: the quiet reading page is ready.';
    // Reuse only the canonical UTF-8 packing; no second invocation is authorized.
    const packedReply = invocationPreimage({...input, content: replyContent});
    const replyMessage = packedReply.slice(13).map(value => new Fr(value)), replyLength = Number(packedReply[12]);
    const [replyMainVersion] = await query(board, 'main_policy');
    const replyLocalVersion = 0, replyCountBefore = n(await query(board, 'get_post_count'));
    const replyArgs = [requestId, pluginId, replyMessage, replyLength, Number(replyMainVersion), replyLocalVersion];
    const replied = await send('bok-publish-reply', bok.methods.publish_reply(...replyArgs), operator);
    const invocationKey = await poseidon2HashWithSeparator([n(bok.address), n(requestId)], 0x52434249);
    const replyId = await poseidon2HashWithSeparator([n(board.address), n(invocationKey)], 0x52434252);
    const replyDigest = await poseidon2HashWithSeparator([BigInt(replyLength), ...replyMessage.map(n)], 0x52435431);
    const replyPublic = await query(board, 'get_post', replyId), replyAt = n((await node.getBlock(replied.receipt.blockNumber)).header.globalVariables.timestamp);
    const replyPublished = await event('PostPublished', replied.effect), replyLinked = await event('PluginReplyPublished', replied.effect);
    const expectedReplyRecord = {subboard: '0', parent: String(n(postId)), root: String(n(postId)), kind: '4',
      name_id: '0', reference: '0', content_digest: String(n(replyDigest))};
    const requestAfterReply = await query(bok, 'request', requestId);
    report.reply.observed = {requestUnchanged: isDeepStrictEqual(settled, requestAfterReply), exists: replyPublic[0], removed: String(n(replyPublic[2])), reason: String(n(replyPublic[4])),
      record: numberFields(replyPublic[1]), count: String(n(await query(board, 'get_post_count'))),
      atOrder: String(n(await query(board, 'get_post_id', replyCountBefore))), timestamp: String(n(replyPublic[3])),
      published: {...numberFields(Object.fromEntries(['schema', 'id', 'timestamp', 'main_policy_version', 'local_policy_version', 'length'].map(key => [key, replyPublished[key]]))),
        record: numberFields(replyPublished.record), message: replyPublished.message.map(value => String(n(value)))},
      linked: numberFields(replyLinked), requestBeforeReply: accounting(settled), requestAfterReply: accounting(requestAfterReply)};
    report.reply.expected = {id: String(n(replyId)), record: expectedReplyRecord, count: String(replyCountBefore + 1n),
      timestamp: String(replyAt), mainVersion: String(n(replyMainVersion)), localVersion: '0', length: String(replyLength),
      message: replyMessage.map(value => String(n(value))), pluginId: String(n(pluginId)), requestId: String(n(requestId)),
      parentId: String(n(postId)), target: String(n(target))};
    report.reply.content = replyContent; await save();
    assertReplyAcceptance(report.reply.observed, report.reply.expected);
    // SDK simulation only: no extra send, proof/finality owner or paid provider call.
    for (const [label, actor, expected] of [['replay', operator, 'Already replied'], ['wrong-operator', owner, 'Only operator']]) {
      await stage('bok-negative-' + label);
      const observation = {method: 'SDK simulation', submitted: false, rejected: false, expectedReasonMatched: false};
      report.reply[label] = observation; await save();
      let rejection;
      try {
        // Keep the full SDK simulation result: ContractFunctionInteraction.simulate
        // decodes only return values and can omit a returned public revert reason.
        const simulation = await wallet.simulateTx(await bok.methods.publish_reply(...replyArgs).request(), {from: actor});
        rejection = simulation.publicOutput?.revertReason;
        observation.rejected = Boolean(rejection) && !simulation.publicOutput?.txEffect?.revertCode?.isOK();
      } catch (error) { observation.rejected = true; rejection = error; }
      // Inspect in memory only; raw SDK errors can contain private data.
      const message = rejection?.getOriginalMessage?.() ?? rejection?.message;
      observation.expectedReasonMatched = typeof message === 'string' && message.includes(expected);
      await save(); assert(observation.rejected && observation.expectedReasonMatched, 'Expected reply rejection not established');
    }
    await send('bok-finish', bok.methods.finish(requestId), operator);
    const completed = await query(bok, 'request', requestId);
    report.reply.accounting = {...accounting(completed), ownerBalance: String(n(await query(bok, 'balance_of', owner))),
      operatorEarnings: String(n(await query(bok, 'earned')))};
    await save(); assertReplyAccounting(report.reply.accounting, {target: String(n(target)), receipt: String(n(syntheticReceipt))});
    equalPrivate((await query(board, 'get_deposit_info', owner, depositId)).map(n), after, 'Bok reply changed human collateral');
    equalPrivate((await query(board, 'owned_names', owner, 0)).map(n), names, 'Bok reply changed private name ownership');
    report.reply.passed = true; await save();
    // Compare sensitive link markers in memory only. Public opaque note hashes,
    // nullifiers and ciphertext are deliberately outside this direct-field test.
    const markers = new Set([n(depositId), before[3], after[4]].map(String));
    for (const {tx, effect} of observedPublic) {
      const calls = tx.getPublicCallRequestsWithCalldata();
      const fields = [tx.data.feePayer, ...calls.flatMap(call => [call.request.msgSender, call.request.contractAddress]),
        ...tx.publicFunctionCalldata.flatMap(call => call.values), ...effect.publicDataWrites.flatMap(write => [write.leafSlot, write.value]),
        ...effect.publicLogs.flatMap(log => [log.contractAddress, ...log.fields])];
      assert(fields.every(value => !markers.has(String(n(value)))), 'Private collateral identity or history link exposed');
    }
    await privateFee.verify(humanFees);
    equalPrivate(await sourceHashes(), report.sourceHashes, 'Source changed during journey');
    for (const [relative, hash] of Object.entries(artifactHashes)) assert.equal(sha(await fs.readFile(path.join(ROOT, relative))), hash);
    Object.assign(report, {passed: true, stage: 'complete', postId: String(postId), requestId: String(requestId),
      nameId: String(nameId), content, bodyDigest: String(digest), humanActualFees: feeSummary(),
      checks: ['actual-claimed-collateral', 'private-fee-human', 'name-owned', 'immutable-plugin-bound',
        'mined-mismatch-rollback', 'same-request-success', 'authenticated-post-body', 'exact-ten-field-deposit-transition',
        'active-request-400-budget', 'private-bok-credit-600', 'authenticated-bok-reply', 'synthetic-charge-120-private-refund-280',
        'private-bok-final-880-operator-120', 'reply-replay-and-authorization-rejected', 'canonical-fee-conservation', 'public-footprint-smoke']});
    await save(); return report;
  } catch (error) {
    // Only stage and completed public observations are persisted. SDK errors may
    // contain identities, note material or witness values; never serialize them.
    await save(); error.rollingJourneyObservation = report; throw error;
  } finally {
    if (noteMembership) {await noteMembership.flush(); noteMembership.close(); await save();}
  }
}
