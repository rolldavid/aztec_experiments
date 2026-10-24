import {createHash} from 'node:crypto';
import {PXE_REORG_ANCHOR_PINS} from './patch-pxe-reorg-anchor.mjs';
const pin=PXE_REORG_ANCHOR_PINS.find(pin=>pin.path==='dest/block_synchronizer/block_synchronizer.js');
// The native stream already owns a detached source plan. Check its selected
// header and the current selected tier together; repeated tip/header/tip reads
// do not make those RPCs atomic. All later native transaction checks remain.
export function parallelPxeAnchorSnapshot(source){
 if(createHash('sha256').update(source).digest('hex')!==pin.after)throw Error('PXE sync snapshot source mismatch');
 const begin=source.indexOf('  async checkedSelectedAnchor() {'),end=source.indexOf('  async checkAcknowledgedSnapshot()',begin);
 if(begin<0||end<0)throw Error('PXE sync snapshot layout mismatch');
 source=source.slice(0,begin)+`  async checkedSelectedAnchor() {
    const block = await this.selectedAnchor();
    const results = await Promise.allSettled([
      Promise.resolve().then(async () => {
        const tips = await this.node.getChainTips();
        const tier = this.config.syncChainTip ?? 'proposed';
        const live = tier === 'proposed' ? tips.proposed : tips[tier].block;
        return { number: live.number, hash: live.hash.toString() };
      }),
      Promise.resolve().then(() => this.checkedHeader(block)),
    ]);
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    const live = results[0].value, header = results[1].value;
    if (live.number < block.number ||
        (live.number === block.number && !this.sameAnchor(live, block))) {
      throw new Error('PXE_REORG_ANCHOR_CHANGED');
    }
    if (this.sameAnchor(live, block)) return { block, header };
    // A moving selected tier can cross a fork between the concurrent responses.
    // Authenticate that newer observation, then re-read the captured anchor
    // last. The stable case needs neither duplicated round trip.
    await this.checkedHeader(live);
    return { block, header: await this.checkedHeader(block) };
  }

`+source.slice(end);
 return withAnchorRead(source);
}

function withAnchorRead(source){
 const replace=(before,after)=>{if(source.split(before).length!==2)throw Error('PXE anchor read layout mismatch');source=source.replace(before,after);};
 // Both validations read immutable identities captured by the native stream.
 // Drain both before any anchor/store update, preserving the old-header error
 // priority when both fail. This removes one serial RPC phase on advances.
 replace(`          await this.checkedHeader(currentId);
          if (!this.sameAnchor(target.block, (await this.checkedSelectedAnchor()).block)) throw new Error('PXE_REORG_ANCHOR_CHANGED');`,
 `          const checks = await Promise.allSettled([
            Promise.resolve().then(() => this.checkedHeader(currentId)),
            Promise.resolve().then(() => this.checkedSelectedAnchor()),
          ]);
          const failed = checks.find(result => result.status === 'rejected');
          if (failed) throw failed.reason;
          if (!this.sameAnchor(target.block, checks[1].value.block)) throw new Error('PXE_REORG_ANCHOR_CHANGED');`);
 replace('  syncPass = undefined;',`  syncPass = undefined;

  anchorRead = undefined;
  async syncWithAnchorRead(read) {
    if (typeof read !== 'function' || this.anchorRead || this.isSyncing) throw new Error('PXE_ANCHOR_READ_BUSY');
    const state = { read, reads: new Map(), selected: undefined };
    this.anchorRead = state;
    try {
      await this.sync();
      const results = await Promise.allSettled([...state.reads.values()]);
      const failed = results.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
      if (!state.selected || !state.reads.has(state.selected.hash)) throw new Error('PXE_ANCHOR_READ_INCOMPLETE');
      return { anchor: state.selected, value: await state.reads.get(state.selected.hash) };
    } finally {
      await Promise.allSettled([...state.reads.values()]);
      this.anchorRead = undefined;
    }
  }`);
 replace('      this.syncTips = structuredClone(await tips());',`      this.syncTips = structuredClone(await tips());
      const read = this.anchorRead;
      if (read) {
        const tier = this.config.syncChainTip ?? 'proposed';
        const selected = tier === 'proposed' ? this.syncTips.proposed : this.syncTips[tier].block;
        if (!read.reads.has(selected.hash)) {
          const anchor = Object.freeze({ number: selected.number, hash: selected.hash });
          const pending = Promise.resolve().then(() => read.read(anchor));
          read.reads.set(anchor.hash, pending);
          // Drain and report every read at completion, including a replaced plan.
          pending.catch(() => {});
        }
      }`);
 replace('      await this.checkAcknowledgedSnapshot();',`      await this.checkAcknowledgedSnapshot();
      if (this.anchorRead) this.anchorRead.selected = Object.freeze({ number: selected.block.number, hash: selected.block.hash });`);
 return source;
}
