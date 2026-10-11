// Labelled RPC doubles; actual pinned ABI decoding, SDK hashes, 36-level Merkle
// paths, deterministic FPC artifact and custody helpers. No funds, proofs or services.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {AbiCoder,Interface,encodeBytes32String,getBytes} from 'ethers';
import {jsonStringify} from '@aztec-labs/foundation/json-rpc';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {EthAddress} from '@aztec-labs/foundation/eth-address';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {BlockHash,BlockParameterSchema} from '@aztec-labs/stdlib/block';
import {L1Actor,L2Actor,L1ToL2Message} from '@aztec-labs/stdlib/messaging';
import {SiblingPath} from '@aztec-labs/foundation/trees';
import {poseidon2HashWithSeparator} from '@aztec-labs/foundation/crypto/poseidon';
import {computeSecretHash} from '@aztec-labs/stdlib/hash';
import {DomainSeparator,L1_TO_L2_MSG_TREE_HEIGHT} from '@aztec-labs/constants';
import {ProtocolContractAddress} from '@aztec-labs/protocol-contracts';
import {BarretenbergSync} from '@aztec-foundation/bb.js';
import {deriveBoardDepositSecret} from '../deposit-custody.mjs';
import {derivePrivateFeeInstance,derivePrivateFeeBridgeSecret} from '../private-fee-client.mjs';
import {sha256Field} from '../protocol-commitments.mjs';
import {prepareFundingClaim} from './funding-receipts.mjs';
const h=n=>'0x'+BigInt(n).toString(16).padStart(64,'0'),addr=n=>'0x'+BigInt(n).toString(16).padStart(40,'0');
const common=['function ROLLUP() view returns(address)','function VERSION() view returns(uint256)'];
const boardAbi=new Interface([...common,'function L1_CHAIN_ID() view returns(uint256)','function L2_CONTRACT() view returns(bytes32)','function deposit(bytes32 secretHash) payable','event Deposited(address indexed depositor,uint128 amount,bytes32 secretHash,bytes32 key,uint256 index)']);
const feeAbi=new Interface([...common,'function UNDERLYING() view returns(address)','function L2_TOKEN_ADDRESS() view returns(bytes32)','function depositToAztecPublic(bytes32 to,uint256 amount,bytes32 secretHash)','event DepositToAztecPublic(bytes32 indexed to,uint256 amount,bytes32 secretHash,bytes32 key,uint256 index)']);
const bokAbi=new Interface(['function token() view returns(address)','function escrow() view returns(bytes32)','function version() view returns(uint256)','function chainId() view returns(uint256)','function inbox() view returns(address)','function outbox() view returns(address)','function deposit(bytes32 account,uint128 amount,bytes32 secretHash)','event Deposited(bytes32 indexed account,uint128 amount,bytes32 key,uint256 index)']);
const rollupAbi=new Interface(['function getInbox() view returns(address)','function getOutbox() view returns(address)']);
let artifact,canonical;
before(async()=>{artifact=JSON.parse(fs.readFileSync(new URL('../../apps/src/billboard/private_fee_artifact.json',import.meta.url)));canonical=await derivePrivateFeeInstance(artifact);});
after(async()=>{await BarretenbergSync.destroySingleton();});
async function fixture(kind='collateral') {
 const s={chainId:'31337',version:'2',rollup:addr(10),portal:addr(11),recipient:kind==='private-fee'?canonical.address.toString():h(12),...(kind==='collateral'?{}:{token:addr(13)})};
 const r={txHash:h(100),blockHash:h(101),blockNumber:6,sender:addr(14),nonce:'3',amount:'5000',leafIndex:'9',messageKey:null,secretHash:null};
 const owner=h(20),walletSecret=h(21),walletSalt=h(22),salt=h(23);let secret,content,account,secrets;
 if(kind==='collateral') {
  secrets={walletSecret,walletSalt};const derived=await deriveBoardDepositSecret({...secrets,owner,nonce:r.nonce,scope:{l1ChainId:s.chainId,rollupVersion:s.version,rollupAddress:s.rollup,boardAddress:s.recipient,portalAddress:s.portal,depositor:r.sender}});secret=derived.secret;
  content=await sha256Field(getBytes(AbiCoder.defaultAbiCoder().encode(['bytes32','uint256','uint256','address','bytes32','uint256','address','uint256'],[encodeBytes32String('AZTEC_BB_CLAIM_V1'),1,s.chainId,s.portal,s.recipient,s.version,r.sender,r.amount])));
 } else if(kind==='private-fee') {
  secrets={walletSecret};const derivedSalt=await poseidon2HashWithSeparator([Fr.fromString(walletSecret),new Fr(BigInt(s.chainId)),new Fr(BigInt(s.version)),Fr.fromString(s.recipient),new Fr(BigInt(r.sender)),new Fr(BigInt(r.nonce))],0x42424601);
  secret=(await derivePrivateFeeBridgeSecret({salt:derivedSalt,owner})).toString();
  content=await sha256Field(getBytes(new Interface(['function claim(bytes32,uint256)']).encodeFunctionData('claim',[s.recipient,r.amount])));
 } else {
  secrets={recipientSalt:salt,bridgeSecret:h(24)};secret=secrets.bridgeSecret;
  account=(await poseidon2HashWithSeparator([new Fr(BigInt(s.chainId)),new Fr(BigInt(s.portal)),Fr.fromString(s.recipient),new Fr(BigInt(s.version)),Fr.fromString(owner),Fr.fromString(salt)],0x424b4301)).toString();
  content=await sha256Field(getBytes(AbiCoder.defaultAbiCoder().encode(['bytes32','uint256','address','bytes32','uint256','bytes32','uint128'],[encodeBytes32String('PLUGIN_CREDIT_V1'),s.chainId,s.portal,s.recipient,s.version,account,r.amount])));
 }
 r.secretHash=(await computeSecretHash(Fr.fromString(secret))).toString();
 const message=new L1ToL2Message(new L1Actor(EthAddress.fromString(s.portal),Number(s.chainId)),new L2Actor(new AztecAddress(Fr.fromString(kind==='private-fee'?ProtocolContractAddress.FeeJuice.toString():s.recipient)),Number(s.version)),Fr.fromString(content),Fr.fromString(r.secretHash),new Fr(BigInt(r.leafIndex)));
 r.messageKey=message.hash().toString();
 const siblings=Array.from({length:L1_TO_L2_MSG_TREE_HEIGHT},(_,i)=>new Fr(BigInt(200+i)));
 let root=message.hash(),cursor=BigInt(r.leafIndex);
 for(const sibling of siblings){root=await poseidon2HashWithSeparator(cursor&1n?[sibling,root]:[root,sibling],DomainSeparator.MERKLE_HASH);cursor>>=1n;}
 const anchor={number:3,hash:h(300),root:root.toString()};
 const abi=kind==='collateral'?boardAbi:kind==='private-fee'?feeAbi:bokAbi;
 const args=kind==='collateral'?[r.secretHash]:kind==='private-fee'?[s.recipient,r.amount,r.secretHash]:[account,r.amount,r.secretHash];
 const eventArgs=kind==='collateral'?[r.sender,r.amount,r.secretHash,r.messageKey,r.leafIndex]:kind==='private-fee'?[s.recipient,r.amount,r.secretHash,r.messageKey,r.leafIndex]:[account,r.amount,r.messageKey,r.leafIndex];
 const eventName=kind==='private-fee'?'DepositToAztecPublic':'Deposited';
 const event=abi.encodeEventLog(abi.getEvent(eventName),eventArgs);
 const state={reads:[],guardCalls:0,receipt:{hash:r.txHash,blockHash:r.blockHash,blockNumber:r.blockNumber,from:r.sender,to:s.portal,status:1,logs:[{address:s.portal,...event}]},
  tx:{hash:r.txHash,from:r.sender,to:s.portal,chainId:BigInt(s.chainId),nonce:Number(r.nonce),value:kind==='collateral'?BigInt(r.amount):0n,data:abi.encodeFunctionData(kind==='private-fee'?'depositToAztecPublic':'deposit',args)},
  blockHash:r.blockHash,finalized:{number:8,hash:h(102)},l2Hash:anchor.hash,root:anchor.root,witness:[BigInt(r.leafIndex),new SiblingPath(L1_TO_L2_MSG_TREE_HEIGHT,siblings.map(x=>x.toBuffer()))],
  bindings:{ROLLUP:s.rollup,VERSION:2n,L1_CHAIN_ID:31337n,L2_CONTRACT:s.recipient,UNDERLYING:s.token,L2_TOKEN_ADDRESS:ProtocolContractAddress.FeeJuice.toString(),token:s.token,escrow:s.recipient,version:2n,chainId:31337n,inbox:addr(40),outbox:addr(41),getInbox:addr(40),getOutbox:addr(41)}};
 const node={getNodeInfo:async()=>({l1ChainId:31337,rollupVersion:2,l1ContractAddresses:{rollupAddress:s.rollup,feeJuicePortalAddress:s.portal,feeJuiceAddress:s.token}}),
  getContract:async()=>canonical,
  getBlockData:async parameter=>{assert.equal(parameter,anchor.number,'Canonical lookup must be by height, not orphan hash');state.reads.push('l2');return {blockHash:BlockHash.fromString(state.l2Hash),header:{globalVariables:{blockNumber:3},state:{l1ToL2MessageTree:{root:Fr.fromString(state.root)}}}};},
  getL1ToL2MessageMembershipWitness:async(parameter,key)=>{BlockParameterSchema.parse(JSON.parse(jsonStringify(parameter)));assert(parameter.hash instanceof BlockHash);assert.equal(key.toString(),r.messageKey);state.reads.push('witness');return state.witness;}};
 const provider={getNetwork:async()=>({chainId:31337n}),getTransactionReceipt:async()=>state.receipt,getTransaction:async()=>state.tx,
  getBlock:async number=>{state.reads.push('l1');return number==='finalized'||number===8?state.finalized:{number,hash:state.blockHash};},
  call:async request=>{const contract=request.to===s.rollup?rollupAbi:abi;const name=contract.parseTransaction(request).name;state.reads.push([name,request.blockTag]);return contract.encodeFunctionResult(name,[state.bindings[name]]);}};
 const input={kind,scope:s,receipt:r,anchor,owner,secrets,privateFeeArtifact:artifact,node,ethProvider:provider,contextGuard:async()=>{state.guardCalls++;if(state.guardError)throw Error('PRIVATE_SENTINEL');}};
 return {input,state,abi,eventArgs,eventName,secret,content};
}
for(const kind of ['collateral','private-fee','bok'])test(`labelled RPC ${kind}: real ABI/hash/witness produces private immutable claim and public evidence`,async()=>{
 const f=await fixture(kind),result=await prepareFundingClaim(f.input);assert.equal(result.status,'claim-ready');assert.equal(result.evidence.content,f.content);
 assert(Object.isFrozen(result.claim));assert(Object.isFrozen(result.evidence.l1));assert(!JSON.stringify(result.evidence).includes(f.secret));assert(!JSON.stringify(result.evidence).includes(f.input.owner));
 if(kind==='collateral'){assert.equal(result.claim.method,'claim_deposit');assert.deepEqual(result.claim.args,[f.input.receipt.sender,'5000',f.secret,'9']);}
 if(kind==='bok')assert.deepEqual(result.claim.args,['5000',f.input.secrets.recipientSalt,f.secret,'9']);
 if(kind==='private-fee'){assert.equal(result.claim.kind,'private-fee-bridge');assert.equal(result.claim.bridgeClaim.amount,'5000');assert.equal(result.claim.bridgeClaim.leafIndex,'9');}
 assert(f.state.guardCalls>10);assert(f.state.reads.filter(x=>Array.isArray(x)&&x[1]===6).length>=4);
});
test('custody-store record is verified against public secret commitment',async()=>{const f=await fixture();let count=0;f.input.claimStore={load:async(scope,hash)=>{count++;assert.equal(scope.depositor,f.input.receipt.sender);return {schemaVersion:1,secret:f.secret,secretHash:hash};}};assert.equal((await prepareFundingClaim(f.input)).status,'claim-ready');assert.equal(count,1);f.input.claimStore.load=async()=>({secret:h(7),secretHash:f.input.receipt.secretHash});await assert.rejects(()=>prepareFundingClaim(f.input),{code:'ROLLING_FUNDING_MISMATCH'});});
test('absence and not-yet-finalized never prepare or retry claims',async()=>{const f=await fixture();f.state.receipt=null;assert.deepEqual(await prepareFundingClaim(f.input),{status:'absent'});const g=await fixture();g.state.finalized.number=5;assert.deepEqual(await prepareFundingClaim(g.input),{status:'waiting',reason:'l1-finality'});assert(!g.state.reads.includes('witness'));});
test('L2 delivery pending differs from reverted L1',async()=>{const f=await fixture();f.state.witness=undefined;assert.deepEqual(await prepareFundingClaim(f.input),{status:'waiting',reason:'l2-delivery'});const g=await fixture();g.state.receipt.status=0;assert.deepEqual(await prepareFundingClaim(g.input),{status:'reverted'});});
for(const [label,change,code] of [
 ['L1 reorg',f=>{f.state.blockHash=h(500);},'REORG'],
 ['L2 orphan still addressable by hash',f=>{f.state.l2Hash=h(501);},'REORG'],
 ['wrong portal',f=>{f.state.bindings.ROLLUP=addr(99);},'MISMATCH'],
 ['wrong sender',f=>{f.state.tx.from=addr(99);},'MISMATCH'],
 ['wrong nonce',f=>{f.state.tx.nonce=9;},'MISMATCH'],
 ['wrong leaf',f=>{f.state.witness[0]=10n;},'MISMATCH'],
 ['wrong path',f=>{f.state.witness[1]=new SiblingPath(L1_TO_L2_MSG_TREE_HEIGHT,Array(L1_TO_L2_MSG_TREE_HEIGHT).fill(Fr.ZERO.toBuffer()));},'MISMATCH'],
 ['wrong secret account',f=>{f.input.owner=h(77);},'MISMATCH'],
 ['duplicate receipt event',f=>{f.state.receipt.logs.push(f.state.receipt.logs[0]);},'MISMATCH'],
 ['RPC private error',f=>{f.input.node.getNodeInfo=async()=>{throw Error('PRIVATE_SENTINEL');};},'UNKNOWN'],
 ['context changed',f=>{f.state.guardError=true;},'UNKNOWN'],
])test(`reject ${label} without raw diagnostic or claim`,async()=>{const f=await fixture();change(f);await assert.rejects(()=>prepareFundingClaim(f.input),error=>{assert.equal(error.code,'ROLLING_FUNDING_'+code);assert(!JSON.stringify(error).includes('PRIVATE_SENTINEL'));return true;});});
test('Bok binds recipient commitment, token and exact hidden-secret calldata',async()=>{
 for(const mutate of [f=>{f.input.owner=h(25);},f=>{f.state.bindings.token=addr(99);},f=>{f.state.tx.data=f.abi.encodeFunctionData('deposit',[f.eventArgs[0],'5000',h(9)]);}]){const f=await fixture('bok');mutate(f);await assert.rejects(()=>prepareFundingClaim(f.input),{code:'ROLLING_FUNDING_MISMATCH'});}
});
test('FPC recovery rejects foreign owner, token and altered public amount',async()=>{
 for(const mutate of [f=>{f.input.owner=h(25);},f=>{f.state.bindings.UNDERLYING=addr(99);},f=>{f.input.receipt.amount='5001';}]){const f=await fixture('private-fee');mutate(f);await assert.rejects(()=>prepareFundingClaim(f.input));}
});
test('reorg after witness invalidates ready result',async()=>{const f=await fixture();const original=f.input.node.getL1ToL2MessageMembershipWitness;f.input.node.getL1ToL2MessageMembershipWitness=async(...args)=>{const result=await original(...args);f.state.blockHash=h(999);return result;};await assert.rejects(()=>prepareFundingClaim(f.input),{code:'ROLLING_FUNDING_REORG'});});
test('input descriptors reject accessors and snapshots resist changes during awaits',async()=>{const f=await fixture();Object.defineProperty(f.input.receipt,'amount',{get:()=>{throw Error('PRIVATE_SENTINEL');},enumerable:true});await assert.rejects(()=>prepareFundingClaim(f.input),{code:'ROLLING_FUNDING_INVALID'});
 const g=await fixture();const old=g.input.ethProvider.getNetwork;g.input.ethProvider.getNetwork=async()=>{g.input.receipt.amount='1';g.input.secrets.walletSecret=h(99);return old();};assert.equal((await prepareFundingClaim(g.input)).claim.args[1],'5000');});
test('canonical finalized block changing during verification is not accepted',async()=>{const f=await fixture();const original=f.input.ethProvider.getBlock;f.input.ethProvider.getBlock=async n=>n===8?{number:8,hash:h(400)}:original(n);await assert.rejects(()=>prepareFundingClaim(f.input),{code:'ROLLING_FUNDING_REORG'});});

test('unknown provider error with hostile getters is safely projected',async()=>{const f=await fixture();const error=new Proxy({}, {getPrototypeOf(){throw Error('PRIVATE_SENTINEL');},get(){throw Error('PRIVATE_SENTINEL');}});f.input.ethProvider.getBlock=async()=>{throw error;};await assert.rejects(()=>prepareFundingClaim(f.input),e=>e.code==='ROLLING_FUNDING_UNKNOWN'&&!e.message.includes('PRIVATE_SENTINEL'));});
test('missing token and changed network are rejected',async()=>{const f=await fixture('bok');f.input.scope.token=undefined;await assert.rejects(()=>prepareFundingClaim(f.input),{code:'ROLLING_FUNDING_INVALID'});const g=await fixture();g.input.ethProvider.getNetwork=async()=>({chainId:1n});await assert.rejects(()=>prepareFundingClaim(g.input),{code:'ROLLING_FUNDING_MISMATCH'});});
test('malformed event, amount, content/key or leaf never reaches claim preparation',async()=>{for(const mutate of [f=>{f.state.receipt.logs[0].data='0x1234';},f=>{f.eventArgs[1]='5001';f.state.receipt.logs[0]={address:f.input.scope.portal,...f.abi.encodeEventLog(f.abi.getEvent(f.eventName),f.eventArgs)};},f=>{f.input.receipt.messageKey=h(2);},f=>{f.input.receipt.leafIndex='8';}]){const f=await fixture();mutate(f);await assert.rejects(()=>prepareFundingClaim(f.input),{code:'ROLLING_FUNDING_MISMATCH'});}});

test('20-second whole-operation deadline prevents a delayed guard starting an RPC afterwards',async t=>{
 const f=await fixture();let release,calls=0;const gate=new Promise(resolve=>{release=resolve;});f.input.contextGuard=()=>gate;f.input.node.getNodeInfo=async()=>{calls++;throw Error('Should not run');};
 t.mock.timers.enable({apis:['setTimeout','Date']});const pending=prepareFundingClaim(f.input);const rejected=assert.rejects(pending,{code:'ROLLING_FUNDING_UNKNOWN'});t.mock.timers.tick(20001);await rejected;release();await Promise.resolve();await Promise.resolve();assert.equal(calls,0);t.mock.timers.reset();
});
test('FPC helper RPC uncertainty is not relabelled a receipt mismatch',async()=>{
 const f=await fixture('private-fee');let calls=0;const original=f.input.ethProvider.getTransaction;f.input.ethProvider.getTransaction=async(...args)=>{if(++calls>1)throw Error('PRIVATE_SENTINEL');return original(...args);};await assert.rejects(()=>prepareFundingClaim(f.input),{code:'ROLLING_FUNDING_UNKNOWN'});
});
