import {captureBokTopupScope,bokCreditPurchaseIntentFromTransaction,verifyBokCreditPurchaseEffects} from './bok-credit-purchase.mjs';
import {AbiCoder, Interface, getBytes, encodeBytes32String} from 'ethers';
import {Fr} from '@aztec-labs/foundation/curves/bn254';
import {EthAddress} from '@aztec-labs/foundation/eth-address';
import {BlockHash} from '@aztec-labs/stdlib/block';
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {L1Actor, L2Actor, L1ToL2Message} from '@aztec-labs/stdlib/messaging';
import {ProtocolContractAddress} from '@aztec-labs/protocol-contracts';
import {DomainSeparator, L1_TO_L2_MSG_TREE_HEIGHT} from '@aztec-labs/constants';
import {poseidon2HashWithSeparator} from '@aztec-labs/foundation/crypto/poseidon';
import {computeSecretHash} from '@aztec-labs/stdlib/hash';
import {deriveBoardDepositSecret} from '../deposit-custody.mjs';
import {claimSecrets, captureAggregateFundingIntent, captureAggregateFundingCustody, PrivateFeeFundingError} from '../private-fee-funding.mjs';
import {verifyEthereumIntentReceipt} from '../ethereum-journal.mjs';
import {derivePrivateFeeInstance, requirePublishedPrivateFee, derivePrivateFeeBridgeSecret} from '../private-fee-client.mjs';
import {isTrustedPrivateNode} from '../trusted-private-node.mjs';
import {encodeEscrowCommitment, encodeDepositExitCommitment, sha256Field} from '../protocol-commitments.mjs';

const boardAbi = new Interface([
  'function deposit(bytes32 secretHash) payable',
  'function requestRefund(bytes32 depositId)',
  'event RefundRequested(address indexed depositor,bytes32 indexed depositId,uint128 amount,bytes32 key,uint256 index)',
  'event Deposited(address indexed depositor,uint128 amount,bytes32 secretHash,bytes32 key,uint256 index)',
  'function ROLLUP() view returns(address)', 'function L2_CONTRACT() view returns(bytes32)',
  'function VERSION() view returns(uint256)', 'function L1_CHAIN_ID() view returns(uint256)',
]);
const bokAbi = new Interface([
  'function deposit(bytes32 account,uint128 amount,bytes32 secretHash)',
  'event Deposited(bytes32 indexed account,uint128 amount,bytes32 key,uint256 index)',
  'function token() view returns(address)', 'function escrow() view returns(bytes32)',
  'function version() view returns(uint256)', 'function chainId() view returns(uint256)',
  'function inbox() view returns(address)', 'function outbox() view returns(address)',
]);
const rollupAbi = new Interface(['function getInbox() view returns(address)', 'function getOutbox() view returns(address)']);
const feeClaimAbi = new Interface(['function claim(bytes32,uint256)']);
const MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const failures = new WeakSet();
const operationClaims = new WeakMap();
function fail(code) { const error=Object.assign(new Error('Funding receipt could not be verified.'),{code:'ROLLING_FUNDING_'+code});failures.add(error);return error; }
function requireThat(value,code='MISMATCH') { if(!value)throw fail(code); }
function uint(value,bits=128) {
  requireThat(typeof value==='string' && /^(0|[1-9][0-9]{0,77})$/.test(value) && BigInt(value)<(1n<<BigInt(bits)),'INVALID');return value;
}
function hex(value,bytes=32) { requireThat(typeof value==='string' && new RegExp('^0x[0-9a-f]{'+bytes*2+'}$').test(value),'INVALID');return value; }
function field(value,zero=false) { hex(value);requireThat(BigInt(value)<MODULUS && (zero || BigInt(value)>0n),'INVALID');return value; }
function object(value,keys) {
  requireThat(value && [Object.prototype,null].includes(Object.getPrototypeOf(value)) && Reflect.ownKeys(value).length===keys.length,'INVALID');
  const copy={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);requireThat(d && 'value' in d,'INVALID');copy[key]=d.value;}return copy;
}
function frozen(value) { if(value && typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value; }
// Drain the fixed independent read group before returning, even on failure.
async function together(reads) {
  const results=await Promise.allSettled(reads.map(read=>Promise.resolve().then(read)));
  const failure=results.find(result=>result.status==='rejected');if(failure)throw failure.reason;
  return results.map(result=>result.value);
}
const lower = value => String(value).toLowerCase();
const equal = (a,b) => lower(a)===lower(b);
function validated(input) {
  const kind=input.kind;requireThat(['collateral','collateral-cancel','private-fee','bok'].includes(kind),'INVALID');
  const collateral = kind === 'collateral' || kind === 'collateral-cancel';
  const scope=object(input.scope,['chainId','version','rollup','portal','recipient',...(collateral?[]:['token'])]);
  uint(scope.chainId,64);uint(scope.version,32);requireThat(BigInt(scope.chainId)>0n && BigInt(scope.chainId)<=BigInt(Number.MAX_SAFE_INTEGER) && BigInt(scope.version)>0n,'INVALID');
  for(const key of ['rollup','portal',...(collateral?[]:['token'])]){hex(scope[key],20);requireThat(BigInt(scope[key])>0n,'INVALID');}field(scope.recipient);
  const receipt=object(input.receipt,['txHash','blockHash','blockNumber','sender','nonce','amount','leafIndex','messageKey','secretHash',...(kind === 'collateral-cancel' ? ['depositId'] : [])]);
  hex(receipt.txHash);hex(receipt.blockHash);hex(receipt.sender,20);uint(receipt.nonce,53);uint(receipt.amount,collateral?96:128);uint(receipt.leafIndex,L1_TO_L2_MSG_TREE_HEIGHT);
  requireThat(BigInt(receipt.amount)>0n && BigInt(receipt.sender)>0n,'INVALID');field(receipt.messageKey);field(receipt.secretHash);
  if (kind === 'collateral-cancel') field(receipt.depositId);
  requireThat(Number.isSafeInteger(receipt.blockNumber) && receipt.blockNumber>=0,'INVALID');
  const anchor=object(input.anchor,['number','hash','root']);requireThat(Number.isSafeInteger(anchor.number) && anchor.number>=0,'INVALID');field(anchor.hash);field(anchor.root,true);
  field(input.owner);requireThat(typeof input.contextGuard==='function','INVALID');
  return frozen({kind,scope,receipt,anchor,owner:input.owner});
}
/**
 * Read-only claim preparation, NOT a payment, a claim submission or a spendability verdict.
 * Scope/artifacts come from the authenticated deployment. node must be the session's
 * trusted private node; contextGuard must enforce that session/account binding.
 * anchor is the PXE header's {number,hash,root:l1ToL2MessageTree.root}.
 * receipt is immutable public recovery metadata, never a license to repeat a payment.
 *
 * collateral-cancel takes a canonical RefundRequested receipt including depositId.
 * It needs no secrets, custody store or aggregate intent; the public bridge secret is 1.
 * The returned cancel_deposit call can be paid by the current private account.
 *
 * secrets: collateral {walletSecret,walletSalt} plus optional claimStore.load(scope,hash);
 * private-fee {walletSecret} plus privateFeeArtifact; bok {recipientSalt,bridgeSecret}.
 * Existing custody derives board/FPC secrets. Bok material must already be retained in
 * encrypted client recovery storage; no new key scheme or journal is created here.
 * Bok's event omits the secret hash: bind exact direct calldata, or optional aggregateIntent
 * from the private wallet's original journal (never public imported receipt). Aggregate
 * recovery checks the exact transaction, pinned router runtime and ALL three effects.
 * USDC additionally requires private aggregateCustody bound to the original plan;
 * collateral must load its saved secret under the beneficiary (never the relayer),
 * and FPC uses the encrypted retained random salt. Public receipt sender/nonce stay unchanged.
 * A canonical mined L1 receipt and native L2 message membership determine readiness.
 * Absence, pending native delivery, mismatch, reorg and unknown
 * remain distinct. No polling/retry, nullifier query, automatic claim or transaction API.
 * Returned claim contains SECRETS: keep it in the private workflow, never public evidence.
 * Private-fee returns the established bridgeClaim input for preparePrivateFeePayment,
 * NOT a standalone mint call: FeeJuice.claim + mint_and_pay_fee must share a transaction.
 */
export async function prepareFundingClaim(input) {
  let readFailed=false;
  try {
    const {kind,scope:s,receipt:r,anchor:a,owner}=validated(input);
    const cancellation = kind === 'collateral-cancel';
    // A cancellation is authorized by the owner's Ethereum request, not an old account key.
    const secrets = cancellation ? {} : object(input.secrets,kind==='collateral'?['walletSecret','walletSalt']:kind==='private-fee'?['walletSecret']:['recipientSalt','bridgeSecret']);
    for(const [key,value] of Object.entries(secrets))field(value,key==='walletSalt');
    // Capture every capability before the first await. Retaining an options
    // object must not permit a route or guard change during verification.
    const aggregateDescriptor=Object.getOwnPropertyDescriptor(input,'aggregateIntent');requireThat(!aggregateDescriptor || 'value' in aggregateDescriptor,'INVALID');
    const aggregateIntent=captureAggregateFundingIntent(aggregateDescriptor?.value);
    const topupDescriptor=Object.getOwnPropertyDescriptor(input,'bokTopupScope');requireThat(!topupDescriptor||'value' in topupDescriptor,'INVALID');
    const bokTopupScope=topupDescriptor?.value===undefined?null:captureBokTopupScope(topupDescriptor.value);
    if(bokTopupScope)requireThat(kind==='bok'&&bokTopupScope.chainId===s.chainId&&bokTopupScope.bokPortal===s.portal&&bokTopupScope.bokToken===s.token,'INVALID');
    const custodyDescriptor=Object.getOwnPropertyDescriptor(input,'aggregateCustody');requireThat(!custodyDescriptor || 'value' in custodyDescriptor,'INVALID');
    const aggregateCustody=captureAggregateFundingCustody(custodyDescriptor?.value,aggregateIntent);
    if (cancellation) requireThat(!aggregateIntent && !aggregateCustody, 'INVALID');
    const guard=input.contextGuard, privateFeeArtifact=input.privateFeeArtifact;
    const suppliedNode=input.node, suppliedProvider=input.ethProvider, suppliedStore=cancellation ? undefined : input.claimStore;
    requireThat(isTrustedPrivateNode(suppliedNode),'UNTRUSTED_NODE');
    const capture=(source,names)=>Object.freeze(Object.fromEntries(names.map(name=>{const fn=source?.[name];requireThat(typeof fn==='function','INVALID');return [name,fn.bind(source)];})));
    const nodeReads=capture(suppliedNode,['getNodeInfo','getContract','getBlockData','getL1ToL2MessageMembershipWitness']);
    // Only immutable message membership may share the PXE's native hash cache.
    // Every network/class/canonical read continues through the raw trusted node.
    const membershipDescriptor=Object.getOwnPropertyDescriptor(input,'membershipNode');
    requireThat(!membershipDescriptor||Object.hasOwn(membershipDescriptor,'value'),'INVALID');
    const membershipNode=membershipDescriptor?membershipDescriptor.value:suppliedNode;
    const membershipRead=capture(membershipNode,['getL1ToL2MessageMembershipWitness']).getL1ToL2MessageMembershipWitness;
    const providerMethods=['getNetwork','getTransactionReceipt','getTransaction','getBlock','call',...(aggregateIntent||bokTopupScope?['getCode']:[])];
    const providerReads=capture(suppliedProvider,providerMethods);
    const loadClaim=suppliedStore===undefined ? null : capture(suppliedStore,['load']).load;
    const operation=input.operationScope;
    requireThat(operation===undefined||(operation!==null&&typeof operation==='object'),'INVALID');
    // Only this exact held operation may reuse immutable, fully verified evidence.
    // Route capabilities, custody inputs and the native anchor are part of the key.
    const capabilities=[...Object.keys(nodeReads).map(name=>suppliedNode[name]),...providerMethods.map(name=>suppliedProvider[name]),suppliedStore?.load,membershipNode,membershipNode.getL1ToL2MessageMembershipWitness];
    const key=JSON.stringify([{kind,scope:s,receipt:r,anchor:a,owner},secrets,aggregateIntent,aggregateCustody,bokTopupScope]);
    const previous=operation&&operationClaims.get(operation)?.get(key);
    const reusable=previous&&previous.node===suppliedNode&&previous.provider===suppliedProvider&&previous.artifact===privateFeeArtifact&&previous.store===suppliedStore&&
      previous.capabilities.length===capabilities.length&&capabilities.every((value,index)=>value===previous.capabilities[index]);
    if(aggregateCustody && kind==='collateral')requireThat(loadClaim,'INVALID');
    // Each captured transport owns its request failure bound. A valid sequence
    // of reads and local verification does not expire on a whole-flow clock.
    const read=async fn=>{
      try {await guard();const value=await fn();await guard();return value;}
      catch {readFailed=true;throw fail('UNKNOWN');}
    };
    // Recovery helpers share exact immutable transaction/receipt/code reads in
    // this invocation only. Canonical L1 receipt and L2 anchor checks stay
    // fresh, including the explicit rechecks after the witness verification.
    const immutable=new Map();
    const provider=Object.fromEntries(providerMethods.map(name=>[name,(...args)=>read(()=>{
      const reusable=(name==='getTransaction'||name==='getTransactionReceipt')&&args[0]===r.txHash ||
        name==='getCode'&&args[1]===r.blockNumber;
      if(!reusable)return providerReads[name](...args);
      const key=JSON.stringify([name,args]);
      if(!immutable.has(key))immutable.set(key,Promise.resolve().then(()=>providerReads[name](...args)));
      return immutable.get(key);
    })]));
    const node=Object.fromEntries(['getNodeInfo','getContract'].map(name=>[name,(...args)=>read(()=>nodeReads[name](...args))]));
    const [info,network,receipt,tx]=await together([()=>node.getNodeInfo(),()=>provider.getNetwork(),()=>provider.getTransactionReceipt(r.txHash),()=>reusable?previous.tx:provider.getTransaction(r.txHash)]);
    requireThat(String(info.l1ChainId)===s.chainId && String(info.rollupVersion)===s.version && equal(info.l1ContractAddresses?.rollupAddress,s.rollup) && String(network.chainId)===s.chainId);
    if(!receipt)return frozen({status:'absent'}); // Unknown submission is NEVER declared unsent.
    requireThat(equal(receipt.hash,r.txHash) && receipt.blockNumber===r.blockNumber && equal(receipt.blockHash,r.blockHash),'REORG');
    const checkL1=async()=>{const b=await provider.getBlock(r.blockNumber);requireThat(b && equal(b.hash,r.blockHash),'REORG');};
    await checkL1();
    requireThat(receipt.status===0 || receipt.status===1,'UNKNOWN');
    requireThat(tx,'UNKNOWN');
    requireThat(equal(tx.hash,r.txHash) && equal(tx.from,r.sender) && String(tx.nonce)===r.nonce && String(tx.chainId)===s.chainId && equal(receipt.from,r.sender) && equal(receipt.to,tx.to));
    if(receipt.status===0){await checkL1();return frozen({status:'reverted'});}
    const checkL2=async()=>{
      const block=await read(()=>nodeReads.getBlockData(a.number));
      requireThat(block && equal(block.blockHash,a.hash) && block.header?.globalVariables?.blockNumber===a.number && equal(block.header?.state?.l1ToL2MessageTree?.root,a.root),'REORG');
    };
    if(reusable){
      if(kind==='private-fee')requireThat(equal(info.l1ContractAddresses?.feeJuicePortalAddress,s.portal)&&equal(info.l1ContractAddresses?.feeJuiceAddress,s.token));
      // Membership and Ethereum effects cannot change at these exact block hashes.
      // The receipt, canonical L1/L2 blocks and current FPC publication still can.
      await together([checkL1,checkL2,...(previous.canonical?[()=>requirePublishedPrivateFee(node,previous.canonical)]:[])]);
      await read(()=>Promise.resolve());return previous.result;
    }
    requireThat(Array.isArray(receipt.logs) && receipt.logs.length<=4096 && typeof tx.data==='string' && tx.data.length<=(aggregateIntent?16384:8192),'UNKNOWN');
    for(const log of receipt.logs)if(equal(log.address,s.portal))requireThat(Array.isArray(log.topics) && log.topics.length<=4 && log.topics.every(t=>typeof t==='string' && /^0x[0-9a-fA-F]{64}$/.test(t)) && typeof log.data==='string' && log.data.length<=4096,'UNKNOWN');
    let aggregate;
    if(aggregateIntent){
      const portalKey={collateral:'collateralPortal','private-fee':'feePortal',bok:'bokPortal'}[kind];
      requireThat(aggregateIntent.from===r.sender && aggregateIntent.nonce===Number(r.nonce) && aggregateIntent.chainId===s.chainId
        && aggregateIntent.expected[portalKey]===s.portal && (!aggregateIntent.txHash || aggregateIntent.txHash===r.txHash));
      let verified;try{verified=await verifyEthereumIntentReceipt(provider,aggregateIntent,r.txHash);}catch{throw fail(readFailed?'UNKNOWN':'MISMATCH');}
      requireThat(verified?.outcome==='success' && verified.receipt.blockNumber===r.blockNumber && equal(verified.receipt.blockHash,r.blockHash));
      if(aggregateCustody)requireThat(verified.event.beneficiary===aggregateCustody.beneficiary);
      aggregate=verified.event[kind==='private-fee'?'privateFee':kind];
      requireThat(aggregate && aggregate.amount===r.amount && aggregate.secretHash===r.secretHash && aggregate.messageKey===r.messageKey && aggregate.leafIndex===r.leafIndex);
    }
    const call=async(to,abi,name)=>abi.decodeFunctionResult(name,await provider.call({to,data:abi.encodeFunctionData(name),blockTag:r.blockNumber}))[0];
    const bindings=async(to,abi,expected)=>{
      const values=await together(expected.map(([name])=>()=>call(to,abi,name)));
      requireThat(expected.every(([,value],index)=>equal(values[index],value)));
    };
    const boardScope={l1ChainId:s.chainId,rollupAddress:s.rollup,rollupVersion:s.version,boardAddress:s.recipient,portalAddress:s.portal};
    let content,secret,claim,canonicalFee,messageRecipient=s.recipient;
    if (cancellation) {
      await bindings(s.portal,boardAbi,[['ROLLUP',s.rollup],['L2_CONTRACT',s.recipient],['VERSION',s.version],['L1_CHAIN_ID',s.chainId]]);
      requireThat(equal(tx.to,s.portal) && String(tx.value) === '0');
      requireThat(lower(tx.data) === boardAbi.encodeFunctionData('requestRefund',[r.depositId]).toLowerCase());
      const topic = boardAbi.getEvent('RefundRequested').topicHash.toLowerCase();
      const events = receipt.logs.filter(log => equal(log.address,s.portal) && lower(log.topics?.[0]) === topic);
      requireThat(events.length === 1);
      let event;
      try { event = boardAbi.parseLog(events[0])?.args; } catch { throw fail('MISMATCH'); }
      requireThat(event && equal(event.depositor,r.sender) && equal(event.depositId,r.depositId) &&
        String(event.amount) === r.amount && equal(event.key,r.messageKey) && String(event.index) === r.leafIndex);
      secret = Fr.ONE.toString();
      content = await sha256Field(encodeDepositExitCommitment('cancel',boardScope,{
        depositor:r.sender, amount:r.amount, depositId:r.depositId,
      }));
      claim = {contract:s.recipient, method:'cancel_deposit', args:[r.sender,r.amount,r.depositId,r.leafIndex]};
    } else if(kind==='collateral') {
      await bindings(s.portal,boardAbi,[['ROLLUP',s.rollup],['L2_CONTRACT',s.recipient],['VERSION',s.version],['L1_CHAIN_ID',s.chainId]]);
      const depositor=aggregateCustody?.beneficiary ?? r.sender;
      const custodyScope={...boardScope,depositor};
      const saved=loadClaim ? await read(()=>loadClaim(custodyScope,r.secretHash)) : null;
      if(aggregateCustody)requireThat(saved,'INVALID');
      const derived=saved ?? await deriveBoardDepositSecret({...secrets,scope:custodyScope,owner,nonce:r.nonce});
      secret=field(derived.secret);requireThat(derived.secretHash===r.secretHash);
      const record={from:r.sender,to:s.portal,nonce:Number(r.nonce),chainId:s.chainId,data:boardAbi.encodeFunctionData('deposit',[r.secretHash]).toLowerCase(),value:r.amount,
        expected:{kind:'deposit',amount:r.amount,secretHash:r.secretHash}};
      if(!aggregate){let result;try{result=await verifyEthereumIntentReceipt(provider,record,r.txHash);}catch{throw fail(readFailed?'UNKNOWN':'MISMATCH');}
        requireThat(result?.outcome==='success' && equal(result.event.key,r.messageKey) && String(result.event.index)===r.leafIndex);}
      content=await sha256Field(encodeEscrowCommitment('claim',boardScope,{depositor,amount:r.amount}));
      claim={contract:s.recipient,method:'claim_deposit',args:[depositor,r.amount,secret,r.leafIndex]};
    } else if(kind==='private-fee') {
      const record={chainId:s.chainId,version:s.version,privateFeeAddress:s.recipient,sender:r.sender,nonce:r.nonce};
      // The outer verifier already authenticated this exact transaction and all
      // aggregate effects. Verify the fee scope once at the receipt block instead
      // of invoking a second complete recovery flow against latest Ethereum state.
      if(aggregateIntent)requireThat(aggregateIntent.expected.privateFpc===s.recipient);
      requireThat(equal(info.l1ContractAddresses?.feeJuicePortalAddress,s.portal) && equal(info.l1ContractAddresses?.feeJuiceAddress,s.token));
      const canonical=await derivePrivateFeeInstance(privateFeeArtifact);canonicalFee=canonical;requireThat(equal(canonical.address,s.recipient));
      await requirePublishedPrivateFee(node,canonical);
      const account=new AztecAddress(Fr.fromString(owner));
      const salt=aggregateCustody ? Fr.fromString(aggregateCustody.privateFeeSalt) : null;
      const recovered=salt ? {salt,secret:await derivePrivateFeeBridgeSecret({salt,owner:account})} : await claimSecrets({walletSecret:secrets.walletSecret,owner:account,record});
      secret=recovered.secret.toString();
      const feeAbi=new Interface(['function ROLLUP() view returns(address)','function UNDERLYING() view returns(address)','function VERSION() view returns(uint256)','function L2_TOKEN_ADDRESS() view returns(bytes32)','function depositToAztecPublic(bytes32,uint256,bytes32) returns(bytes32,uint256)']);
      await bindings(s.portal,feeAbi,[['ROLLUP',s.rollup],['UNDERLYING',s.token],['VERSION',s.version],['L2_TOKEN_ADDRESS',ProtocolContractAddress.FeeJuice.toString()]]);
      if(!aggregate){
        const intent={from:r.sender,to:s.portal,nonce:Number(r.nonce),chainId:s.chainId,
          data:feeAbi.encodeFunctionData('depositToAztecPublic',[s.recipient,r.amount,r.secretHash]).toLowerCase(),value:'0',
          expected:{kind:'fee-deposit',recipient:s.recipient,amount:r.amount,secretHash:r.secretHash}};
        let verified;try{verified=await verifyEthereumIntentReceipt(provider,intent,r.txHash);}catch{throw fail(readFailed?'UNKNOWN':'MISMATCH');}
        requireThat(verified?.outcome==='success' && equal(verified.event.key,r.messageKey) && String(verified.event.index)===r.leafIndex);
      }
      content=await sha256Field(getBytes(feeClaimAbi.encodeFunctionData('claim',[s.recipient,r.amount])));messageRecipient=ProtocolContractAddress.FeeJuice.toString();
      claim={contract:s.recipient,kind:'private-fee-bridge',bridgeClaim:{amount:r.amount,salt:recovered.salt.toString(),leafIndex:r.leafIndex}};
    } else {
      await together([
        ()=>bindings(s.portal,bokAbi,[['token',s.token],['escrow',s.recipient],['version',s.version],['chainId',s.chainId]]),
        ...[['inbox','getInbox'],['outbox','getOutbox']].map(([name,rollupName])=>async()=>{const [actual,expected]=await together([()=>call(s.portal,bokAbi,name),()=>call(s.rollup,rollupAbi,rollupName)]);requireThat(equal(actual,expected));}),
      ]);
      const recipient=(await poseidon2HashWithSeparator([new Fr(BigInt(s.chainId)),new Fr(BigInt(s.portal)),Fr.fromString(s.recipient),new Fr(BigInt(s.version)),Fr.fromString(owner),Fr.fromString(secrets.recipientSalt)],0x424b4301)).toString();
      secret=secrets.bridgeSecret;
      // PluginPortal's event omits secretHash; require exact direct calldata too.
      if(aggregate)requireThat(aggregate.commitment===recipient);
      else if(bokTopupScope&&equal(tx.to,bokTopupScope.router)){
        const purchase=bokCreditPurchaseIntentFromTransaction(tx,bokTopupScope);
        requireThat(purchase.expected.recipient===recipient&&purchase.expected.amount===r.amount&&purchase.expected.secretHash===r.secretHash);
        const effect=await verifyBokCreditPurchaseEffects(provider,purchase,receipt);
        requireThat(effect.key===r.messageKey&&String(effect.index)===r.leafIndex);
      }
      else requireThat(equal(tx.to,s.portal) && BigInt(tx.value)===0n && equal(tx.data,bokAbi.encodeFunctionData('deposit',[recipient,r.amount,r.secretHash])));
      const topic=bokAbi.getEvent('Deposited').topicHash;
      const logs=receipt.logs.filter(log=>equal(log.address,s.portal) && equal(log.topics?.[0],topic));requireThat(logs.length===1);
      const event=bokAbi.parseLog(logs[0]).args;
      requireThat(equal(event.account,recipient) && String(event.amount)===r.amount && equal(event.key,r.messageKey) && String(event.index)===r.leafIndex);
      content=await sha256Field(getBytes(AbiCoder.defaultAbiCoder().encode(['bytes32','uint256','address','bytes32','uint256','bytes32','uint128'],[encodeBytes32String('PLUGIN_CREDIT_V1'),s.chainId,s.portal,s.recipient,s.version,recipient,r.amount])));
      claim={contract:s.recipient,method:'claim',args:[r.amount,secrets.recipientSalt,secret,r.leafIndex]};
    }
    requireThat((await computeSecretHash(Fr.fromString(secret))).toString()===r.secretHash);
    // The protocol Inbox rewrites the authenticated fee asset portal sender to
    // the FeeJuice system address. Portal identity/effects remain verified above.
    const messageSender=kind==='private-fee'?EthAddress.fromField(ProtocolContractAddress.FeeJuice.toField()):EthAddress.fromString(s.portal);
    const message=new L1ToL2Message(new L1Actor(messageSender,Number(s.chainId)),new L2Actor(new AztecAddress(Fr.fromString(messageRecipient)),Number(s.version)),Fr.fromString(content),Fr.fromString(r.secretHash),new Fr(BigInt(r.leafIndex)));
    requireThat(message.hash().toString()===r.messageKey);
    const [,witness]=await together([checkL2,()=>read(()=>membershipRead({number:a.number,hash:BlockHash.fromString(a.hash)},message.hash()))]);
    if(!witness){await together([checkL1,checkL2]);return frozen({status:'waiting',reason:'l2-delivery'});}
    requireThat(Array.isArray(witness) && witness.length===2 && witness[0]===BigInt(r.leafIndex) && witness[1].pathSize===L1_TO_L2_MSG_TREE_HEIGHT);
    const path=witness[1].toFields();requireThat(Array.isArray(path) && path.length===L1_TO_L2_MSG_TREE_HEIGHT);
    let root=message.hash(),index=witness[0];
    for(const sibling of path){root=await poseidon2HashWithSeparator(index&1n?[sibling,root]:[root,sibling],DomainSeparator.MERKLE_HASH);index>>=1n;}
    requireThat(index===0n && root.toString()===a.root);
    await together([checkL1,checkL2]);
    await read(()=>Promise.resolve());
    const result=frozen({status:'claim-ready',claim,evidence:{kind,txHash:r.txHash,l1:{number:r.blockNumber,hash:r.blockHash},l2:{number:a.number,hash:a.hash},messageKey:r.messageKey,leafIndex:r.leafIndex,content}});
    if(operation){let entries=operationClaims.get(operation);if(!entries){entries=new Map();operationClaims.set(operation,entries);}if(entries.size<4)entries.set(key,{node:suppliedNode,provider:suppliedProvider,artifact:privateFeeArtifact,store:suppliedStore,capabilities,tx:frozen(Object.fromEntries(['hash','from','to','nonce','chainId','value','data'].map(name=>[name,tx[name]]))),canonical:canonicalFee,result});}
    return result;
  } catch(error) {
    if(failures.has(error))throw error;
    // Existing private-fee verifier emits fixed codes only. Never propagate its
    // recovery record or any provider message/cause/private arguments.
    let mismatch=false;try{mismatch=!readFailed && error instanceof PrivateFeeFundingError && ['PRIVATE_FEE_RECOVERY_TRANSACTION_MISMATCH','PRIVATE_FEE_RECOVERY_EVENT_MISMATCH','PRIVATE_FEE_RECOVERY_SCOPE_MISMATCH'].includes(Object.getOwnPropertyDescriptor(error,'code')?.value);}catch{}
    if(mismatch)throw fail('MISMATCH');
    throw fail('UNKNOWN');
  }
}
