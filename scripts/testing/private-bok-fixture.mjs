// Disposable local-chain fixture. The existing supervisor owns service lifetime.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import {Wallet, JsonRpcProvider, Contract, ContractFactory, keccak256, getCreateAddress} from 'ethers';
import {EmbeddedWallet} from '@aztec-labs/wallets/embedded';
import {BackendType} from '@aztec-foundation/bb.js';
import {RollupCheatCodes, EthCheatCodes} from '@aztec-labs/ethereum/test';
import {RollupContract} from '@aztec-labs/ethereum/contracts';
import {TxHash, TxStatus, TxExecutionResult} from '@aztec-labs/stdlib/tx';
import {EthAddress} from '@aztec-labs/foundation/eth-address';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {L1Actor, L2Actor, L1ToL2Message} from '@aztec-labs/stdlib/messaging';
import {ROOT} from '../toolchain.mjs';
import {applicationNativeProfile} from '../c01-native-profile.mjs';
import {applicationProofsEnabled, applicationProver} from './proof-policy.mjs';
import {withC01ClientMining} from '../c01-client-mining.mjs';
import {settleC01ApplicationMessage} from '../c01-settle-application-message.mjs';
import {drainT04Checkpoints} from '../u01-browser-flow.mjs';

export const evidenceJson = value => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? String(item) : item, 2) + '\n';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => assert.equal(String(a).toLowerCase(), String(b).toLowerCase());

export async function runPrivateBokFixture(ctx, caseProfile = 'both') {
  assert(['both', 'normal', 'uncertain'].includes(caseProfile));
  const realProofs = applicationProofsEnabled();
  const observation = {passed: false, caseProfile, applicationProofs: realProofs, networkProofs: false,
    controlledSettlement: true, fundingMode: 'real-portal-deposit',
    payerMode: 'genesis', privacyAcceptance: 'missing: public genesis fee payer', l1: []};
  const directory = path.join(ROOT, 'execution/evidence/G14', 'portal-' + randomUUID());
  await fs.mkdir(directory, {mode: 0o700});
  const save = () => fs.writeFile(path.join(directory, 'fixture.json'), evidenceJson(observation));
  let wallet, provider;
  try {
    const url = new URL(ctx.config.l1RpcUrls[0]);
    assert.equal(url.protocol, 'http:'); assert.equal(url.hostname, '127.0.0.1');
    assert.equal(await ctx.l1Client.getChainId(), 31337);
    const info = await ctx.node.getNodeInfo();
    assert.equal(Number(info.l1ChainId), 31337);
    provider = new JsonRpcProvider(url.href, undefined, {cacheTimeout: -1});
    const signer = Wallet.createRandom().connect(provider);
    // The chain and identity are disposable; no existing developer account enters the fixture.
    await provider.send('anvil_setBalance', [signer.address, '0x56bc75e2d63100000']);
    wallet = await EmbeddedWallet.create(ctx.node, {ephemeral: true, pxe: {
      proverEnabled: true, autoSync: false, syncChainTip: 'checkpointed',
      proverOrOptions: applicationProver({backend: BackendType.NativeUnixSocket, ...applicationNativeProfile(ctx.directory)}),
    }});
    assert.equal(ctx.preparation.authorAccounts.length, 3);
    for (const [i, actor] of ctx.preparation.authorAccounts.entries()) {
      const manager = await wallet.createSchnorrInitializerlessAccount(actor.secret, actor.salt, actor.signingKey, 'bok-fixture-' + i);
      assert(manager.address.equals(actor.address));
    }
    const [owner, operator, otherUser] = ctx.preparation.authorAccounts.map(actor => actor.address);
    const artifacts = {};
    for (const name of ['DevUSDC', 'PluginPortal']) {
      const relative = `billboard/portal/out/${name}.sol/${name}.json`;
      const bytes = await fs.readFile(path.join(ROOT, relative));
      artifacts[name] = JSON.parse(bytes);
      observation.artifactHashes ??= {}; observation.artifactHashes[relative] = sha(bytes);
    }
    // Pre-sign and record the exact hash before the sole broadcast. No send retry.
    async function sendL1(label, request) {
      assert(/^[a-zA-Z0-9-]+$/.test(label));
      const populated = await signer.populateTransaction(request);
      assert.equal(populated.chainId, 31337n);
      const signed = await signer.signTransaction(populated), hash = keccak256(signed);
      const row = {label, txHash: hash, submission: 'outcome unknown'};
      await fs.writeFile(path.join(directory, `intent-${label}.json`), evidenceJson({label, txHash: hash, chainId: 31337}), {flag: 'wx', mode: 0o600});
      observation.l1.push(row); await save();
      const sent = await provider.broadcastTransaction(signed); same(sent.hash, hash);
      const receipt = await provider.waitForTransaction(hash, 1, 60000);
      assert(receipt); assert.equal(receipt.status, 1);
      same((await provider.getBlock(receipt.blockNumber)).hash, receipt.blockHash);
      Object.assign(row, {submission: 'included', blockNumber: receipt.blockNumber, blockHash: receipt.blockHash,
        gasUsed: receipt.gasUsed, fee: receipt.fee}); await save();
      return {receipt, address: getCreateAddress({from: signer.address, nonce: populated.nonce})};
    }
    async function deploy(name, args, label) {
      const artifact = artifacts[name], factory = new ContractFactory(artifact.abi, artifact.bytecode.object, signer);
      const {address, receipt} = await sendL1(label, await factory.getDeployTransaction(...args));
      same(receipt.contractAddress, address);
      assert.notEqual(await provider.getCode(address), '0x');
      return new Contract(address, artifact.abi, signer);
    }
    const token = await deploy('DevUSDC', [signer.address], 'deploy-token');
    let portal, escrowAddress;
    const settle = async ({txHash, expectedLeaf}, kind) => {
      const result = await settleC01ApplicationMessage({node: ctx.node, config: ctx.config,
        dateProvider: ctx.dateProvider, l1Client: ctx.l1Client, directory: ctx.directory,
        rollupAddress: ctx.rollupAddress, txHash, expectedLeaf, kind, applicationProofs: realProofs});
      assert(result.passed);
      observation.settlements ??= []; observation.settlements.push(result); await save();
      const w = result.witness;
      return [BigInt(w.epochNumber), BigInt(w.numCheckpointsInEpoch), w.leafIndex,
        w.siblingPath.toBufferArray().map(bytes => '0x' + bytes.toString('hex'))];
    };
    await withC01ClientMining({rpcUrl: url.href, dateProvider: ctx.dateProvider, observation}, async mineL1 => {
      const deployPortal = async ({escrow, chainId, rollupVersion}) => {
        assert.equal(BigInt(chainId), 31337n); assert.equal(BigInt(rollupVersion), BigInt(info.rollupVersion));
        assert(!portal, 'One portal per disposable experiment'); escrowAddress = escrow;
        portal = await deploy('PluginPortal', [String(ctx.rollupAddress), String(escrow), BigInt(rollupVersion), await token.getAddress()], 'deploy-portal');
        return EthAddress.fromString(await portal.getAddress());
      };
      const activatePortal = async record => {
        same(record.portal, await portal.getAddress()); same(record.escrow, escrowAddress);
        const proof = await settle(record, 'ready');
        await sendL1('activate-portal', await portal.activate.populateTransaction(...proof));
        assert.equal(await portal.active(), true);
        return {activated: true, evidenceRef: path.join(directory, 'fixture.json')};
      };
      const funding = {mode: 'real-portal-deposit', submit: async input => {
        const {operationId, amount, recipientCommitment, secretHash, content} = input;
        assert(/^[a-zA-Z0-9-]+$/.test(operationId));
        same(input.portal, await portal.getAddress()); same(input.escrow, escrowAddress);
        assert.equal(BigInt(input.chainId), 31337n); assert.equal(BigInt(input.rollupVersion), BigInt(info.rollupVersion));
        const portalBefore = await token.balanceOf(await portal.getAddress()), userBefore = await token.balanceOf(signer.address);
        await sendL1(operationId + '-approve', await token.approve.populateTransaction(await portal.getAddress(), amount));
        const {receipt} = await sendL1(operationId + '-deposit', await portal.deposit.populateTransaction(String(recipientCommitment), amount, String(secretHash)));
        const events = receipt.logs.filter(log => log.address.toLowerCase() === portal.target.toLowerCase())
          .map(log => portal.interface.parseLog(log)).filter(log => log?.name === 'Deposited');
        assert.equal(events.length, 1); const event = events[0].args;
        same(event.account, recipientCommitment); assert.equal(event.amount, amount);
        assert.equal(await token.balanceOf(await portal.getAddress()), portalBefore + amount);
        assert.equal(await token.balanceOf(signer.address), userBefore - amount);
        const message = new L1ToL2Message(new L1Actor(EthAddress.fromString(await portal.getAddress()), 31337),
          new L2Actor(escrowAddress, Number(info.rollupVersion)), content, secretHash, new Fr(event.index));
        same(message.hash(), event.key);
        const sequencer = ctx.node.getSequencer(), prior = sequencer.getSequencer().getConfig();
        const restore = () => sequencer.updateConfig({minTxsPerBlock: prior.minTxsPerBlock, buildCheckpointIfEmpty: prior.buildCheckpointIfEmpty});
        let witness; const deadline = Date.now() + 60000;
        try {
          sequencer.updateConfig({minTxsPerBlock: 0, buildCheckpointIfEmpty: true});
          while (Date.now() < deadline) {
            await wallet.pxe.sync(); const anchor = await wallet.pxe.getSyncedBlockHeader();
            witness = await ctx.node.getL1ToL2MessageMembershipWitness(anchor.getBlockNumber(), message.hash());
            if (witness) break; await mineL1();
          }
          assert(witness, 'Canonical deposit membership timed out'); assert.equal(witness[0], event.index);
          await drainT04Checkpoints({node: ctx.node, l1Client: ctx.l1Client, rollupAddress: String(ctx.rollupAddress), checkpoints: {restore}, deadline});
        } finally { restore(); }
        const record = {mode: funding.mode, operationId, portal: String(input.portal), escrow: String(escrowAddress),
          chainId: 31337n, rollupVersion: BigInt(info.rollupVersion), amount, recipientCommitment: String(recipientCommitment),
          secretHash: String(secretHash), content: String(content), leafIndex: event.index, messageHash: String(message.hash()),
          txHash: receipt.hash, blockHash: receipt.blockHash, blockNumber: receipt.blockNumber, canonical: true,
          evidenceRef: path.join(directory, operationId + '-deposit.json')};
        await fs.writeFile(record.evidenceRef, evidenceJson(record), {flag: 'wx', mode: 0o600});
        return record;
      }};
      const redeem = async record => {
        const proof = await settle(record, 'exit');
        const address = String(record.recipient), amount = BigInt(record.amount);
        const before = await token.balanceOf(address), locked = await token.balanceOf(await portal.getAddress());
        await sendL1(record.label + '-redeem', await portal.withdraw.populateTransaction(address, amount, String(record.nonce), ...proof));
        assert.equal(await token.balanceOf(address), before + amount);
        assert.equal(await token.balanceOf(await portal.getAddress()), locked - amount);
        const result = {passed: true, amount, recipientBalanceBefore: before, recipientBalanceAfter: await token.balanceOf(address),
          portalBalanceBefore: locked, portalBalanceAfter: await token.balanceOf(await portal.getAddress()), controlledSettlement: true,
          evidenceRef: path.join(directory, record.label + '-redemption.json')};
        await fs.writeFile(result.evidenceRef, evidenceJson(result), {flag: 'wx', mode: 0o600});
        return result;
      };
      const advanceTo = async (target, reservation) => {
        assert(Number.isSafeInteger(Number(target)) && Number(target) > 0);
        // The ordinary network prunes unproven checkpoints across this 24-hour
        // jump. Preserve the exact reservation with the existing official local
        // retention control; this is neither an epoch proof nor real finality.
        const sequencer = ctx.node.getSequencer(), prior = sequencer.getSequencer().getConfig();
        const restore = () => sequencer.updateConfig({minTxsPerBlock: prior.minTxsPerBlock, buildCheckpointIfEmpty: prior.buildCheckpointIfEmpty});
        const rollup = new RollupContract(ctx.l1Client, String(ctx.rollupAddress));
        const cheats = new RollupCheatCodes(new EthCheatCodes(ctx.config.l1RpcUrls, ctx.dateProvider),
          {rollupAddress: EthAddress.fromString(String(ctx.rollupAddress))});
        const advance = {target: String(target), reservationTxHash: reservation.txHash,
          reservationBlock: reservation.blockNumber, reservationBlockHash: reservation.blockHash,
          testControlled: true, epochProof: false, passed: false};
        observation.deadlineAdvance = advance;
        const publicTips = async () => {
          const tips = await ctx.node.getChainTips(), anchor = await wallet.pxe.getSyncedBlockHeader();
          return {checkpointed: Number(tips.checkpointed.block.number), proven: Number(tips.proven.block.number),
            finalized: Number(tips.finalized.block.number), anchorBlock: Number(anchor.getBlockNumber()),
            anchorTimestamp: String(anchor.globalVariables.timestamp)};
        };
        advance.tipsBefore = await publicTips(); await save();
        const canonicalReservation = async () => {
          const receipt = await ctx.node.getTxReceipt(TxHash.fromString(reservation.txHash));
          assert([TxStatus.CHECKPOINTED, TxStatus.PROVEN, TxStatus.FINALIZED].includes(receipt.status));
          assert.equal(receipt.executionResult, TxExecutionResult.SUCCESS);
          assert.equal(Number(receipt.blockNumber), Number(reservation.blockNumber));
          assert.equal(String(receipt.blockHash), reservation.blockHash);
          const block = await ctx.node.getBlock(receipt.blockNumber);
          assert(block); assert.equal(String(block.hash), reservation.blockHash);
          return block;
        };
        await sequencer.pause();
        try {
          const block = await canonicalReservation();
          const pending = await rollup.getCheckpointNumber();
          advance.pendingBefore = Number(pending);
          advance.provenBefore = Number(await rollup.getProvenCheckpointNumber());
          assert(Number(pending) >= Number(block.checkpointNumber));
          await cheats.markAsProven(pending);
          advance.testControlledProvenCheckpoint = Number(await rollup.getProvenCheckpointNumber());
          assert(advance.testControlledProvenCheckpoint >= Number(pending));
          await save();
          const current = await ctx.l1Client.getBlock({blockTag: 'latest'});
          if (BigInt(target) > current.timestamp) {
            await ctx.l1Client.request({method: 'evm_setNextBlockTimestamp', params: [Number(target)]});
          }
          await mineL1();
          assert((await ctx.l1Client.getBlock({blockTag: 'latest'})).timestamp >= BigInt(target));
        } finally { await sequencer.start(); }
        // Publish an ordinary empty checkpoint so private simulation observes
        // canonical L2 time, not merely a warped L1 or local wall clock.
        const deadline = Date.now() + 60000;
        let reached = false;
        try {
          sequencer.updateConfig({minTxsPerBlock: 0, buildCheckpointIfEmpty: true});
          while (Date.now() < deadline) {
            await wallet.pxe.sync(); const header = await wallet.pxe.getSyncedBlockHeader();
            if (header.globalVariables.timestamp >= BigInt(target)) { reached = true; break; }
            await mineL1();
          }
          assert(reached, 'Canonical L2 deadline advancement timed out');
          await drainT04Checkpoints({node: ctx.node, l1Client: ctx.l1Client, rollupAddress: String(ctx.rollupAddress), checkpoints: {restore}, deadline});
          await wallet.pxe.sync();
          assert((await wallet.pxe.getSyncedBlockHeader()).globalVariables.timestamp >= BigInt(target));
          await canonicalReservation();
          advance.pendingAfter = Number(await rollup.getCheckpointNumber());
          advance.provenAfter = Number(await rollup.getProvenCheckpointNumber());
          advance.tipsAfter = await publicTips();
          advance.passed = true; await save();
        } finally { restore(); }
      };
      const {runPrivateBokExperiment} = await import('../../experiments/private-bok/measure.mjs');
      observation.experiment = await runPrivateBokExperiment({node: ctx.node, wallet, owner, operator, otherUser,
        deployPortal, activatePortal, funding, redeem, mineL1, advanceTo, realProofs, payerMode: 'genesis',
        outputDirectory: path.join(directory, 'experiment'), caseProfile, mark: ctx.mark,
        harnessFiles: ['scripts/testing/private-bok-fixture.mjs', 'scripts/testing/scenarios.mjs', 'scripts/testing/scenario-flows.mjs']});
      assert(observation.experiment.passed);
    });
    observation.passed = true;
  } catch (error) {
    if (error.privateBokObservation) observation.experiment = error.privateBokObservation;
    observation.failure = {errorClass: error.name}; error.privateBokFixtureObservation = observation; throw error;
  } finally {
    try { if (wallet) { await wallet.stop(); observation.walletStopped = true; } }
    finally { provider?.destroy(); await save(); }
  }
  // The generic worker accepts JSON observations. Normalize only after cleanup
  // so its report retains the same exact amounts and flags as fixture.json.
  return JSON.parse(evidenceJson(observation));
}
