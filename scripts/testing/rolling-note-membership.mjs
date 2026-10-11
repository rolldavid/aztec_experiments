// TEST ONLY. Bounded in-process SDK observations, never a network/privacy claim.
import assert from 'node:assert/strict';
import {computeUniqueNoteHash, siloNoteHash} from '@aztec-labs/stdlib/hash';
import {MerkleTreeId} from '@aztec-labs/stdlib/trees';
import {NoteStatus} from '@aztec-labs/stdlib/note';
const roles = ['board-name', 'board-deposit', 'FPC-balance', 'Bok-balance'];
const phases = ['before-preflight', 'preflight', 'before-rollback', 'rollback', 'after-rollback-old-anchor', 'after-rollback', 'matching-post'];
const active = new WeakSet();
const publicAnchor = value => {
  if (!value || typeof value !== 'object') return {unclassified: true};
  const number = Number(value.number), hash = String(value.hash);
  return Number.isSafeInteger(number) && number >= 0 && /^0x[0-9a-f]{64}$/.test(hash)
    ? {number, hash} : {unclassified: true};
};
export const createRollingNoteMembership = options => createRollingNoteMembershipFactory({computeUniqueNoteHash, siloNoteHash,
  noteTree: MerkleTreeId.NOTE_HASH_TREE, activeStatus: NoteStatus.ACTIVE})(options);

export function createRollingNoteMembershipFactory(sdk) {
  return ({node, wallet, owner, categories, maxRows = 128, maxLeaves = 256, maxNotes = 64}) => {
    assert.deepEqual(categories.map(item => item.role).sort(), [...roles].sort());
    for (const count of [maxRows,maxLeaves,maxNotes]) assert(Number.isSafeInteger(count) && count > 0 && count <= 256);
    assert(!active.has(node), 'Node membership observer already owned');
    const original = node.findLeavesIndexes, descriptor = Object.getOwnPropertyDescriptor(node, 'findLeavesIndexes');
    assert.equal(typeof original, 'function');
    assert(!descriptor || (descriptor.configurable && 'value' in descriptor), 'Cannot safely scope node method');
    const rows = [], captures = [], known = new Map();
    let phase = 'before-preflight', source = 'sdk', unknown = 0, truncatedRows = 0, truncatedLeaves = 0,
      truncatedNotes = 0, instrumentationErrors = 0, restored = false;
    const safe = fn => {try {return fn();} catch {instrumentationErrors++;}};
    const key = value => {const text = String(value); return /^0x[0-9a-f]{64}$/.test(text) ? text : undefined;};
    function begin(args) {
      if (rows.length >= maxRows) {truncatedRows++; return () => {};}
      const [anchor, tree, leaves] = args;
      if (!Number.isInteger(tree) || tree < 0 || tree > 4 || !Array.isArray(leaves)) {unknown++; return () => {};}
      const at = publicAnchor(anchor); if (at.unclassified) unknown++;
      const leafKeys = tree === sdk.noteTree ? leaves.slice(0,maxLeaves).map(key) : [];
      if (leaves.length > maxLeaves) truncatedLeaves += leaves.length - maxLeaves;
      const row = {phase, source, anchor: at, treeId: tree, count: leaves.length, outcome: 'pending', missing: []};
      rows.push(row);
      return (result, success) => {
        row.outcome = success ? 'returned' : 'failed';
        if (!success) return;
        if (!Array.isArray(result) || result.length !== leaves.length) {unknown++; row.outcome = 'unclassified-result'; return;}
        for (let i = 0; i < Math.min(result.length,maxLeaves); i++) if (!result[i]) {
          const matches = tree === sdk.noteTree ? known.get(leafKeys[i]) ?? [] : [];
          row.missing.push({position: i, categories: Object.fromEntries(roles.map(role => [role,matches.some(item => item.role === role)])),
            matchedCapturedActiveNote: matches.length > 0,
            sourceEffectMembership: matches.some(item => item.sourceEffectMembership),
            sourceCanonicalAtCapture: matches.some(item => item.sourceCanonical),
            sourceAtOrBeforeAnchor: !at.unclassified && matches.some(item => item.sourceBlock <= at.number)});
        }
      };
    }
    function wrapped(...args) {
      const done = safe(() => begin(args));
      let result;
      try {result = Reflect.apply(original, this, args);} catch (error) {safe(() => done?.(undefined,false)); throw error;}
      if (result instanceof Promise) Promise.prototype.then.call(result,
        value => safe(() => done?.(value,true)), () => safe(() => done?.(undefined,false)));
      else safe(() => done?.(result,true));
      return result;
    }
    Object.defineProperty(node, 'findLeavesIndexes', {value: wrapped, writable: true, configurable: true,
      enumerable: descriptor?.enumerable ?? false});
    active.add(node);
    const setPhase = value => {assert(phases.includes(value), 'Fixed diagnostic phase required'); phase = value;};
    async function capture(label, requestedAnchor) {
      setPhase(label); assert(captures.length < 8, 'Diagnostic capture bound');
      const record = {phase: label, outcome: 'running', categories: []}; captures.push(record);
      try {
        const header = await wallet.pxe.getSyncedBlockHeader();
        const anchor = requestedAnchor ?? {number: header.getBlockNumber(), hash: await header.hash()};
        record.anchor = publicAnchor(anchor); assert(!record.anchor.unclassified, 'Canonical anchor required');
        assert.equal(String((await node.getBlock(anchor.number)).hash), String(anchor.hash), 'Diagnostic anchor changed');
        for (const {role,contractAddress,storageSlot} of categories) {
          const all = await wallet.pxe.debug.getNotes({contractAddress, owner, status: sdk.activeStatus, scopes: [owner], storageSlot});
          assert(Array.isArray(all));
          truncatedNotes += Math.max(0,all.length-maxNotes);
          const category = {role,count: all.length,notes: []}; record.categories.push(category);
          for (const note of all.slice(0,maxNotes)) {
            const unique = await sdk.computeUniqueNoteHash(note.noteNonce, await sdk.siloNoteHash(note.contractAddress,note.noteHash));
            const hashKey = key(unique); assert(hashKey);
            const effect = await node.getTxEffect(note.txHash);
            const sourceBlock = Number(note.l2BlockNumber);
            const sourceCanonical = !!effect?.data && String(effect.data.txHash) === String(note.txHash) && Number(effect.l2BlockNumber) === sourceBlock
              && String(effect.l2BlockHash) === String(note.l2BlockHash)
              && String((await node.getBlock(sourceBlock))?.hash) === String(note.l2BlockHash);
            const sourceEffectMembership = !!effect?.data?.noteHashes.some(value => value.equals(unique));
            const facts = {role,sourceBlock,sourceCanonical,sourceEffectMembership};
            const previous = known.get(hashKey) ?? [];
            known.set(hashKey,[...previous.filter(item => item.role !== role),facts]);
            let pending;
            source = 'diagnostic';
            try {pending = node.findLeavesIndexes(anchor,sdk.noteTree,[unique]);} finally {source = 'sdk';}
            const membership = await pending;
            assert(Array.isArray(membership) && membership.length === 1);
            category.notes.push({present: !!membership[0],sourceCanonical,sourceEffectMembership,
              sourceAtOrBeforeAnchor: sourceBlock <= record.anchor.number});
          }
        }
        assert.equal(String((await node.getBlock(anchor.number)).hash), String(anchor.hash), 'Diagnostic anchor changed');
        record.outcome = 'complete'; return anchor;
      } catch (error) {record.outcome = 'failed'; throw error;}
    }
    function close() {
      if (restored) return;
      assert.equal(Object.getOwnPropertyDescriptor(node,'findLeavesIndexes')?.value,wrapped,'Node membership ownership changed');
      if (descriptor) Object.defineProperty(node,'findLeavesIndexes',descriptor); else delete node.findLeavesIndexes;
      active.delete(node); restored = true; known.clear();
    }
    return {setPhase,capture,close,snapshot: () => structuredClone({schema: 1,
      scope: 'in-process findLeavesIndexes calls and explicit diagnostic membership reads; not network capture or anonymity evidence',
      interpretation: 'Unknown settled reads without stored-note matches do not prove pending-note misclassification; cache hits may bypass observation; source facts describe diagnostic captures',
      phases: rows,captures,unknown,truncatedRows,truncatedLeaves,truncatedNotes,instrumentationErrors,restored})};
  };
}
