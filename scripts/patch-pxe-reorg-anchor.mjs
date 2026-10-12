import { createHash } from 'node:crypto';
import { readFile, lstat, realpath, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Explicit stopped-consumer dependency bootstrap only. No runtime mutation,
// retry, alternate node, retained orphan notes, or synthetic balance recovery.
export const PXE_REORG_ANCHOR_PINS = Object.freeze([
  Object.freeze({ path: 'src/block_synchronizer/block_synchronizer.ts', before: '82e7349e9e56c4d0943f81a4c11cd5fed39f04b41044d5583f5fdfdedbe21b72', after: '5a3680b79b182d9c7d291f8329abb3809489c6293ab7f9bb32ebe80d0e9bff20' }),
  Object.freeze({ path: 'dest/block_synchronizer/block_synchronizer.js', before: 'bf55d5e76660f5b59fca66380575a8ad15005e263dd6a6c8f9a8f79b4936a69a', after: '9e5fc3fc5ee5578d582aac089a4c99f335f66fb01a041ecd79e0837ed68aae78' }),
]);
const sha = value => createHash('sha256').update(value).digest('hex');
function methods(ts) {
  const t = value => ts ? value : '';
  return `
  ${t('private ')}anchorEventFailed = false;

  ${t('private ')}async selectedAnchor() {
    const tips = await this.node.getChainTips();
    const tier = this.config.syncChainTip ?? 'proposed';
    return tier === 'proposed' ? tips.proposed : tips[tier].block;
  }

  ${t('private ')}sameAnchor(a${t(': { number: number; hash: string }')}, b${t(': { number: number; hash: string }')}) {
    return a.number === b.number && a.hash === b.hash;
  }

  ${t('private ')}async checkedHeader(block${t(': { number: number; hash: string }')}) {
    // The hash parameter is an actual SDK BlockHash, for native AND RPC nodes.
    // A hash-pinned cached response alone does not establish current canonicality.
    const pinned = await this.node.getBlock({ hash: BlockHash.fromString(block.hash) });
    const canonical = await this.node.getBlock(BlockNumber(block.number));
    if (!pinned || !canonical || pinned.header.getBlockNumber() !== block.number ||
        canonical.header.getBlockNumber() !== block.number ||
        pinned.hash.toString() !== block.hash || canonical.hash.toString() !== block.hash ||
        (await pinned.header.hash()).toString() !== block.hash ||
        (await canonical.header.hash()).toString() !== block.hash) {
      throw new Error('PXE_REORG_ANCHOR_UNAVAILABLE');
    }
    return pinned.header;
  }

  ${t('private ')}async checkedSelectedAnchor() {
    const block = await this.selectedAnchor();
    const header = await this.checkedHeader(block);
    if (!this.sameAnchor(block, await this.selectedAnchor())) throw new Error('PXE_REORG_ANCHOR_CHANGED');
    return { block, header };
  }

  ${t('private ')}async doHandleBlockStreamEvent(event${t(': L2BlockStreamEvent')})${t(': Promise<void>')} {
    if (event.type === 'chain-pruned') {
      const current = await this.anchorBlockStore.getBlockHeader();
      if (current.getBlockNumber() > event.block.number) {
        // Resolve BOTH headers before writes. Sparse history can conservatively
        // prune to 10 even though the configured canonical tier is already 12.
        // Keep the conservative rollback; never keep unknown/orphan private state.
        await this.checkedHeader(event.block);
        const target = await this.checkedSelectedAnchor();
        if (target.block.number < event.block.number) throw new Error('PXE_REORG_ANCHOR_CHANGED');
        // Check the prune event's source snapshot as well as our configured tier.
        const tips = await this.node.getChainTips();
        if (!this.sameAnchor(tips.checkpointed.block, event.checkpointed.block) ||
            !this.sameAnchor(tips.proven.block, event.proven.block) ||
            !this.sameAnchor(target.block, await this.selectedAnchor())) {
          throw new Error('PXE_REORG_ANCHOR_CHANGED');
        }
        await this.store.transactionAsync(async () => {
          for (const rollbackable of this.rollbackables) await rollbackable.rollbackToBlock(event.block.number);
          // Wipes contract sync and node caches: rediscovery uses the canonical
          // header, not synthetic retained notes.
          await this.updateAnchorBlockHeader(target.header);
        });
        // SDK tips store opens its own transaction: do not nest on IndexedDB.
        // A rollback/anchor failure cannot acknowledge the prune cursor.
        await this.l2TipsStore.handleBlockStreamEvent(event);
        return;
      }
      // A prune ignored below our configured tier still cannot bless a source
      // contradiction at/below the finalized floor (the stream will not walk it).
      await this.checkedHeader({ number: current.getBlockNumber(), hash: (await current.hash()).toString() });
    } else if (event.type !== 'blocks-added') {
      const tier = this.config.syncChainTip ?? 'proposed';
      if (event.type === 'chain-' + tier) {
        const target = await this.checkedSelectedAnchor();
        if (!this.sameAnchor(target.block, event.block)) throw new Error('PXE_REORG_ANCHOR_CHANGED');
        const current = await this.anchorBlockStore.getBlockHeader();
        const currentId = { number: current.getBlockNumber(), hash: (await current.hash()).toString() };
        if (!this.sameAnchor(currentId, target.block)) {
          // Moving an orphan anchor without the preceding conservative rollback
          // would retain private state from the old fork. Never do that, including
          // contradictions at the stream's finalized walk-back floor.
          if (currentId.number >= target.block.number) throw new Error('PXE_REORG_ANCHOR_CHANGED');
          await this.checkedHeader(currentId);
          if (!this.sameAnchor(target.block, await this.selectedAnchor())) throw new Error('PXE_REORG_ANCHOR_CHANGED');
        }
        await this.store.transactionAsync(async () => {
          await this.updateAnchorBlockHeader(target.header);
        });
        // SDK tips store opens its own transaction: do not nest on IndexedDB.
        // A rollback/anchor failure cannot acknowledge the prune cursor.
        await this.l2TipsStore.handleBlockStreamEvent(event);
        return;
      }
    }
    // Unselected tips and no-op prunes keep the SDK's normal cursor semantics.
    await this.l2TipsStore.handleBlockStreamEvent(event);
  }

`;
}
function transformed(source, ts) {
  const begin = source.indexOf(ts ? '  private async doHandleBlockStreamEvent(' : '    async doHandleBlockStreamEvent(');
  const end = source.indexOf('/** Updates the anchor block header', begin);
  if (begin < 0 || end < 0) throw new Error('PXE_REORG_PATCH_LAYOUT');
  let result = source.slice(0, begin) + methods(ts) + '  ' + source.slice(end);
  const handler = ts ? 'return this.eventQueue.put(() => this.doHandleBlockStreamEvent(event));' : 'return this.eventQueue.put(()=>this.doHandleBlockStreamEvent(event));';
  if (result.split(handler).length !== 2) throw new Error('PXE_REORG_PATCH_LAYOUT');
  result = result.replace(handler, `return this.eventQueue.put(async () => {
      try { await this.doHandleBlockStreamEvent(event); }
      catch { this.anchorEventFailed = true; throw new Error('PXE_REORG_ANCHOR_EVENT_FAILED'); }
    });`);
  const sync = 'await this.blockStream.sync();';
  if (result.split(sync).length !== 2) throw new Error('PXE_REORG_PATCH_LAYOUT');
  result = result.replace(sync, `this.anchorEventFailed = false;
    await this.blockStream.sync();
    // L2BlockStream catches handler/source errors and AbortError internally.
    // Never report successful PXE sync merely because that promise resolved.
    if (this.anchorEventFailed) throw new Error('PXE_REORG_ANCHOR_EVENT_FAILED');
    const selected = await this.checkedSelectedAnchor();
    const anchor = await this.anchorBlockStore.getBlockHeader();
    if (anchor.getBlockNumber() !== selected.block.number ||
        (await anchor.hash()).toString() !== selected.block.hash) {
      throw new Error('PXE_REORG_ANCHOR_INCOMPLETE');
    }`);
  return result;
}
export function transformPxeReorgAnchor(source, path) {
  const pin = PXE_REORG_ANCHOR_PINS.find(pin => pin.path === path);
  if (!pin || typeof source !== 'string' || sha(source) !== pin.before) throw new Error('PXE_REORG_PATCH_SOURCE');
  const output = transformed(source, path.endsWith('.ts'));
  if (sha(output) !== pin.after) throw new Error('PXE_REORG_PATCH_OUTPUT');
  return output;
}
async function checkedPaths(packageRoot) {
  if (typeof packageRoot !== 'string' || !packageRoot) throw new Error('PXE_REORG_PATCH_ROOT');
  const root = resolve(packageRoot);
  if (await realpath(root) !== root) throw new Error('PXE_REORG_PATCH_SYMLINK');
  const paths = [];
  for (const pin of PXE_REORG_ANCHOR_PINS) {
    const path = join(root, pin.path);
    if (!(await lstat(path)).isFile() || await realpath(path) !== path) throw new Error('PXE_REORG_PATCH_SYMLINK');
    paths.push({ pin, path, source: await readFile(path, 'utf8') });
  }
  return paths;
}
export async function inspectPxeReorgAnchor(packageRoot) {
  const paths = await checkedPaths(packageRoot);
  const states = paths.map(({ pin, source }) => sha(source) === pin.before ? 'original' : sha(source) === pin.after ? 'patched' : 'unknown');
  if (states.includes('unknown') || states[0] !== states[1]) throw new Error('PXE_REORG_PATCH_STATE');
  return Object.freeze({ state: states[0], files: Object.freeze(paths.map(({ pin, source }) => Object.freeze({ path: pin.path, sha256: sha(source) }))) });
}
export async function patchPxeReorgAnchor(packageRoot) {
  const paths = await checkedPaths(packageRoot);
  const state = await inspectPxeReorgAnchor(packageRoot);
  if (state.state === 'patched') return state;
  const outputs = paths.map(({ pin, source }) => transformPxeReorgAnchor(source, pin.path));
  for (let i = 0; i < paths.length; i++) await writeFile(paths[i].path, outputs[i]);
  return inspectPxeReorgAnchor(packageRoot);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, root, ...extra] = process.argv.slice(2);
  if (!root || extra.length || !['--verify', '--apply'].includes(mode)) {
    process.stderr.write('Usage: patch-pxe-reorg-anchor.mjs --verify|--apply EXPLICIT_PACKAGE_ROOT\n'); process.exitCode = 1;
  } else {
    try { process.stdout.write(`${JSON.stringify(await (mode === '--verify' ? inspectPxeReorgAnchor : patchPxeReorgAnchor)(root))}\n`); }
    catch { process.stderr.write('PXE_REORG_PATCH_FAILED\n'); process.exitCode = 1; }
  }
}
