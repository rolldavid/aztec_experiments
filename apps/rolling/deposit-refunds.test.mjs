// Labelled RPC/journal doubles; real Ethereum ABI and SDK nullifier hashing.
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import * as ethers from 'ethers';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {MerkleTreeId} from '@aztec-labs/stdlib/trees';
import {poseidon2HashWithSeparator} from '@aztec-labs/foundation/crypto/poseidon';
import {siloNullifier, computeSecretHash} from '@aztec-labs/stdlib/hash';
import {BarretenbergSync} from '@aztec-foundation/bb.js';
import {createDepositRefunds} from './deposit-refunds.mjs';
after(async () => { await BarretenbergSync.destroySingleton(); });
const h = n => '0x' + BigInt(n).toString(16).padStart(64,'0');
const address = n => '0x' + BigInt(n).toString(16).padStart(40,'0');
const abi = new ethers.Interface([
  'function getDepositIds(address owner,uint256 offset,uint256 limit) view returns(bytes32[])',
  'function getDeposit(address owner,bytes32 depositId) view returns(tuple(uint128 amount,bytes32 secretHash,bytes32 key,uint256 index,bool refundRequested,uint256 refundBlock))',
  'function requestRefund(bytes32 depositId)',
  'event RefundRequested(address indexed depositor,bytes32 indexed depositId,uint128 amount,bytes32 key,uint256 index)',
]);
function fixture() {
  const owner = address(33), id = h(44), portal = address(22);
  const state = {head:10, amount:100n, requested:false, refundBlock:0n, consumed:false, sends:0,
    reads:[], walletChanged:false, l1Fork:false, l2Fork:false, pending:false, logMutation:null};
  const values = new Map([['existing-withdrawal','unchanged']]);
  const storage = {
    read: async key => values.get(key) ?? null,
    compareAndSwap: async (key, oldValue, nextValue) => {
      assert.equal(values.get(key) ?? null, oldValue);
      values.set(key,nextValue);
    },
  };
  function completedRequest() {
    state.requested = true; state.refundBlock = BigInt(++state.head);
    const event = abi.encodeEventLog(abi.getEvent('RefundRequested'),[owner,id,state.amount,h(55),7n]);
    state.log = {address:portal,...event,blockNumber:state.head,blockHash:h(state.head),transactionHash:h(66),removed:false};
    state.receipt = {hash:h(66),blockNumber:state.head,blockHash:h(state.head),status:1,from:owner,to:portal,logs:[state.log]};
    state.tx = {hash:h(66),from:owner,to:portal,nonce:4,chainId:31337n,value:0n,data:abi.encodeFunctionData('requestRefund',[id])};
  }
  const provider = {
    getNetwork: async () => ({chainId:31337n}),
    getBlock: async number => ({number:number === 'latest' ? state.head : number, hash:state.l1Fork ? h(999) : h(number === 'latest' ? state.head : number)}),
    call: async request => {
      state.reads.push(request);
      assert.equal(request.to,portal);
      const parsed = abi.parseTransaction(request);
      assert.equal(parsed.args.owner.toLowerCase(),owner);
      if (parsed.name === 'getDepositIds') {
        if (state.changeAfterRead) state.l1Fork = true;
        return abi.encodeFunctionResult(parsed.fragment,[parsed.args.offset === 0n ? [id] : []]);
      }
      assert.equal(parsed.args.depositId,id);
      return abi.encodeFunctionResult(parsed.fragment,[[state.amount,id,h(50),1n,state.requested,state.refundBlock]]);
    },
    getLogs: async filter => {
      state.logFilter = filter;
      const log = {...state.log};
      state.logMutation?.(log);
      return [log];
    },
    getTransactionReceipt: async () => state.receipt,
    getTransaction: async () => state.tx,
  };
  const node = {
    getNodeInfo: async () => ({l1ChainId:31337,rollupVersion:1,l1ContractAddresses:{rollupAddress:address(11)}}),
    getChainTips: async () => ({checkpointed:{block:{number:6,hash:h(106)}}}),
    getBlockData: async number => ({blockHash:state.l2Fork ? h(999) : h(100 + number),header:{globalVariables:{blockNumber:number}}}),
    findLeavesIndexes: async (anchor, tree, hashes) => {
      assert.deepEqual(anchor,{number:6}); assert.equal(tree,MerkleTreeId.NULLIFIER_TREE);
      assert.equal(hashes.length,1);
      if (state.nullifierError) throw Error('Node unavailable');
      return [state.consumed ? {data:4n,l2BlockNumber:5,l2BlockHash:h(105)} : undefined];
    },
  };
  const sdk = {Fr,AztecAddress,MerkleTreeId,poseidon2HashWithSeparator,siloNullifier,computeSecretHash,
    createEthereumJournal: async options => {
      state.journal = options;
      assert.equal(options.scope.depositor,owner);
      return {
        inspectRequest: async () => state.pending ? {expected:{kind:'request-refund',depositId:id}} : null,
        recover: async () => { throw Error('Original request unresolved'); },
        send: async intent => {
          await options.contextGuard();
          assert.deepEqual(intent.expected,{kind:'request-refund',amount:'100',depositId:id});
          assert.equal(intent.data,abi.encodeFunctionData('requestRefund',[id]));
          assert.equal(intent.value,'0');
          await options.storage.compareAndSwap('journal',null,'retained-request');
          state.sends++; completedRequest();
          return {outcome:'success',receipt:state.receipt};
        },
      };
    },
  };
  const scope = {account:h(2),chainId:'31337',version:'1',rollup:address(11),board:h(1),portal};
  const options = {sdk,ethers,provider,node,scope,storage,walletSecret:h(3),walletSalt:h(4),
    captureWallet:async () => ({address:owner,chainId:'31337',signer:{},guard:async () => {assert(!state.walletChanged);}}),
    contextGuard:async () => {assert(!state.contextChanged);}};
  return {cap:createDepositRefunds(options),options,state,id,owner,portal,values,completedRequest};
}
test('paged discovery uses contract IDs and distinguishes unclaimed, claimed and returned deposits', async () => {
  const f = fixture();
  let page = await f.cap.list({limit:1});
  assert.equal(page.deposits[0].status,'available'); assert.equal(page.nextOffset,1);
  assert.equal(f.state.logFilter,undefined);
  f.state.consumed = true; page = await f.cap.list(); assert.equal(page.deposits[0].status,'claimed');
  f.state.amount = 0n; page = await f.cap.list(); assert.equal(page.deposits[0].status,'returned');
  assert.equal((await f.cap.list({offset:1})).nextOffset,null);
  assert.equal(f.state.sends,0);
});
test('request uses isolated existing journal and returns public cancellation metadata', async () => {
  const f = fixture(), receipt = await f.cap.request(f.id);
  assert.equal(f.state.sends,1); assert.equal(receipt.depositId,f.id); assert.equal(receipt.sender,f.owner);
  assert.equal(receipt.secretHash,(await computeSecretHash(Fr.ONE)).toString());
  assert.equal(receipt.messageKey,h(55)); assert.equal(receipt.leafIndex,'7');
  assert.equal(f.values.get('existing-withdrawal'),'unchanged');
  assert.equal(f.values.get('rolling-refund-request:journal'),'retained-request');
  assert.equal(f.state.logFilter.fromBlock,f.state.logFilter.toBlock);
  await f.cap.request(f.id); assert.equal(f.state.sends,1,'Already requested must never send again');
});
test('requested deposit is recovered from its one event block without old account data', async () => {
  const f = fixture(); f.completedRequest();
  const receipt = await f.cap.request(f.id);
  assert.equal(receipt.txHash,h(66)); assert.equal(f.state.sends,0);
  assert.deepEqual(f.state.logFilter.topics.slice(1),['0x'+f.owner.slice(2).padStart(64,'0'),f.id]);
  assert.equal(f.values.get('rolling-refund-request:journal'),undefined,'receipt-only lookup writes no journal');
});
for (const defect of ['claimed','returned','wallet','context','node']) test('request refuses '+defect+' before sending', async () => {
  const f = fixture();
  if (defect === 'claimed') f.state.consumed = true;
  if (defect === 'returned') f.state.amount = 0n;
  if (defect === 'wallet') f.state.walletChanged = true;
  if (defect === 'context') f.state.contextChanged = true;
  if (defect === 'node') f.state.nullifierError = true;
  await assert.rejects(f.cap.request(f.id)); assert.equal(f.state.sends,0);
});
test('a reorg during discovery cannot publish the old page', async () => {
  const f = fixture(); f.state.changeAfterRead = true;
  await assert.rejects(f.cap.list(),{code:'ROLLING_CONTEXT_CHANGED'});
});
test('an unresolved saved request cannot be replaced by a new send', async () => {
  const f = fixture(); f.state.pending = true;
  await assert.rejects(f.cap.request(f.id)); assert.equal(f.state.sends,0);
});
for (const defect of ['owner','depositId','block','removed']) test('requested receipt rejects altered '+defect, async () => {
  const f = fixture(); f.completedRequest();
  f.state.logMutation = log => {
    if (defect === 'owner') log.topics = [log.topics[0],h(99),log.topics[2]];
    if (defect === 'depositId') log.topics = [log.topics[0],log.topics[1],h(99)];
    if (defect === 'block') log.blockHash = h(99);
    if (defect === 'removed') log.removed = true;
  };
  await assert.rejects(f.cap.request(f.id)); assert.equal(f.state.sends,0);
});

function multipleDeposits(count=17){
 const f=fixture(),ids=Array.from({length:count},(_,i)=>h(100+i));const calls=[],blocks=[],queries=[];
 f.options.provider.call=async request=>{
  calls.push(request);assert.equal(request.blockTag,10);const parsed=abi.parseTransaction(request);
  if(parsed.name==='getDepositIds')return abi.encodeFunctionResult(parsed.fragment,[ids]);
  const index=ids.indexOf(parsed.args.depositId);assert(index>=0);await f.state.beforeRecord?.(index);
  return abi.encodeFunctionResult(parsed.fragment,[[index===0?0n:100n,ids[index],h(50),1n,false,0n]]);
 };
 const block=f.options.node.getBlockData;f.options.node.getBlockData=async number=>{blocks.push(number);return block(number);};
 f.options.node.findLeavesIndexes=async(anchor,tree,hashes)=>{
  queries.push({anchor,tree,hashes});await f.state.beforeNullifiers?.();
  return hashes.map((_,i)=>i%2===0?{data:BigInt(i),l2BlockNumber:5,l2BlockHash:h(105)}:undefined);
 };
 return {...f,ids,calls,blocks,queries};
}
test('deposit listing batches native nullifiers once and authenticates each unique decision block once',async()=>{
 const f=multipleDeposits(),page=await f.cap.list();assert.equal(page.deposits.length,17);assert.equal(page.deposits[0].status,'returned');
 assert.equal(f.queries.length,1);assert.equal(f.queries[0].hashes.length,16);assert.deepEqual(f.queries[0].anchor,{number:6});assert.equal(f.queries[0].tree,MerkleTreeId.NULLIFIER_TREE);
 for(let i=1;i<17;i++){assert.equal(page.deposits[i].depositId,f.ids[i]);assert.equal(page.deposits[i].status,i%2===1?'claimed':'available');}
 assert.equal(f.blocks.filter(n=>n===5).length,1);assert.equal(f.blocks.filter(n=>n===6).length,2,'fresh snapshot and completion checks remain');assert.equal(f.calls.length,18);assert.equal(f.state.sends,0);
});
test('deposit reads are bounded to eight and all started reads drain before failure releases busy',async()=>{
 const f=multipleDeposits(),gate=Promise.withResolvers(),entered=Promise.withResolvers();let started=0,complete=false;
 f.state.beforeRecord=index=>{started++;if(started===8)entered.resolve();if(index===0)throw Error('record unavailable');return gate.promise;};
 const work=f.cap.list().then(()=>assert.fail('must reject'),error=>{complete=true;assert.match(error.message,/record unavailable/);});
 await entered.promise;assert.equal(started,8);assert.equal(complete,false);await assert.rejects(f.cap.list(),{code:'ROLLING_BUSY'});assert.equal(f.queries.length,0);
 gate.resolve();await work;assert.equal(started,8,'no later batch after rejection');assert.equal(complete,true);f.state.beforeRecord=null;assert.equal((await f.cap.list()).deposits.length,17);
});
test('parallel refund snapshot drains held siblings even on a synchronous failure',async()=>{
 const f=fixture(),gate=Promise.withResolvers(),entered=Promise.withResolvers();let complete=false;
 f.options.provider.getNetwork=()=>{throw Error('network unavailable');};f.options.node.getNodeInfo=async()=>{entered.resolve();await gate.promise;return {};};
 const work=f.cap.list().catch(error=>{complete=true;assert.match(error.message,/network unavailable/);});await entered.promise;
 assert.equal(complete,false);await assert.rejects(f.cap.list(),{code:'ROLLING_BUSY'});gate.resolve();await work;assert.equal(f.state.sends,0);
});
test('batched refund hits reject shape conflicts and forks without publishing a partial page',async()=>{
 for(const defect of ['length','conflict','fork','wallet']){
  const f=multipleDeposits(3),original=f.options.node.findLeavesIndexes;
  f.options.node.findLeavesIndexes=async(...args)=>{const rows=await original(...args);if(defect==='length')return [];if(defect==='conflict')return [{data:1n,l2BlockNumber:5,l2BlockHash:h(105)},{data:2n,l2BlockNumber:5,l2BlockHash:h(999)}];if(defect==='fork')f.state.l2Fork=true;if(defect==='wallet')f.state.walletChanged=true;return rows;};
  await assert.rejects(f.cap.list());assert.equal(f.state.sends,0);
 }
});
test('receipt transaction and block lookup overlap but their rejection drains before refund lock release',async()=>{
 const f=fixture();f.completedRequest();const gate=Promise.withResolvers(),entered=Promise.withResolvers();let started=0,receiptPhase=false,done=false;
 const log=f.options.provider.getLogs,block=f.options.provider.getBlock;f.options.provider.getLogs=async(...args)=>{receiptPhase=true;return log(...args);};
 const mark=()=>{if(++started===3)entered.resolve();};
 f.options.provider.getTransactionReceipt=()=>{mark();throw Error('receipt unavailable');};f.options.provider.getTransaction=async()=>{mark();await gate.promise;return f.state.tx;};
 f.options.provider.getBlock=async number=>{if(receiptPhase){mark();await gate.promise;}return block(number);};
 const work=f.cap.request(f.id).catch(error=>{done=true;assert.match(error.message,/receipt unavailable/);});await entered.promise;assert.equal(started,3);assert.equal(done,false);await assert.rejects(f.cap.list(),{code:'ROLLING_BUSY'});gate.resolve();await work;assert.equal(f.state.sends,0);
});

function journalBoundary(f, hook) {
 const create=f.options.sdk.createEthereumJournal;
 f.options.sdk.createEthereumJournal=async options=>hook(await create(options));
}
test('empty cancellation journal uses one fresh qualification before send and one receipt snapshot after',async()=>{
 const f=fixture();let snapshots=0,atSend,recordsAtSend;const tips=f.options.node.getChainTips;
 f.options.node.getChainTips=async()=>{snapshots++;return tips();};
 journalBoundary(f,journal=>({...journal,send:async intent=>{atSend=snapshots;recordsAtSend=f.state.reads.length;return journal.send(intent);}}));
 await f.cap.request(f.id);assert.equal(atSend,1);assert.equal(recordsAtSend,1);assert.equal(snapshots,2);assert.equal(f.state.reads.length,2);assert.equal(f.state.sends,1);
});
test('held empty journal inspection performs no stale qualification and keeps refund operation owned',async()=>{
 const f=fixture(),entered=Promise.withResolvers(),gate=Promise.withResolvers();let snapshots=0;const tips=f.options.node.getChainTips;
 f.options.node.getChainTips=async()=>{snapshots++;return tips();};
 journalBoundary(f,journal=>({...journal,inspectRequest:async()=>{entered.resolve();await gate.promise;return null;}}));
 const work=f.cap.request(f.id);await entered.promise;assert.equal(snapshots,0);assert.equal(f.state.reads.length,0);
 await assert.rejects(f.cap.list(),{code:'ROLLING_BUSY'});f.state.consumed=true;gate.resolve();
 await assert.rejects(work,{code:'ROLLING_DEPOSIT_NOT_REFUNDABLE'});assert.equal(snapshots,1);assert.equal(f.state.sends,0);
});
for(const defect of ['owner','context','l1','l2'])test('empty journal final cancellation qualification rejects changed '+defect,async()=>{
 const f=fixture();journalBoundary(f,journal=>({...journal,inspectRequest:async()=>{if(defect==='owner')f.state.walletChanged=true;if(defect==='context')f.state.contextChanged=true;return null;}}));
 if(defect==='l1'){const block=f.options.provider.getBlock;f.options.provider.getBlock=async number=>number==='latest'?block(number):{number,hash:h(999)};}
 if(defect==='l2')f.state.l2Fork=true;
 await assert.rejects(f.cap.request(f.id));assert.equal(f.state.sends,0);
});
test('cancellation final snapshot failure drains held reads before releasing operation',async()=>{
 const f=fixture(),entered=Promise.withResolvers(),gate=Promise.withResolvers();let done=false;
 f.options.provider.getNetwork=()=>{throw Error('network unavailable');};f.options.node.getNodeInfo=async()=>{entered.resolve();await gate.promise;return {};};
 const work=f.cap.request(f.id).then(()=>assert.fail('must reject'),error=>{done=true;assert.match(error.message,/network unavailable/);});
 await entered.promise;assert.equal(done,false);await assert.rejects(f.cap.request(f.id),{code:'ROLLING_BUSY'});gate.resolve();await work;assert.equal(f.state.sends,0);
});
test('saved cancellation recovery retains its prior snapshot and refreshes after reconciliation',async()=>{
 const f=fixture();f.state.pending=true;let snapshots=0;const tips=f.options.node.getChainTips;
 f.options.node.getChainTips=async()=>{snapshots++;return tips();};
 journalBoundary(f,journal=>({...journal,recover:async options=>{assert.deepEqual(options,{retry:false,wait:true});assert.equal(snapshots,1);f.completedRequest();return {outcome:'success'};}}));
 const receipt=await f.cap.request(f.id);assert.equal(receipt.txHash,h(66));assert.equal(snapshots,2);assert.equal(f.state.sends,0);
});
test('saved cancellation holds ownership through uncertain recovery and does not send again',async()=>{
 const f=fixture(),entered=Promise.withResolvers(),gate=Promise.withResolvers();f.state.pending=true;let done=false;
 journalBoundary(f,journal=>({...journal,recover:async options=>{assert.deepEqual(options,{retry:false,wait:true});entered.resolve();await gate.promise;throw Error('Original request unresolved');}}));
 const work=f.cap.request(f.id).catch(error=>{done=true;assert.match(error.message,/unresolved/);});await entered.promise;assert.equal(done,false);await assert.rejects(f.cap.list(),{code:'ROLLING_BUSY'});gate.resolve();await work;assert.equal(f.state.sends,0);
});
