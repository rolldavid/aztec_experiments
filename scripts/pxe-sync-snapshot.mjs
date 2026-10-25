import {createHash} from 'node:crypto';
import {beginProofSpan} from '../shared/proof-timings.mjs';
import {PXE_REORG_ANCHOR_PINS} from './patch-pxe-reorg-anchor.mjs';
const pin=PXE_REORG_ANCHOR_PINS.find(pin=>pin.path==='dest/block_synchronizer/block_synchronizer.js');
// The native stream already owns a detached source plan. Check its selected
// header and the current selected tier together; repeated tip/header/tip reads
// do not make those RPCs atomic. All later native transaction checks remain.
export function parallelPxeAnchorSnapshot(source){
 if(createHash('sha256').update(source).digest('hex')!==pin.after)throw Error('PXE sync snapshot source mismatch');
 const begin=source.indexOf('  async checkedSelectedAnchor() {'),end=source.indexOf('  async checkAcknowledgedSnapshot()',begin);
 if(begin<0||end<0)throw Error('PXE sync snapshot layout mismatch');
 source=source.slice(0,begin)+`  async checkedSelectedAnchor(phase) {
    const label=phase==='prewrite'?'prewrite':phase==='postwrite'?'postwrite':'selected';
    const block = await this.selectedAnchor();
    const results = await rollingSyncPhase('native.phase.sync-'+label+'-snapshot',()=>Promise.allSettled([
      Promise.resolve().then(async () => {
        const tips = await this.node.getChainTips();
        const tier = this.config.syncChainTip ?? 'proposed';
        const live = tier === 'proposed' ? tips.proposed : tips[tier].block;
        return { number: live.number, hash: live.hash.toString() };
      }),
      Promise.resolve().then(() => this.checkedHeader(block)),
    ]));
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
    await rollingSyncPhase('native.phase.sync-'+label+'-moving-head',()=>this.checkedHeader(live));
    return { block, header: await rollingSyncPhase('native.phase.sync-'+label+'-recheck',()=>this.checkedHeader(block)) };
  }

`+source.slice(end);
 source+=`\nconst rollingSyncSpan=${beginProofSpan.toString()};
async function rollingSyncPhase(stage,operation){
 if(globalThis[Symbol.for('rolling.proof.profile')]!==true)return operation();
 const finish=rollingSyncSpan(stage);try{return await operation();}finally{finish();}
}\n`;
 return withAnchorRead(source);
}

function withAnchorRead(source){
 const replace=(before,after)=>{if(source.split(before).length!==2)throw Error('PXE anchor read layout mismatch');source=source.replace(before,after);};
 // Resolve both canonical headers together before changing the native anchor.
 // The stream event already carries the selected immutable source identity;
 // checking that same selected identity twice before the write adds an RPC
 // phase, not an atomic snapshot. doSync still revalidates the completed plan.
 replace(`        const target = await this.checkedSelectedAnchor();
        if (!this.sameAnchor(target.block, event.block)) throw new Error('PXE_REORG_ANCHOR_CHANGED');
        const current = await this.anchorBlockStore.getBlockHeader();
        const currentId = { number: current.getBlockNumber(), hash: (await current.hash()).toString() };
        if (!this.sameAnchor(currentId, target.block)) {
          // Moving an orphan anchor without the preceding conservative rollback
          // would retain private state from the old fork. Never do that, including
          // contradictions at the stream's finalized walk-back floor.
          if (currentId.number >= target.block.number) throw new Error('PXE_REORG_ANCHOR_CHANGED');
          await this.checkedHeader(currentId);
          if (!this.sameAnchor(target.block, (await this.checkedSelectedAnchor()).block)) throw new Error('PXE_REORG_ANCHOR_CHANGED');
        }`,
 `        const current = await this.anchorBlockStore.getBlockHeader();
        const currentId = { number: current.getBlockNumber(), hash: (await current.hash()).toString() };
        const advancing = !this.sameAnchor(currentId, event.block);
        if (advancing && currentId.number >= event.block.number) throw new Error('PXE_REORG_ANCHOR_CHANGED');
        const checks = await rollingSyncPhase(advancing?'native.phase.sync-prewrite-advance':'native.phase.sync-prewrite-same',()=>Promise.allSettled([
          Promise.resolve().then(() => advancing ? this.checkedHeader(currentId) : undefined),
          Promise.resolve().then(() => this.checkedSelectedAnchor('prewrite')),
        ]));
        const failed = checks.find(result => result.status === 'rejected');
        if (failed) throw failed.reason;
        const target = checks[1].value;
        if (!this.sameAnchor(target.block, event.block)) throw new Error('PXE_REORG_ANCHOR_CHANGED');`);
 replace('      await this.blockStream.sync();',"      await rollingSyncPhase('native.phase.sync-stream',()=>this.blockStream.sync());");
 replace('      const selected = await this.checkedSelectedAnchor();',"      const selected = await rollingSyncPhase('native.phase.sync-postwrite-check',()=>this.checkedSelectedAnchor('postwrite'));");
 // Hash-pinned native node reads are immutable. Bound memory before this
 // explicitly owned prefetch instead of erasing it at the later anchor write.
 // Contract synchronization and private rollback still occur in their old order.
 replace('        this.node.wipeCache();','        if (!this.anchorRead?.warmNodeCache) this.node.wipeCache();');
 replace('  syncPass = undefined;',`  syncPass = undefined;

  anchorRead = undefined;
  async syncWithAnchorRead(read, {warmNodeCache=false} = {}) {
    if (typeof read !== 'function' || typeof warmNodeCache !== 'boolean' || this.anchorRead || this.isSyncing) throw new Error('PXE_ANCHOR_READ_BUSY');
    const state = { read, reads: new Map(), selected: undefined, warmNodeCache };
    this.anchorRead = state;
    try {
      if (warmNodeCache) this.node.wipeCache();
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
 replace('      this.syncTips = structuredClone(await tips());',`      this.syncTips = structuredClone(await rollingSyncPhase('native.phase.sync-source-snapshot',()=>tips()));
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
