import { BlockNumber } from '@aztec-labs/foundation/branded-types';
import { createLogger } from '@aztec-labs/foundation/log';
import { SerialQueue } from '@aztec-labs/foundation/queue';
import { BlockHash, L2BlockStream } from '@aztec-labs/stdlib/block';
import { blockStreamSourceFromAztecNode } from './block_stream_source.js';
/**
 * The BlockSynchronizer class orchestrates synchronization between PXE and Aztec node, maintaining an up-to-date
 * view of the L2 chain state. It handles block header retrieval, chain reorganizations, and provides an interface
 * for querying sync status.
 */ export class BlockSynchronizer {
    node;
    store;
    anchorBlockStore;
    rollbackables;
    l2TipsStore;
    contractSyncService;
    config;
    log;
    isSyncing;
    eventQueue;
    blockStream;
    constructor(node, store, anchorBlockStore, rollbackables, l2TipsStore, contractSyncService, config = {}, bindings){
        this.node = node;
        this.store = store;
        this.anchorBlockStore = anchorBlockStore;
        this.rollbackables = rollbackables;
        this.l2TipsStore = l2TipsStore;
        this.contractSyncService = contractSyncService;
        this.config = config;
        this.eventQueue = new SerialQueue();
        this.log = createLogger('pxe:block_synchronizer', bindings);
        this.blockStream = this.createBlockStream();
        this.eventQueue.start();
    }
    createBlockStream() {
        return new L2BlockStream(this.snapshotBlockStreamSource(), this.l2TipsStore, this, createLogger('pxe:block_stream', this.log.getBindings()), {
            // PXE only tracks chain tips (it anchors on tip events and never replays payloads), so the stream runs
            // in tips-only mode: no block downloads, just the tip events that move the anchor and detect reorgs.
            tipsOnly: true
        });
    }
    /** Handle events emitted by the block stream. Serialized to prevent concurrent mutations to anchor state. */ handleBlockStreamEvent(event) {
        return this.eventQueue.put(async () => {
      try { await this.doHandleBlockStreamEvent(event); }
      catch { this.anchorEventFailed = true; throw new Error('PXE_REORG_ANCHOR_EVENT_FAILED'); }
    });
    }

  anchorEventFailed = false;
  syncTips = undefined;

  syncPass = undefined;

  observeSource(read) {
    const pass = this.syncPass;
    if (!pass) throw new Error('PXE_REORG_ANCHOR_SOURCE_FAILED');
    // Retain abandoned prefetches too. Their failure belongs to this pass,
    // never to a later sync, and must be observed before ownership is released.
    const promise = Promise.resolve().then(read).catch(() => {
      pass.failed = true;
      throw new Error('PXE_REORG_ANCHOR_SOURCE_FAILED');
    });
    pass.pending.add(promise);
    promise.then(() => pass.pending.delete(promise), () => pass.pending.delete(promise));
    return promise;
  }

  async drainSourceReads(pass) {
    while (pass.pending.size) await Promise.allSettled([...pass.pending]);
  }

  snapshotBlockStreamSource() {
    const source = blockStreamSourceFromAztecNode(this.node);
    const tips = source.getL2Tips.bind(source);
    source.getL2Tips = () => this.observeSource(async () => {
      // The stream owns one atomic source plan, and may replace it only at
      // its existing post-prune reread. Never substitute a later live tip in
      // the middle of acknowledging events from that plan.
      this.syncTips = structuredClone(await tips());
      return structuredClone(this.syncTips);
    });
    const block = source.getBlockData.bind(source);
    source.getBlockData = query => this.observeSource(() => block(query));
    const blocks = source.getBlocks.bind(source);
    source.getBlocks = query => this.observeSource(() => blocks(query));
    return source;
  }

  async selectedAnchor() {
    const tips = this.syncTips;
    if (!tips) throw new Error('PXE_REORG_ANCHOR_INCOMPLETE');
    const tier = this.config.syncChainTip ?? 'proposed';
    return tier === 'proposed' ? tips.proposed : tips[tier].block;
  }

  sameAnchor(a, b) {
    return a.number === b.number && a.hash === b.hash;
  }

  async checkedHeader(block) {
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

  async checkedSelectedAnchor() {
    const block = await this.selectedAnchor();
    const tips = await this.node.getChainTips();
    const tier = this.config.syncChainTip ?? 'proposed';
    const live = tier === 'proposed' ? tips.proposed : tips[tier].block;
    if (live.number < block.number ||
        (live.number === block.number && !this.sameAnchor(live, block))) {
      throw new Error('PXE_REORG_ANCHOR_CHANGED');
    }
    // An advancing tier is allowed only while BOTH its current header and the
    // captured pass's exact header are canonical. No orphan cache is authority.
    if (!this.sameAnchor(live, block)) await this.checkedHeader(live);
    await this.checkedHeader(block);
    const afterTips = await this.node.getChainTips();
    const after = tier === 'proposed' ? afterTips.proposed : afterTips[tier].block;
    if (after.number < block.number ||
        (after.number === block.number && !this.sameAnchor(after, block))) {
      throw new Error('PXE_REORG_ANCHOR_CHANGED');
    }
    if (!this.sameAnchor(after, live)) await this.checkedHeader(after);
    // A reorg while checking the newer live header must not bless an orphan
    // captured header. Reauthenticate the exact pass anchor last.
    return { block, header: await this.checkedHeader(block) };
  }

  async checkAcknowledgedSnapshot() {
    const expected = this.syncTips;
    if (!expected) throw new Error('PXE_REORG_ANCHOR_INCOMPLETE');
    const actual = await this.l2TipsStore.getL2Tips();
    if (!this.sameAnchor(actual.proposed, expected.proposed)) throw new Error('PXE_REORG_ANCHOR_INCOMPLETE');
    for (const tier of ['checkpointed', 'proven', 'finalized']) {
      if (!this.sameAnchor(actual[tier].block, expected[tier].block)) {
        throw new Error('PXE_REORG_ANCHOR_INCOMPLETE');
      }
    }
  }

  async doHandleBlockStreamEvent(event) {
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
        const tips = this.syncTips;
        if (!tips || !this.sameAnchor(tips.checkpointed.block, event.checkpointed.block) ||
            !this.sameAnchor(tips.proven.block, event.proven.block) ||
            !this.sameAnchor(target.block, (await this.checkedSelectedAnchor()).block)) {
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
          if (!this.sameAnchor(target.block, (await this.checkedSelectedAnchor()).block)) throw new Error('PXE_REORG_ANCHOR_CHANGED');
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

  /** Updates the anchor block header to the target block */ async updateAnchorBlockHeader(blockHeader) {
        // Whenever the anchor block header is updated, we need to synchronize the private state of contracts again.
        // Therefore, we clear the contract synchronization cache here such that the sync is re-triggered upon new
        // execution.
        this.contractSyncService.wipe();
        // Cached node reads stay correct indefinitely, so this wipe is only about bounding memory growth. An anchor
        // update is the recurring trigger PXE already has.
        this.node.wipeCache();
        this.log.verbose(`Updated pxe last block to ${blockHeader.getBlockNumber()}`, blockHeader.toInspect());
        await this.anchorBlockStore.setHeader(blockHeader);
    }
    /**
   * Syncs PXE and the node by downloading the metadata of the latest blocks, allowing simulations to use
   * recent data (e.g. notes), and handling any reorgs that might have occurred.
   *
   * Note this BlockSynchronizer is designed to let its users control when a synchronization is run,
   * so this component doesn't proactively stay up to date with the blockchain.
   *
   * We do this so PXE can ensure data consistency.
   */ async sync() {
        if (this.isSyncing !== undefined) {
            this.log.debug(`Waiting for the ongoing sync to finish`);
            await this.isSyncing;
            return;
        }
        this.log.debug(`Syncing PXE with the node`);
        // Capture the promise locally so we always await the exact promise we created, even if this.isSyncing is modified
        // between assignment and await (e.g. due to future refactors introducing a yield point).
        const isSyncing = this.doSync();
        this.isSyncing = isSyncing;
        try {
            await isSyncing;
        } finally{
            this.isSyncing = undefined;
        }
    }
    /** Stops the block synchronizer, waiting for any in-progress sync and queued events to complete. */ async stop() {
        await this.isSyncing;
        await this.blockStream.stop();
        await this.eventQueue.end();
    }
    async doSync() {
        let currentHeader;
        try {
            currentHeader = await this.anchorBlockStore.getBlockHeader();
        } catch  {
            this.log.debug('Header is not set, requesting from the node');
        }
        if (!currentHeader) {
            // REFACTOR: We should know the header of the genesis block without having to request it from the node.
            await this.anchorBlockStore.setHeader((await this.node.getBlockData(BlockNumber.ZERO)).header);
        }
        this.anchorEventFailed = false;
    this.syncTips = undefined;
    const pass = { failed: false, pending: new Set() };
    this.syncPass = pass;
    try {
      await this.blockStream.sync();
      await this.drainSourceReads(pass);
      // The stream swallows source/handler errors; a captured plan and exact
      // acknowledgement are required even when its promise resolves.
      if (this.anchorEventFailed || pass.failed) throw new Error('PXE_REORG_ANCHOR_EVENT_FAILED');
      const selected = await this.checkedSelectedAnchor();
      const anchor = await this.anchorBlockStore.getBlockHeader();
      if (anchor.getBlockNumber() !== selected.block.number ||
          (await anchor.hash()).toString() !== selected.block.hash) {
        throw new Error('PXE_REORG_ANCHOR_INCOMPLETE');
      }
      await this.checkAcknowledgedSnapshot();
    } finally {
      await this.drainSourceReads(pass);
      this.syncTips = undefined;
      this.syncPass = undefined;
    }
    }
}
