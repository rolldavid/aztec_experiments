// Optional Ethereum deposit refunds. The current account supplies journal custody;
// the original private account and its claim secret are never required.
export function createDepositRefunds({sdk, ethers, provider, node, scope, storage,
  walletSecret, walletSalt, captureWallet, contextGuard}) {
  const fixed = structuredClone(scope);
  const abi = new ethers.Interface([
    'function getDepositIds(address owner,uint256 offset,uint256 limit) view returns(bytes32[])',
    'function getDeposit(address owner,bytes32 depositId) view returns(tuple(uint128 amount,bytes32 secretHash,bytes32 key,uint256 index,bool refundRequested,uint256 refundBlock))',
    'function requestRefund(bytes32 depositId)',
    'event RefundRequested(address indexed depositor,bytes32 indexed depositId,uint128 amount,bytes32 key,uint256 index)',
  ]);
  const lower = value => String(value).toLowerCase();
  const check = (condition, code = 'ROLLING_DEPOSIT_REFUND_UNAVAILABLE') => {
    if (!condition) throw Object.assign(new Error('The deposit refund could not be verified.'), {code});
  };
  const hash = value => {
    const text = lower(value);
    check(/^0x[0-9a-f]{64}$/.test(text));
    return text;
  };
  const depositId = value => {
    check(typeof value === 'string' && hash(value) === value && BigInt(value) > 0n);
    check(sdk.Fr.fromHexString(value).toString() === value);
    return value;
  };
  const journalStorage = {
    read: key => storage.read('rolling-refund-request:' + key),
    compareAndSwap: (key, oldValue, nextValue) => storage.compareAndSwap('rolling-refund-request:' + key, oldValue, nextValue),
  };
  // Drain every started read before releasing the account operation, including
  // synchronous failures. Bounded batches avoid flooding provider/extension RPC.
  const together = async reads => {
    const results = await Promise.allSettled(reads.map(read => Promise.resolve().then(read)));
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    return results.map(result => result.value);
  };
  const batches = async (items, read) => {
    const values = [];
    for (let offset = 0; offset < items.length; offset += 8)
      values.push(...await together(items.slice(offset,offset + 8).map((item,index) => () => read(item,offset + index))));
    return values;
  };
  let busy = false;
  async function exclusive(operation) {
    check(!busy, 'ROLLING_BUSY');
    busy = true;
    try { return await operation(); } finally { busy = false; }
  }
  async function selectedWallet() {
    await contextGuard();
    const wallet = await captureWallet();
    await wallet.guard();
    const owner = lower(wallet.address);
    check(/^0x[0-9a-f]{40}$/.test(owner) && BigInt(owner) > 0n && String(wallet.chainId) === fixed.chainId);
    const guard = async () => {
      await contextGuard();
      await wallet.guard();
      check(lower(wallet.address) === owner && String(wallet.chainId) === fixed.chainId);
    };
    const read = async operation => {
      await guard();
      const value = await operation();
      await guard();
      return value;
    };
    return {wallet, owner, guard, read};
  }
  async function snapshot(session) {
    const {read} = session;
    const [network,info,l1,tips] = await together([
      () => read(() => provider.getNetwork()), () => read(() => node.getNodeInfo()),
      () => read(() => provider.getBlock('latest')), () => read(() => node.getChainTips()),
    ]);
    check(String(network.chainId) === fixed.chainId);
    check(String(info.l1ChainId) === fixed.chainId && String(info.rollupVersion) === fixed.version &&
      lower(info.l1ContractAddresses.rollupAddress) === fixed.rollup);
    check(Number.isSafeInteger(l1?.number) && l1.number >= 0);
    hash(l1.hash);
    const tip = tips.checkpointed?.block;
    check(Number.isSafeInteger(tip?.number) && tip.number > 0);
    const anchor = {l1: {number:l1.number, hash:hash(l1.hash)}, l2: {number:tip.number, hash:hash(tip.hash)}};
    await recheck(session, anchor);
    return anchor;
  }
  async function recheck({read}, anchor) {
    const [l1,l2] = await together([() => read(() => provider.getBlock(anchor.l1.number)),
      () => read(() => node.getBlockData(anchor.l2.number))]);
    check(hash(l1?.hash) === anchor.l1.hash && hash(l2?.blockHash) === anchor.l2.hash &&
      Number(l2?.header?.globalVariables?.blockNumber) === anchor.l2.number, 'ROLLING_CONTEXT_CHANGED');
  }
  async function call(session, anchor, name, args) {
    const data = abi.encodeFunctionData(name,args);
    const result = await session.read(() => provider.call({to:fixed.portal, data, blockTag:anchor.l1.number}));
    return abi.decodeFunctionResult(name,result)[0];
  }
  async function inspectMany(session, anchor, ids) {
    ids.forEach(depositId);
    const records = await batches(ids, id => call(session,anchor,'getDeposit',[session.owner,id]));
    for (const [index,record] of records.entries()) {
      check(record.length === 6 && typeof record.amount === 'bigint' && record.amount >= 0n && record.amount < 2n ** 96n);
      check(hash(record.secretHash) === ids[index] && typeof record.refundRequested === 'boolean');
      check(record.refundBlock >= 0n && record.refundBlock <= BigInt(anchor.l1.number));
      check(record.refundRequested === (record.refundBlock > 0n));
    }
    const funded = records.map((record,index) => record.amount > 0n ? index : -1).filter(index => index >= 0);
    const nullifiers = await batches(funded, async index => {
      const inner = await sdk.poseidon2HashWithSeparator([
        new sdk.Fr(BigInt(fixed.portal)), new sdk.Fr(BigInt(session.owner)), sdk.Fr.fromHexString(ids[index]),
      ],0x42420104);
      return sdk.siloNullifier(sdk.AztecAddress.fromStringUnsafe(fixed.board),inner);
    });
    const found = nullifiers.length ? await session.read(() => node.findLeavesIndexes(
      {number:anchor.l2.number},sdk.MerkleTreeId.NULLIFIER_TREE,nullifiers)) : [];
    check(Array.isArray(found) && found.length === funded.length);
    const decisions = new Map(), blocks = new Map();
    for (const [offset,hit] of found.entries()) {
      if (hit === undefined) continue;
      check(typeof hit.data === 'bigint' && hit.data >= 0n && Number.isSafeInteger(hit.l2BlockNumber) && hit.l2BlockNumber > 0 && hit.l2BlockNumber <= anchor.l2.number);
      const decision = {blockNumber:hit.l2BlockNumber,blockHash:hash(hit.l2BlockHash)};
      check(!blocks.has(decision.blockNumber) || blocks.get(decision.blockNumber) === decision.blockHash);
      blocks.set(decision.blockNumber,decision.blockHash);decisions.set(funded[offset],decision);
    }
    await batches([...blocks],async ([number,expectedHash]) => {
      const block = await session.read(() => node.getBlockData(number));
      check(hash(block?.blockHash) === expectedHash);
    });
    return records.map((record,index) => {
      const decision = decisions.get(index) ?? null;
      const status = record.amount === 0n ? 'returned' : record.refundRequested ? 'requested' : decision ? 'claimed' : 'available';
      return {depositId:ids[index],owner:session.owner,amount:String(record.amount),status,
        refundBlock:Number(record.refundBlock),decision};
    });
  }
  const inspect = async (session,anchor,id) => (await inspectMany(session,anchor,[id]))[0];
  async function requestedReceipt(session, anchor, entry) {
    check(entry.status === 'requested' && entry.refundBlock > 0);
    const topic = abi.getEvent('RefundRequested').topicHash;
    const ownerTopic = '0x' + session.owner.slice(2).padStart(64,'0');
    const logs = await session.read(() => provider.getLogs({address:fixed.portal,
      fromBlock:entry.refundBlock, toBlock:entry.refundBlock, topics:[topic,ownerTopic,entry.depositId]}));
    check(Array.isArray(logs) && logs.length === 1);
    const log = logs[0];
    check(!log.removed && lower(log.address) === fixed.portal && log.blockNumber === entry.refundBlock);
    const event = abi.parseLog(log)?.args;
    check(event && lower(event.depositor) === session.owner && hash(event.depositId) === entry.depositId && String(event.amount) === entry.amount);
    const txHash = hash(log.transactionHash);
    const [receipt,tx,block] = await together([
      () => session.read(() => provider.getTransactionReceipt(txHash)),
      () => session.read(() => provider.getTransaction(txHash)),
      () => session.read(() => provider.getBlock(entry.refundBlock)),
    ]);
    check(receipt?.status === 1 && hash(receipt.hash) === txHash && receipt.blockNumber === entry.refundBlock &&
      hash(receipt.blockHash) === hash(log.blockHash) && hash(block?.hash) === hash(log.blockHash));
    check(hash(tx?.hash) === txHash && lower(tx.from) === session.owner && lower(receipt.from) === session.owner &&
      lower(tx.to) === fixed.portal && lower(receipt.to) === fixed.portal && String(tx.chainId) === fixed.chainId && String(tx.value) === '0');
    check(lower(tx.data) === abi.encodeFunctionData('requestRefund',[entry.depositId]).toLowerCase() && Number.isSafeInteger(tx.nonce) && tx.nonce >= 0);
    const matching = receipt.logs.filter(item => lower(item.address) === fixed.portal && lower(item.topics?.[0]) === lower(topic));
    check(matching.length === 1 && JSON.stringify([...matching[0].topics]) === JSON.stringify([...log.topics]) && lower(matching[0].data) === lower(log.data));
    const result = {txHash, blockHash:hash(receipt.blockHash), blockNumber:receipt.blockNumber,
      sender:session.owner, nonce:String(tx.nonce), amount:entry.amount, depositId:entry.depositId,
      messageKey:hash(event.key), leafIndex:String(event.index), secretHash:(await sdk.computeSecretHash(sdk.Fr.ONE)).toString()};
    await recheck(session,anchor);
    return result;
  }
  return Object.freeze({
    list({offset = 0, limit = 20} = {}) {
      return exclusive(async () => {
        check(Number.isSafeInteger(offset) && offset >= 0 && Number.isSafeInteger(limit) && limit > 0 && limit <= 100);
        const session = await selectedWallet(), anchor = await snapshot(session);
        const ids = await call(session,anchor,'getDepositIds',[session.owner,offset,limit]);
        check(Array.isArray(ids) && ids.length <= limit && new Set(ids.map(lower)).size === ids.length);
        const deposits = await inspectMany(session,anchor,ids.map(id => depositId(lower(id))));
        await recheck(session,anchor);
        return {owner:session.owner, deposits, nextOffset:ids.length === limit ? offset + limit : null, anchor};
      });
    },
    request(id) {
      return exclusive(async () => {
        depositId(id);
        const session = await selectedWallet();
        let anchor, entry;
        const journal = await sdk.createEthereumJournal({storage:journalStorage, walletSecret, walletSalt,
          scope:{...fixed,depositor:session.owner}, provider, signer:session.wallet.signer, contextGuard:session.guard});
        const saved = await journal.inspectRequest();
        if (saved) {
          // Saved requests retain their original eligibility/reconciliation boundary.
          anchor = await snapshot(session); entry = await inspect(session,anchor,id);
          await recheck(session,anchor);
          if (entry.status === 'requested') return requestedReceipt(session,anchor,entry);
          check(entry.status === 'available','ROLLING_DEPOSIT_NOT_REFUNDABLE');
          const result = await journal.recover({retry:false,wait:true});
          check(['success','reverted','replaced'].includes(result.outcome));
          if (result.outcome === 'success' && saved.expected.kind === 'request-refund' && saved.expected.depositId === id) {
            anchor = await snapshot(session); entry = await inspect(session,anchor,id);
            return requestedReceipt(session,anchor,entry);
          }
        }
        // Qualify immediately before signing; an empty journal needs no earlier duplicate snapshot.
        anchor = await snapshot(session); entry = await inspect(session,anchor,id);
        await recheck(session,anchor);
        if (entry.status === 'requested') return requestedReceipt(session,anchor,entry);
        check(entry.status === 'available','ROLLING_DEPOSIT_NOT_REFUNDABLE');
        await journal.send({data:abi.encodeFunctionData('requestRefund',[id]),value:'0',
          expected:{kind:'request-refund',amount:entry.amount,depositId:id}});
        anchor = await snapshot(session); entry = await inspect(session,anchor,id);
        return requestedReceipt(session,anchor,entry);
      });
    },
  });
}
