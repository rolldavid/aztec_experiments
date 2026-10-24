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
 return source.slice(0,begin)+`  async checkedSelectedAnchor() {
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
}
