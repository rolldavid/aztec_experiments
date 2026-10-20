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
    check(String((await read(() => provider.getNetwork())).chainId) === fixed.chainId);
    const info = await read(() => node.getNodeInfo());
    check(String(info.l1ChainId) === fixed.chainId && String(info.rollupVersion) === fixed.version &&
      lower(info.l1ContractAddresses.rollupAddress) === fixed.rollup);
    const l1 = await read(() => provider.getBlock('latest'));
    check(Number.isSafeInteger(l1?.number) && l1.number >= 0);
    hash(l1.hash);
    const tip = (await read(() => node.getChainTips())).checkpointed?.block;
    check(Number.isSafeInteger(tip?.number) && tip.number > 0);
    const anchor = {l1: {number:l1.number, hash:hash(l1.hash)}, l2: {number:tip.number, hash:hash(tip.hash)}};
    await recheck(session, anchor);
    return anchor;
  }
  async function recheck({read}, anchor) {
    const l1 = await read(() => provider.getBlock(anchor.l1.number));
    const l2 = await read(() => node.getBlockData(anchor.l2.number));
    check(hash(l1?.hash) === anchor.l1.hash && hash(l2?.blockHash) === anchor.l2.hash &&
      Number(l2?.header?.globalVariables?.blockNumber) === anchor.l2.number, 'ROLLING_CONTEXT_CHANGED');
  }
  async function call(session, anchor, name, args) {
    const data = abi.encodeFunctionData(name,args);
    const result = await session.read(() => provider.call({to:fixed.portal, data, blockTag:anchor.l1.number}));
    return abi.decodeFunctionResult(name,result)[0];
  }
  async function inspect(session, anchor, id) {
    depositId(id);
    const record = await call(session, anchor, 'getDeposit', [session.owner,id]);
    check(record.length === 6 && typeof record.amount === 'bigint' && record.amount >= 0n && record.amount < 2n ** 96n);
    check(hash(record.secretHash) === id && typeof record.refundRequested === 'boolean');
    check(record.refundBlock >= 0n && record.refundBlock <= BigInt(anchor.l1.number));
    check(record.refundRequested === (record.refundBlock > 0n));
    let decision = null;
    if (record.amount > 0n) {
      const inner = await sdk.poseidon2HashWithSeparator([
        new sdk.Fr(BigInt(fixed.portal)), new sdk.Fr(BigInt(session.owner)), sdk.Fr.fromHexString(id),
      ],0x42420104);
      const siloed = await sdk.siloNullifier(sdk.AztecAddress.fromStringUnsafe(fixed.board),inner);
      const found = await session.read(() => node.findLeavesIndexes({number:anchor.l2.number},sdk.MerkleTreeId.NULLIFIER_TREE,[siloed]));
      check(Array.isArray(found) && found.length === 1);
      if (found[0] !== undefined) {
        const hit = found[0];
        check(typeof hit.data === 'bigint' && hit.data >= 0n && Number.isSafeInteger(hit.l2BlockNumber) && hit.l2BlockNumber > 0 && hit.l2BlockNumber <= anchor.l2.number);
        decision = {blockNumber:hit.l2BlockNumber, blockHash:hash(hit.l2BlockHash)};
        const block = await session.read(() => node.getBlockData(decision.blockNumber));
        check(hash(block?.blockHash) === decision.blockHash);
      }
    }
    const status = record.amount === 0n ? 'returned' : record.refundRequested ? 'requested' : decision ? 'claimed' : 'available';
    return {depositId:id, owner:session.owner, amount:String(record.amount), status,
      refundBlock:Number(record.refundBlock), decision};
  }
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
    const receipt = await session.read(() => provider.getTransactionReceipt(txHash));
    const tx = await session.read(() => provider.getTransaction(txHash));
    const block = await session.read(() => provider.getBlock(entry.refundBlock));
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
        const deposits = [];
        for (const id of ids) deposits.push(await inspect(session,anchor,depositId(lower(id))));
        await recheck(session,anchor);
        return {owner:session.owner, deposits, nextOffset:ids.length === limit ? offset + limit : null, anchor};
      });
    },
    request(id) {
      return exclusive(async () => {
        depositId(id);
        const session = await selectedWallet();
        let anchor = await snapshot(session), entry = await inspect(session,anchor,id);
        await recheck(session,anchor);
        if (entry.status === 'requested') return requestedReceipt(session,anchor,entry);
        check(entry.status === 'available','ROLLING_DEPOSIT_NOT_REFUNDABLE');
        const journal = await sdk.createEthereumJournal({storage:journalStorage, walletSecret, walletSalt,
          scope:{...fixed,depositor:session.owner}, provider, signer:session.wallet.signer, contextGuard:session.guard});
        const saved = await journal.inspectRequest();
        if (saved) {
          const result = await journal.recover({retry:false,wait:true});
          check(['success','reverted','replaced'].includes(result.outcome));
          if (result.outcome === 'success' && saved.expected.kind === 'request-refund' && saved.expected.depositId === id) {
            anchor = await snapshot(session); entry = await inspect(session,anchor,id);
            return requestedReceipt(session,anchor,entry);
          }
        }
        // Recheck eligibility immediately before asking the existing journal to sign.
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
