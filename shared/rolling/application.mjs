import {createEncryptedJournalSlot} from '../journal-record.mjs';
import {l2JournalScopeText} from '../l2-journal.mjs';
import {nameRegistration,NAME_DOMAIN} from './name-policy.mjs';
import {FIELD_MODULUS,INVOCATION_DOMAIN,invocationPreimage} from './invocation.mjs';

const fail=code=>Object.assign(new Error(code),{code});
const check=(ok,code='ROLLING_INVALID_ACTION')=>{if(!ok)throw fail(code);};
const clone=value=>JSON.parse(JSON.stringify(value));
const field=(value,nonzero=false)=>{
  check(typeof value==='string'&&/^(?:0x[0-9a-f]{64}|0|[1-9][0-9]{0,76})$/.test(value));
  const n=BigInt(value);check(n<FIELD_MODULUS&&(!nonzero||n>0n));return `0x${n.toString(16).padStart(64,'0')}`;
};
const zero=field('0');
function plain(value,depth=0){
  check(depth<24,'ROLLING_INVALID_RESPONSE');
  if(typeof value==='bigint')return field(value.toString());
  if(value===null||typeof value==='boolean'||typeof value==='string')return value;
  if(typeof value==='number'){check(Number.isSafeInteger(value),'ROLLING_INVALID_RESPONSE');return value;}
  if(value?.toField)return field(value.toField().toString());
  if(value?.toBigInt)return field(value.toBigInt().toString());
  if(Array.isArray(value)){check(value.length<=1024,'ROLLING_INVALID_RESPONSE');return value.map(v=>plain(v,depth+1));}
  check(value&&Object.getPrototypeOf(value)===Object.prototype,'ROLLING_INVALID_RESPONSE');
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,plain(v,depth+1)]));
}
// The installed ABI decoder returns undefined for Option::None. Only the
// verified return ABI may grant absence; required values remain fail-closed.
function utilityPlain(value,type,depth=0){
  check(type&&depth<24,'ROLLING_INVALID_RESPONSE');
  if(type.kind==='struct'&&type.path==='std::option::Option'){
    check(type.fields?.length===2&&type.fields[0].name==='_is_some'&&type.fields[0].type.kind==='boolean'&&type.fields[1].name==='_value','ROLLING_ABI_MISMATCH');
    return value===undefined||value===null?null:utilityPlain(value,type.fields[1].type,depth+1);
  }
  check(value!==undefined&&value!==null,'ROLLING_INVALID_RESPONSE');
  if(type.kind==='array'||type.kind==='tuple'){
    const size=type.kind==='array'?type.length:type.fields.length;
    check(Number.isSafeInteger(size)&&size<=1024&&Array.isArray(value)&&value.length===size,'ROLLING_INVALID_RESPONSE');
    return Array.from({length:size},(_,i)=>utilityPlain(value[i],type.kind==='array'?type.type:type.fields[i],depth+1));
  }
  if(type.kind==='struct'&&!value?.toField&&!value?.toBigInt){
    check(Object.getPrototypeOf(value)===Object.prototype&&Array.isArray(type.fields)&&type.fields.length<=64,'ROLLING_INVALID_RESPONSE');
    check(Object.keys(value).sort().join()===type.fields.map(f=>f.name).sort().join(),'ROLLING_INVALID_RESPONSE');
    return Object.fromEntries(type.fields.map(f=>[f.name,utilityPlain(value[f.name],f.type,depth+1)]));
  }
  if(type.kind==='boolean')check(typeof value==='boolean','ROLLING_INVALID_RESPONSE');
  return plain(value,depth);
}
function text(value,count,required=true){
  check(typeof value==='string'&&value.isWellFormed()&&!value.includes('\0'));
  const bytes=new TextEncoder().encode(value);check(bytes.length<=count*31&&(!required||bytes.length));
  return [pack(bytes,count),bytes.length];
}
function pack(bytes,count){
  const packed=Array(count).fill(0n);for(let i=0;i<bytes.length;i++)packed[Math.floor(i/31)]|=BigInt(bytes[i])<<BigInt(8*(30-i%31));
  return packed.map(n=>field(n.toString()));
}
function version(value){check(typeof value==='string'&&/^(?:0|[1-9][0-9]{0,9})$/.test(value)&&BigInt(value)<=0xffffffffn);return Number(value);}
function preferenceRevision(value){
  check(typeof value==='string'&&/^(?:0|[1-9][0-9]{0,19})$/.test(value)&&BigInt(value)<=0xffffffffffffffffn);
  return BigInt(value);
}
function preferenceArguments(action){
  const revision=preferenceRevision(action.expectedRevision);
  check(Number.isInteger(action.kind)&&action.kind>=1&&action.kind<=5&&typeof action.enabled==='boolean');
  const target=field(action.target,action.kind!==2&&action.kind!==5);
  check(action.kind!==5||target===zero);
  return [revision,action.kind,target,action.enabled];
}
function avatar(action){
  check(typeof action.data==='string'&&action.data.length<=10924&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(action.data));
  const binary=atob(action.data);check(btoa(binary)===action.data&&binary.length<=8192);
  check(binary.length===0?action.width===0&&action.height===0:action.width===100&&action.height===100);
  return [field(action.name,true),version(action.expectedVersion),action.width,action.height,binary.length,pack(Uint8Array.from(binary,c=>c.charCodeAt(0)),265)];
}
function component(fields,length){
  check(Array.isArray(fields)&&fields.length===2&&Number.isInteger(length)&&length>=1&&length<=32,'ROLLING_INVALID_RESPONSE');
  const words=fields.map(value=>{check(typeof value==='string'&&/^0x[0-9a-f]{64}$/.test(value)&&BigInt(value)<(1n<<248n),'ROLLING_INVALID_RESPONSE');return BigInt(value);});
  check((words[1]&((1n<<240n)-1n))===0n,'ROLLING_INVALID_RESPONSE');
  const bytes=Array.from({length:31},(_,i)=>Number((words[0]>>BigInt((30-i)*8))&255n));bytes.push(Number(words[1]>>240n));
  check(bytes.slice(length).every(n=>n===0),'ROLLING_INVALID_RESPONSE');return String.fromCharCode(...bytes.slice(0,length));
}
const moderationTypes=new Set(['moderate-post','moderate-avatar','reject-subboard','set-main-policy']);
const keys={'moderate-post':['post','reason'],'moderate-avatar':['name','reason'],'reject-subboard':['subboard','reason'],'set-main-policy':['rules'],'claim-deposit':['receipt','feeReceipt','bokReceipt'],preference:['expectedRevision','kind','target','enabled'],'read-marker':['expectedRevision','thread','throughBlock'],bio:['name','expectedVersion','content'],avatar:['name','expectedVersion','width','height','data'],name:['first','last'],subboard:['slug','name','description','rules'],like:['post'],unlike:['post'],withdraw:['deposit'],screen:['deposit'],
  bok:['deposit','content','name','subboard','budget'],post:['deposit','content','name','subboard'],reply:['deposit','content','name','subboard','parent','root'],
  quote:['deposit','content','name','subboard','reference'],repost:['deposit','content','name','subboard','reference']};
const methods={'moderate-post':'remove_post','moderate-avatar':'remove_avatar','reject-subboard':'reject_subboard','set-main-policy':'set_main_policy',bok:'authorize_request','claim-deposit':'claim_deposit',preference:'set_preference','read-marker':'mark_thread_read',bio:'set_bio',avatar:'set_avatar',name:'register_name',subboard:'create_subboard',like:'set_like',unlike:'set_like',withdraw:'withdraw',screen:'screen',post:'post',reply:'post',quote:'post',repost:'post'};

/** Wallet-only port; import after unlock. No SDK, network or public-reader work at import.
 * deployment: {board:{address,artifact}, network:{chainId,version,rollup},portal,
 *              privateFee:{address,artifact,gasSettings},proofsEnabled?}.
 * accountSession: {owner,wallet,node,journal,walletSecret,walletSalt}; node is the
 * branded trusted node; wallet is createAztecWallet with this SAME scoped L2 journal
 * and contextGuard. Parent constructs PXE with that same node: the installed PXE
 * wraps it in an opaque SDK caching proxy; sdk.isPrivatePXEForNode verifies the
 * repository factory's private WeakMap provenance rather than proxy equality.
 * sdk.isPrivateWalletForNode is supplied by the SDK facade from
 * BillboardPrivateFeeRouting.isPrivateWalletForNode in the repository wallet factory;
 * it verifies captured submission-node provenance. The wallet's public .aztecNode
 * identity and factory PXE provenance are also checked before personalized calls.
 * Parent verifies deployment artifacts/publication before binding.
 * privateStore: existing ciphertext read(key)/atomic compareAndSwap(key,prior,next).
 * contextGuard must reject a locked/replaced account or changed deployment.
 * Gas limits/prices may use JSON decimal strings or bigint; they are detached.
 * The loaded RollingBoard artifact must be the processed, manifest-verified artifact.
 * Tests require that normal generated artifact; mocks do not qualify live funding.
 * Inputs are strict plain actions; field identifiers are decimal or 32-byte lowercase
 * hex strings; profile expectedVersion is a canonical decimal uint32 string.
 * ownedIdentities returns private IDs and display records only from owned_name_records;
 * there is no public per-name lookup or legacy fallback. Bios allow992UTF8 bytes,
 * including empty clear. Avatars accept canonical padded base64<=8192bytes,100x100,
 * or empty data with0x0 to clear. The upload UI must validate/decode/moderate pixels
 * and bind confirmed preview bytes before preparing this binary contract action.
 * screen accepts only an existing deposit ID and snapshots authenticated-wallet
 * child/grandchild screening hints. It advances private history without public
 * content or a subboard-policy gate; the contract enforces maturity and debt.
 * preference/read-marker expectedRevision is canonical decimal uint64; kind1..5
 * toggles use opaque canonical IDs (board0 and global0 allowed, other targets
 * nonzero). Deleted/stale targets remain recoverable, without public lookups.
 * read-marker throughBlock is decimal uint32; the contract authenticates its hash.
 * readPreferenceHead returns the pure replay shape, only through the scoped owner
 * utility after trusted-route guards. A failed read never becomes empty history.
 * This does not retrieve encrypted events or qualify key-only recovery.
 * A prepared post includes authenticated-wallet screening hints and live policy versions.
 * submit delegates the sole prove/journal/send lifecycle to wallet.sendTx. Once its
 * durable fence exists, automatic behavior is limited to read-only reconcile, including after a crash
 * before transaction bytes were saved. Missing receipt is never absence. No automatic
 * replacement. Explicit preference-only resumeSaved may resend the identical saved bytes
 * after fresh context validation, without estimation or proving; cancelPrepared permits only the pre-send prepared state. Recovery UI must preserve both encrypted journals.
 * claim-deposit accepts public receipt metadata only. The existing receipt verifier
 * derives the private claim from wallet custody and checks delivery at the current
 * PXE anchor before both preparation and submission. Secrets stay in the encrypted
 * workflow record, never its public action/summary. The caller owns funding.provider
 * and its lifetime, guarded with the same account/network context.
 * Bok authorization and posting are separately confirmed and journalled. The encrypted
 * workflow retains the exact request, target and draft between them; no automatic resend.
 * This slice excludes new bridge payments and L1 exits;
 * withdraw is ONLY existing funded deposit's L2 exit. These remain integration work.
 */
export function createRollingApplication({sdk,deployment,accountSession,privateStore,publicReader,funding,onProgress=()=>{},contextGuard}){
  void publicReader; // Private methods must never send anything to this dependency.
  let busy=false,slotPromise;
  const session=accountSession;
  const owner=session?.owner?.toString();
  const fundingProvider=funding?.provider,claimStore=funding?.claimStore;
  const loadAggregate=typeof funding?.loadAggregate==='function'?funding.loadAggregate.bind(funding):null;
  const fixed=deployment&&{board:deployment.board.address.toString(),network:clone(deployment.network),portal:deployment.portal,
    fee:deployment.privateFee.address.toString(),gas:JSON.parse(JSON.stringify(deployment.privateFee.gasSettings,(_,v)=>typeof v==='bigint'?v.toString():v)),proofsEnabled:deployment.proofsEnabled!==false};
  const bok=deployment?.bok&&{address:deployment.bok.address.toString(),operator:deployment.bok.operator.toString(),pluginId:field(deployment.bok.pluginId,true)};
  const scope=session&&fixed&&{account:owner,chainId:String(fixed.network.chainId),version:String(fixed.network.version),
    rollup:fixed.network.rollup,board:fixed.board,portal:fixed.portal};
  const slot=()=>slotPromise??=createEncryptedJournalSlot({storage:privateStore,walletSecret:session.walletSecret,walletSalt:session.walletSalt,
    scopeText:JSON.stringify(['ROLLING_WORKFLOW_V1',l2JournalScopeText(scope)]),keyDomain:'ROLLING_WORKFLOW_V1'});
  function chainValue(value){
    try{
      if(value&&typeof value==='object'&&typeof value.toBigInt==='function')value=value.toBigInt();
      if(typeof value==='number'){check(Number.isSafeInteger(value),'ROLLING_CONTEXT_CHANGED');value=BigInt(value);}
      if(typeof value==='string'){
        check(/^(?:0x[0-9a-f]{64}|0|[1-9][0-9]{0,76})$/.test(value),'ROLLING_CONTEXT_CHANGED');value=BigInt(value);
      }
      check(typeof value==='bigint'&&value>=0n&&value<FIELD_MODULUS,'ROLLING_CONTEXT_CHANGED');return value;
    }catch{throw fail('ROLLING_CONTEXT_CHANGED');}
  }
  async function guard(){
    check(session&&typeof contextGuard==='function','ROLLING_LOCKED');await contextGuard();
    check(owner===session.owner.toString()&&sdk.isTrustedPrivateNode(session.node)&&
      session.wallet.aztecNode===session.node&&sdk.isPrivateWalletForNode(session.wallet,session.node)&&sdk.isPrivatePXEForNode(session.wallet.pxe,session.node)&&fixed.board===deployment.board.address.toString()&&fixed.fee===deployment.privateFee.address.toString()&&
      JSON.stringify(fixed.network)===JSON.stringify(deployment.network)&&fixed.portal===deployment.portal&&
      (!bok||deployment.bok?.address.toString()===bok.address&&deployment.bok?.operator.toString()===bok.operator&&field(deployment.bok?.pluginId,true)===bok.pluginId),'ROLLING_CONTEXT_CHANGED');
    await sdk.inspectTrustedNode(session.node,{expectedNetworkScope:fixed.network,proofsEnabled:fixed.proofsEnabled});
    const chain=await session.wallet.getChainInfo();check(chainValue(chain?.chainId)===chainValue(scope.chainId)&&chainValue(chain?.version)===chainValue(scope.version),'ROLLING_CONTEXT_CHANGED');
    const accounts=await session.wallet.getAccounts();check(accounts.some(a=>(a.address??a).toString()===owner),'ROLLING_CONTEXT_CHANGED');
  }
  async function exclusive(fn){check(!busy,'ROLLING_BUSY');busy=true;try{return await fn();}finally{busy=false;}}
  const progress=stage=>{try{onProgress({stage});}catch{/* display errors cannot alter transaction control */}};
  const contract=()=>sdk.Contract.at(new sdk.AztecAddress(new sdk.Fr(BigInt(fixed.board))),deployment.board.artifact,session.wallet);
  async function utility(board,name,args,artifact=deployment.board.artifact){
    const matches=[...artifact.functions,...(artifact.nonDispatchPublicFunctions??[])].filter(f=>f.name===name);
    check(matches.length===1,'ROLLING_ABI_MISMATCH');const abi=matches[0];
    check(!abi.returnTypes||abi.returnTypes.length<=1,'ROLLING_ABI_MISMATCH');
    const out=await board.methods[name](...args).simulate({from:session.owner});
    return utilityPlain(out.result??out,abi.returnType??abi.returnTypes?.[0]);
  }
  async function fundingClaim(kind,metadata){
    check(fundingProvider&&typeof sdk.prepareFundingClaim==='function','ROLLING_FUNDING_UNAVAILABLE');
    const receipt=exactData(metadata,['txHash','blockHash','blockNumber','sender','nonce','amount','leafIndex','messageKey','secretHash']);
    await guard();const header=await session.wallet.pxe.getSyncedBlockHeader();await guard();
    const anchor={number:Number(header.globalVariables.blockNumber),hash:(await header.hash()).toString(),root:header.state.l1ToL2MessageTree.root.toString()};
    const aggregate=loadAggregate?await loadAggregate(receipt.txHash):null;await guard();
    let claimScope={...fixed.network,portal:fixed.portal,recipient:fixed.board};
    let secrets={walletSecret:session.walletSecret,...(kind==='collateral'?{walletSalt:field(String(session.walletSalt))}:{})};
    if(kind==='bok'){
      check(bok&&aggregate?.intent&&aggregate.bokScope,'ROLLING_FUNDING_UNAVAILABLE');
      claimScope=exactData(aggregate.bokScope,['chainId','version','rollup','portal','recipient','token']);
      check(claimScope.recipient===bok.address&&['chainId','version','rollup'].every(key=>claimScope[key]===fixed.network[key]),'ROLLING_FUNDING_MISMATCH');
      secrets={recipientSalt:field(aggregate.recipientSalt,true),bridgeSecret:field(aggregate.bridgeSecret,true)};
    }
    if(kind==='private-fee'){
      const info=await session.node.getNodeInfo();await guard();
      claimScope={...fixed.network,portal:info.l1ContractAddresses.feeJuicePortalAddress.toString().toLowerCase(),
        token:info.l1ContractAddresses.feeJuiceAddress.toString().toLowerCase(),recipient:fixed.fee};
    }
    const verified=await sdk.prepareFundingClaim({kind,scope:claimScope,receipt,anchor,owner,
      secrets,...(aggregate?{aggregateIntent:aggregate.intent}:{}),
      privateFeeArtifact:deployment.privateFee.artifact,ethProvider:fundingProvider,node:session.node,claimStore,contextGuard:guard});
    await guard();check(verified.status==='claim-ready','ROLLING_FUNDING_NOT_READY');return verified.claim;
  }
  async function payment(action){
    let claim;
    if(action?.type==='claim-deposit'&&action.feeReceipt!==undefined){
      const verified=await fundingClaim('private-fee',action.feeReceipt);
      check(verified.contract===fixed.fee&&verified.kind==='private-fee-bridge','ROLLING_FUNDING_MISMATCH');
      claim=verified.bridgeClaim;
    }
    return sdk.preparePrivateFeePayment({wallet:session.wallet,node:session.node,owner:session.owner,
      privateFeeAddress:fixed.fee,privateFeeArtifact:deployment.privateFee.artifact,expectedChainId:scope.chainId,expectedVersion:scope.version,gasSettings:fixed.gas,
      ...(claim?{claim}:{})});
  }
  async function collateralClaim(action){
    // Receipt metadata cannot replace the authenticated deployment or inject
    // secrets. Both claims are derived from custody and rechecked at submission.
    const claim=await fundingClaim('collateral',action.receipt);
    check(claim.contract===fixed.board&&claim.method==='claim_deposit','ROLLING_FUNDING_MISMATCH');
    return plain(claim.args);
  }
  async function bokFundingClaim(action){
    check(bok&&action.feeReceipt&&action.bokReceipt&&action.receipt.txHash===action.feeReceipt.txHash&&action.receipt.txHash===action.bokReceipt.txHash,'ROLLING_FUNDING_MISMATCH');
    const claim=await fundingClaim('bok',action.bokReceipt);
    check(claim.contract===bok.address&&claim.method==='claim','ROLLING_FUNDING_MISMATCH');
    return {scope:clone(bok),args:plain(claim.args)};
  }
  const operation=id=>`ROLLING_WORKFLOW_V1:${id}`;
  function summary(record){return {intentId:record.id,action:clone(record.action),status:record.status,maximumFee:record.maximumFee,
    nonce:record.nonce,txHash:record.txHash??null,...(record.moderation?{moderation:clone(record.moderation)}:{}),stage:record.bok?`bok-${record.bok.phase}`:'single-transaction',...(record.bok?{bok:{phase:record.bok.phase,budget:record.bok.budget,availableCredit:record.bok.availableCredit,authorizationTxHash:record.bok.authorizationTxHash??null,...(record.bok.phase==='post'?{mainPolicyVersion:record.args[2].expected_main_policy_version,localPolicyVersion:record.args[2].expected_local_policy_version}:{})}}:{}),...(record.replacementReview?{replacementReview:clone(record.replacementReview)}:{}),
    ...(preferenceAction(record)?{inclusionHistory:clone(record.inclusionHistory??[])}:{})};}
  function checkBokRecord(record){for(const savedScope of [record?.bok?.scope,record?.fundingBok?.scope])if(savedScope)check(bok&&JSON.stringify(savedScope)===JSON.stringify(bok),'ROLLING_CONTEXT_CHANGED');}
  async function savedIntent(id){const saved=await (await slot()).read();check(saved.value?.id===id,'ROLLING_INTENT_NOT_FOUND');checkBokRecord(saved.value);return saved;}
  function acknowledge(found,expected){
    check(found&&found.operation===expected.operation&&found.txHash===expected.txHash&&
      ['success','reverted'].includes(found.outcome)&&found.receipt?.txHash?.toString()===found.txHash,'ROLLING_RECOVERY_REQUIRED');
    // inspectOutcome verified this exact receipt canonically. assertCanStart still
    // rechecks canonicality and rejects non-final reverted sender-tagging ranges.
    session.journal.confirmed(found.receipt);
  }
  async function outcome(saved){
    checkBokRecord(saved.value);
    const found=await session.journal.inspectOutcome();
    if(!found||found.operation!==operation(saved.value.id))return {...summary(saved.value),status:'unknown'};
    if(!['success','reverted'].includes(found.outcome))return {...summary(saved.value),status:'unknown',txHash:found.txHash};
    acknowledge(found,{operation:operation(saved.value.id),txHash:saved.value.replacementReview?found.txHash:(saved.value.txHash??found.txHash)});
    const next={...saved.value,status:found.outcome==='success'?'confirmed':'reverted',txHash:found.txHash,...(preferenceAction(saved.value)?{inclusionHistory:inclusionHistory(saved.value,found)}:{})};
    await (await slot()).write(saved,next);return {...summary(next),...(next.bok?.phase==='authorize'&&next.status==='confirmed'?{status:'authorized'}:next.bok?.phase==='post'&&next.status==='reverted'?{status:'bok-post-reverted'}:{})};
  }
  const preferenceAction=record=>['preference','read-marker'].includes(record.action.type);
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const hashText=value=>{const text=value?.toString();check(typeof text==='string'&&/^0x[0-9a-f]{64}$/.test(text),'ROLLING_INVALID_RESPONSE');return text;};
  function exactData(value,names){
    check(value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===names.length,'ROLLING_INVALID_ACTION');
    return Object.fromEntries(names.map(name=>{const d=Object.getOwnPropertyDescriptor(value,name);check(d&&Object.hasOwn(d,'value'),'ROLLING_INVALID_ACTION');return [name,d.value];}));
  }
  async function preferenceHead(){
    await guard();const board=await contract();await guard();
    const record=await utility(board,'preference_head',[session.owner]);
    check(record&&typeof record.initialized==='boolean','ROLLING_INVALID_RESPONSE');
    const numeric=(value,max)=>{check(typeof value==='string'&&/^0x[0-9a-f]{64}$/.test(value),'ROLLING_INVALID_RESPONSE');const n=BigInt(value);check(n<=max,'ROLLING_INVALID_RESPONSE');return n;};
    const schema=numeric(record.schema,0xffffffffn),revision=numeric(record.revision,0xffffffffffffffffn),digest=numeric(record.digest,FIELD_MODULUS-1n);
    check(schema===1n&&(record.initialized?revision>0n&&digest>0n:revision===0n&&digest===0n),'ROLLING_INVALID_RESPONSE');
    await guard();return {initialized:record.initialized,schema:1,revision:String(revision),digest:String(digest)};
  }
  async function markerContext(record){
    if(record.action.type!=='read-marker')return null;
    await guard();const height=Number(record.action.throughBlock),block=await session.node.getBlockData(height);await guard();
    check(block&&Number(block.header?.globalVariables?.blockNumber)===height,'ROLLING_RECOVERY_CONTEXT_CHANGED');
    return {throughBlock:record.action.throughBlock,blockHash:hashText(block.blockHash)};
  }
  function inclusionHistory(record,found){
    const history=clone(record.inclusionHistory??[]);if(!preferenceAction(record))return history;
    const receipt=found.receipt,fee=receipt.transactionFee;
    check(Number.isSafeInteger(receipt.blockNumber)&&receipt.blockNumber>0&&
      ['checkpointed','proven','finalized'].includes(receipt.status)&&
      (typeof fee==='bigint'||typeof fee==='string')&&/^(0|[1-9][0-9]{0,76})$/.test(String(fee))&&BigInt(fee)<FIELD_MODULUS,'ROLLING_INVALID_RESPONSE');
    const fact={blockNumber:receipt.blockNumber,blockHash:hashText(receipt.blockHash),executionResult:found.outcome,transactionFee:String(fee)};
    let attempt=history.find(row=>row.txHash===found.txHash);
    if(!attempt){check(history.length<9,'ROLLING_RECOVERY_REQUIRED');attempt={txHash:found.txHash,inclusions:[]};history.push(attempt);}
    const prior=attempt.inclusions.find(row=>row.blockHash===fact.blockHash);
    check(!prior||same(prior,fact),'ROLLING_INVALID_RESPONSE');if(!prior)attempt.inclusions.push(fact);
    return history;
  }
  function savedConsent(record,txHash){
    const review=record.replacementReview;
    // A renewed quote does not prove that new signed bytes were saved. Never
    // attribute that quote to its old source candidate after an interrupted proof.
    if(!txHash||review&&review.sourceTxHash===txHash)return null;
    const maximumFee=review?review.maximumFee:record.maximumFee;
    if(typeof maximumFee!=='string'||!/^(0|[1-9][0-9]{0,76})$/.test(maximumFee)||BigInt(maximumFee)>=FIELD_MODULUS)return null;
    return {maximumFee,feeSource:review?'replacement':'original',marker:clone(review?review.marker:record.originalMarker??null)};
  }
  function savedContextMatches(record,consent,head,marker){
    return !!consent&&!!record.originalPreferenceHead&&same(head,record.originalPreferenceHead)&&
      head.revision===record.action.expectedRevision&&same(marker,consent.marker)&&
      (!record.replacementReview||same(head,record.replacementReview.head));
  }
  async function exactResumeSnapshot(record,txHash,head,marker){
    if(!txHash)return {status:'empty',txHash:null,maximumFee:null,feeSource:null,marker:null};
    const inspected=await session.journal.inspectSavedRecovery(operation(record.id),txHash),consent=savedConsent(record,txHash);
    let status=inspected.status;
    if(status==='resumable'&&!consent)status='unknown';
    else if(status==='resumable'&&!savedContextMatches(record,consent,head,marker))status='context-changed';
    if(status==='resumable'&&['prepared','cancelled','replacement-prepared'].includes(record.status))status='unknown';
    return {status,txHash:inspected.txHash,...(consent??{maximumFee:null,feeSource:null,marker:null})};
  }
  async function checkSavedResumeContext(saved,txHash){
    const record=saved.value,consent=savedConsent(record,txHash);
    await guard();await session.wallet.pxe.sync();await guard();
    const head=await preferenceHead(),marker=await markerContext(record);
    check(savedContextMatches(record,consent,head,marker),'ROLLING_RECOVERY_CONTEXT_CHANGED');
    check((await savedIntent(record.id)).encoded===saved.encoded,'ROLLING_RECOVERY_REQUIRED');await guard();
  }
  async function recoverySnapshot(saved){
    const record=saved.value;check(preferenceAction(record),'ROLLING_RECOVERY_UNSUPPORTED');
    const inspected=await session.journal.inspectReplacement(operation(record.id),{requireMissingAnchor:true});
    const head=await preferenceHead(),marker=await markerContext(record);await guard();
    const exactResume=await exactResumeSnapshot(record,inspected.txHash,head,marker);
    check((await savedIntent(record.id)).encoded===saved.encoded,'ROLLING_RECOVERY_REQUIRED');await guard();
    let status=inspected.status==='available'?'replacement-available':inspected.status;
    if(status==='replacement-available'&&(!record.originalPreferenceHead||!same(head,record.originalPreferenceHead)||head.revision!==record.action.expectedRevision))status='context-changed';
    if(status==='replacement-available'&&['confirmed','reverted'].includes(record.status)&&!record.inclusionHistory?.some(row=>row.txHash===record.txHash))status='history-unavailable';
    return {intent:summary(record),status,attempts:clone(inspected.attempts),requireMissingAnchor:inspected.requireMissingAnchor,
      head,originalPreferenceHead:clone(record.originalPreferenceHead??null),marker,originalMarker:clone(record.originalMarker??null),inclusionHistory:clone(record.inclusionHistory??[]),currentTxHash:inspected.txHash,exactResume};
  }
  async function checkReplacementReview(record,{synchronize=false}={}){
    const review=record.replacementReview;check(review&&preferenceAction(record),'ROLLING_RECOVERY_REQUIRED');
    if(synchronize){await guard();await session.wallet.pxe.sync();await guard();}
    const head=await preferenceHead(),marker=await markerContext(record);
    check(record.originalPreferenceHead&&same(head,record.originalPreferenceHead)&&head.revision===record.action.expectedRevision&&same(head,review.head)&&same(marker,review.marker),'ROLLING_RECOVERY_CONTEXT_CHANGED');
    await guard();
  }
  async function screeningArguments(board,deposit){
    const hints=await utility(board,'get_screen_hints',[session.owner,deposit]);
    check(Array.isArray(hints)&&hints.length===2&&!(!hints[0]&&hints[1]),'ROLLING_HISTORY_UNAVAILABLE');
    return [deposit,...hints];
  }
  async function argumentsFor(action,board,nonce){
    const allowed=keys[action?.type];check(allowed&&Object.keys(action).every(k=>k==='type'||allowed.includes(k)));
    switch(action.type){
      case 'claim-deposit':return collateralClaim(action);
      case 'preference':return preferenceArguments(action);
      case 'read-marker':return [preferenceRevision(action.expectedRevision),field(action.thread,true),version(action.throughBlock)];
      case 'bio':return [field(action.name,true),version(action.expectedVersion),...text(action.content,32,false)];
      case 'avatar':return avatar(action);
      case 'name':return nameRegistration(action.first,action.last).arguments;
      case 'subboard':{
        check(typeof action.slug==='string'&&/^[a-z0-9](?:[a-z0-9]|-(?!-)){1,38}[a-z0-9]$/.test(action.slug));
        return [[...new TextEncoder().encode(action.slug),...Array(40-action.slug.length).fill(0)],action.slug.length,
          ...text(action.name,3),...text(action.description,16),...text(action.rules,32,false)];
      }
      case 'like':case 'unlike':return [field(action.post,true),action.type==='like'];
      case 'withdraw':return [field(action.deposit,true)];
      case 'screen':return screeningArguments(board,field(action.deposit,true));
      default:{
        const subboard=field(action.subboard??'0'),kind=action.type==='quote'?2:action.type==='repost'?3:1;
        const policy=subboard===zero?await utility(board,'main_policy',[]):await utility(board,'effective_policy',[subboard]);
        check(Array.isArray(policy)&&policy.length===(subboard===zero?2:5),'ROLLING_POLICY_UNAVAILABLE');
        check(subboard===zero||policy[4]!==true,'ROLLING_SUBBOARD_REJECTED');
        const [message,length]=text(action.content,32,kind!==3);
        const draft={subboard,parent:field(action.parent??'0',action.type==='reply'),root_reference:field(action.root??'0',action.type==='reply'),kind,
          name_id:field(action.name??'0'),reference:field(action.reference??'0',kind!==1),message,length,
          expected_main_policy_version:Number(BigInt(policy[0])),expected_local_policy_version:subboard===zero?0:Number(BigInt(policy[2]))};
        const [deposit,...hints]=await screeningArguments(board,field(action.deposit,true));
        return [deposit,nonce,draft,...hints];
      }
    }
  }
  async function moderatorStatus(){
    await guard();const slot=deployment.board.artifact.storageLayout?.moderator?.slot;check(slot!==undefined,'ROLLING_ABI_MISMATCH');
    const head=await session.node.getBlockData('checkpointed'),number=Number(head?.header?.globalVariables?.blockNumber),hash=hashText(head?.blockHash);
    check(Number.isSafeInteger(number)&&number>0,'ROLLING_INVALID_RESPONSE');await guard();
    const address=new sdk.AztecAddress(new sdk.Fr(BigInt(fixed.board)));
    const moderator=field((await session.node.getPublicStorageAt({hash},address,new sdk.Fr(BigInt(slot)))).toString(),true);
    await guard();const again=await session.node.getBlockData(number);
    check(hashText(again?.blockHash)===hash&&Number(again?.header?.globalVariables?.blockNumber)===number,'ROLLING_CONTEXT_CHANGED');await guard();
    return {authorized:field(owner,true)===moderator};
  }
  async function moderationArguments(action,board){
    check((await moderatorStatus()).authorized,'ROLLING_MODERATOR_REQUIRED');
    const policy=await utility(board,'main_policy',[]);check(Array.isArray(policy)&&policy.length===2,'ROLLING_POLICY_UNAVAILABLE');
    const mainVersion=version(String(BigInt(policy[0]))),mainDigest=field(policy[1]);
    const review={mainVersion,mainDigest};let args;
    if(action.type==='set-main-policy')args=text(action.rules,32);
    else{
      const reason=text(action.reason,7);
      if(action.type==='moderate-post'){
        const id=field(action.post,true),post=await utility(board,'get_post',[id]);
        check(Array.isArray(post)&&post.length===5&&post[0]===true&&BigInt(post[2])===0n,'ROLLING_MODERATION_TARGET_CHANGED');
        const subboard=field(post[1].subboard),localVersion=subboard===zero?0:1;
        Object.assign(review,{target:id,localVersion});args=[id,mainVersion,localVersion,...reason];
      }else if(action.type==='moderate-avatar'){
        const id=field(action.name,true),profile=await utility(board,'profile_state',[id]),removed=await utility(board,'avatar_moderation',[id]);
        const avatarVersion=version(String(BigInt(profile.avatar_version)));
        check(BigInt(profile.avatar_length)>0n&&BigInt(removed.avatar_version)!==BigInt(avatarVersion),'ROLLING_MODERATION_TARGET_CHANGED');
        Object.assign(review,{target:id,avatarVersion,avatarDigest:field(profile.avatar_digest)});args=[id,avatarVersion,mainVersion,...reason];
      }else{
        check(action.type==='reject-subboard');const id=field(action.subboard,true),state=await utility(board,'subboard_state',[id]);
        check(Array.isArray(state)&&state.length===5&&state[0]===true&&state[3]===false,'ROLLING_MODERATION_TARGET_CHANGED');
        Object.assign(review,{target:id,localVersion:1});args=[id,...reason];
      }
    }
    await guard();return {args:plain(args),review};
  }
  async function checkModeration(record){
    if(!moderationTypes.has(record.action.type))return;
    const current=await moderationArguments(record.action,await contract());
    check(same(current.args,record.args)&&same(current.review,record.moderation),'ROLLING_MODERATION_TARGET_CHANGED');
  }
  const bokContract=()=>{check(bok,'ROLLING_BOK_UNAVAILABLE');return sdk.Contract.at(new sdk.AztecAddress(new sdk.Fr(BigInt(bok.address))),deployment.bok.artifact,session.wallet);};
  const uint128=value=>{check(typeof value==='string'&&/^(0|[1-9][0-9]{0,38})$/.test(value)&&BigInt(value)<(1n<<128n));return BigInt(value);};
  async function bokContext(){
    check(bok,'ROLLING_BOK_UNAVAILABLE');await guard();
    const plugin=await utility(await contract(),'get_plugin',[bok.pluginId]);
    check(plugin?.enabled===true&&field(plugin.adapter,true)===field(bok.address,true),'ROLLING_BOK_UNAVAILABLE');
    await guard();return bokContract();
  }
  async function bokCredit(){
    const current=await bokContext(),credit=BigInt(await utility(current,'balance_of',[session.owner],deployment.bok.artifact));
    check(credit>=0n&&credit<(1n<<128n),'ROLLING_INVALID_RESPONSE');await guard();return credit;
  }
  async function waitingBok(record){
    check(record.bok&&record.action.type==='bok','ROLLING_INTENT_CHANGED');
    const current=await bokContext(),request=await utility(current,'request',[record.bok.requestId],deployment.bok.artifact);
    check(request&&BigInt(request.state)===1n&&field(request.invocation_hash,true)===record.bok.target&&
      BigInt(request.budget)===BigInt(record.bok.budget)&&BigInt(request.available)===BigInt(record.bok.budget)&&
      ['reserved','charged','refunded','sequence'].every(key=>BigInt(request[key])===0n),'ROLLING_BOK_REQUEST_CHANGED');
    await guard();
  }
  async function selectedContract(record){return record.bok?.phase==='authorize'?bokContract():contract();}
  async function interaction(board,record){
    check((record.bok?.phase==='post'?'post_with_bok':methods[record.action.type])===record.method,'ROLLING_INTENT_CHANGED');
    let call=board.methods[record.method](...record.args);
    const selectedArtifact=record.bok?.phase==='authorize'?deployment.bok.artifact:deployment.board.artifact;
    const abi=[...selectedArtifact.functions,...(selectedArtifact.nonDispatchPublicFunctions??[])].find(f=>f.name===record.method);check(abi,'ROLLING_ABI_MISMATCH');
    let encoded=sdk.encodeArguments(abi,record.args).map(f=>f.toString());
    if(record.action.type==='claim-deposit'&&record.action.bokReceipt!==undefined){
      checkBokRecord(record);check(record.fundingBok&&typeof sdk.BatchCall==='function','ROLLING_FUNDING_UNAVAILABLE');
      const bokAbi=deployment.bok.artifact.functions.find(f=>f.name==='claim');check(bokAbi,'ROLLING_ABI_MISMATCH');
      encoded=[encoded,sdk.encodeArguments(bokAbi,record.fundingBok.args).map(f=>f.toString())];
      call=new sdk.BatchCall(session.wallet,[call,(await bokContract()).methods.claim(...record.fundingBok.args)]);
    }
    if(record.encoded)check(JSON.stringify(encoded)===JSON.stringify(record.encoded),'ROLLING_INTENT_CHANGED');
    return {call,encoded};
  }
  return Object.freeze({
    async readModeratorStatus(){return exclusive(moderatorStatus);},
    async readBokStatus(){return exclusive(async()=>{if(!bok)return {available:false};try{return {available:true,availableCredit:String(await bokCredit()),pluginId:bok.pluginId};}catch(error){if(error?.code==='ROLLING_BOK_UNAVAILABLE')return {available:false};throw error;}});},
    async readAccountStatus(){
      if(!session)return {status:'locked'};
      return exclusive(async()=>{await guard();const saved=await (await slot()).read();
        if(saved.value&&saved.value.status!=='cancelled'){
          checkBokRecord(saved.value);
          if(!['confirmed','reverted'].includes(saved.value.status))return {status:'recovering',intent:summary(saved.value)};
          const canonical=await outcome(saved);if(!['confirmed','reverted'].includes(canonical.status))return {status:'recovering',intent:canonical};
        }
        let fee;try{fee=await payment();}catch(error){if(error.code==='PRIVATE_FEE_BALANCE_INSUFFICIENT')return {status:'fee-needed'};throw error;}
        const ids=await utility(await contract(),'get_deposit_ids',[session.owner,0]);check(Array.isArray(ids)&&ids.length===10,'ROLLING_INVALID_RESPONSE');
        return {status:ids.some(id=>BigInt(id)!==0n)?'fee-ready':'collateral-pending',privateFeeCredit:String(fee.availableCredit),
          depositIds:ids.filter(id=>BigInt(id)!==0n),postEligibility:'requires-action-simulation'};
      });
    },
    async readProfile({name}={}){return exclusive(async()=>{
      await guard();const id=field(name,true),record=await utility(await contract(),'profile_state',[id]);
      let bioVersion,avatarVersion;
      try{check([record.bio_version,record.avatar_version].every(value=>typeof value==='string'&&/^0x[0-9a-f]{64}$/.test(value)),'ROLLING_INVALID_RESPONSE');
        bioVersion=BigInt(record.bio_version);avatarVersion=BigInt(record.avatar_version);
        check(bioVersion>=0n&&bioVersion<=0xffffffffn&&avatarVersion>=0n&&avatarVersion<=0xffffffffn,'ROLLING_INVALID_RESPONSE');
      }catch{throw fail('ROLLING_INVALID_RESPONSE');}
      await guard();return {name:id,bioVersion:String(bioVersion),avatarVersion:String(avatarVersion)};
    });},
    async readPreferenceHead(){return exclusive(async()=>Object.freeze(await preferenceHead()));},
    async ownedIdentities({cursor=0}={}){return exclusive(async()=>{await guard();check(Number.isInteger(cursor)&&cursor>=0&&cursor<=0xffffffff-8);
      const values=await utility(await contract(),'owned_name_records',[session.owner,cursor]);check(Array.isArray(values)&&values.length===8,'ROLLING_INVALID_RESPONSE');
      const records=[],seen=new Set();let empty=false;
      try{for(const value of values){
        check(value&&Object.keys(value).sort().join()===['name_id','schema','first_length','first','last_length','last'].sort().join(),'ROLLING_INVALID_RESPONSE');
        const id=field(value.name_id),schema=Number(BigInt(value.schema)),firstLength=Number(BigInt(value.first_length)),lastLength=Number(BigInt(value.last_length));
        if(id===zero){
          check(schema===0&&firstLength===0&&lastLength===0&&[value.first,value.last].every(words=>Array.isArray(words)&&words.length===2&&words.every(word=>word===zero)),'ROLLING_INVALID_RESPONSE');empty=true;continue;
        }
        check(!empty&&schema===1&&!seen.has(id),'ROLLING_INVALID_RESPONSE');
        const first=component(value.first,firstLength),last=component(value.last,lastLength),registration=nameRegistration(first,last);
        check(registration.name.first===first&&registration.name.last===last,'ROLLING_INVALID_RESPONSE');
        const expected=await sdk.poseidon2HashWithSeparator(registration.preimage.map(n=>new sdk.Fr(n)),NAME_DOMAIN);
        check(field(expected.toString(),true)===id,'ROLLING_INVALID_RESPONSE');seen.add(id);records.push({id,first,last});
      }}catch{throw fail('ROLLING_INVALID_RESPONSE');}
      await guard();return {identities:records.map(record=>record.id),records,nextCursor:empty?null:cursor+8};});},
    async prepare(input){return exclusive(async()=>{await guard();const action=clone(input),store=await slot();let prior=await store.read();
      if(prior.value&&prior.value.status!=='cancelled'){check(['confirmed','reverted'].includes(prior.value.status),'ROLLING_RECOVERY_REQUIRED');
        const final=await outcome(prior);check(['confirmed','reverted'].includes(final.status),'ROLLING_RECOVERY_REQUIRED');prior=await store.read();}
      const previousTx=await session.journal.assertCanStart();
      const predecessor=previousTx?.value?{operation:previousTx.value.operation??null,txHash:previousTx.value.txHash}:null;
      const nonce=field(sdk.Fr.random().toString(),true),id=field(sdk.Fr.random().toString(),true),board=await contract();
      const allowed=keys[action?.type];check(allowed&&Object.keys(action).every(key=>key==='type'||allowed.includes(key)));
      const moderation=moderationTypes.has(action.type)?await moderationArguments(action,board):null;
      const args=moderation?moderation.args:plain(await argumentsFor(action,board,nonce));
      const record={version:1,id,action,args,method:methods[action.type],nonce,predecessor,status:'prepared',...(moderation?{moderation:moderation.review}:{})};
      if(action.type==='claim-deposit'&&action.bokReceipt!==undefined)record.fundingBok=await bokFundingClaim(action);
      if(action.type==='bok'){
        const budget=uint128(action.budget);check(budget>0n);const available=await bokCredit();check(available>=budget,'ROLLING_BOK_CREDIT_INSUFFICIENT');
        const draft=args[2],requestId=field(sdk.Fr.random().toString(),true);
        const preimage=invocationPreimage({chainId:BigInt(scope.chainId),rollupVersion:BigInt(scope.version),board:BigInt(fixed.board),plugin:BigInt(bok.address),
          subboard:BigInt(draft.subboard),name:BigInt(draft.name_id),nonce:BigInt(nonce),content:action.content});
        const target=field((await sdk.poseidon2HashWithSeparator(preimage.map(n=>new sdk.Fr(n)),INVOCATION_DOMAIN)).toString(),true);
        record.bok={scope:clone(bok),phase:'authorize',requestId,target,budget:String(budget),availableCredit:String(available),postArgs:args};
        record.args=[requestId,target,String(budget)];
      }
      if(preferenceAction(record)){record.originalPreferenceHead=await preferenceHead();check(record.originalPreferenceHead.revision===action.expectedRevision,'ROLLING_RECOVERY_CONTEXT_CHANGED');}
      if(action.type==='read-marker')record.originalMarker=await markerContext(record);
      const selected=await interaction(await selectedContract(record),record);record.encoded=selected.encoded;
      progress('estimating');const estimated=await sdk.estimatePrivateFeeTransaction({wallet:session.wallet,node:session.node,interaction:selected.call,
        prepared:await payment(action),from:session.owner,guard});
      record.maximumFee=estimated.maximumFee.toString();await guard();await store.write(prior,record);return summary(record);
    });},
    async prepareBokPost(id){return exclusive(async()=>{
      await guard();let saved=await savedIntent(id);check(['authorize','post'].includes(saved.value.bok?.phase),'ROLLING_RECOVERY_UNSUPPORTED');
      const previousPhase=saved.value.bok.phase,authorized=await outcome(saved);
      check(authorized.status===(previousPhase==='authorize'?'authorized':'bok-post-reverted'),'ROLLING_RECOVERY_REQUIRED');saved=await savedIntent(id);
      await waitingBok(saved.value);await session.journal.assertCanStart();
      const prior=saved.value,postArgs=plain(await argumentsFor(prior.action,await contract(),prior.nonce));
      // Renew only public policy versions and screening hints. The funded target's
      // deposit, nonce and every immutable post field remain the authorized draft.
      check(same(postArgs.slice(0,2),prior.bok.postArgs.slice(0,2))&&
        ['subboard','parent','root_reference','kind','name_id','reference','message','length'].every(key=>same(postArgs[2][key],prior.bok.postArgs[2][key])),'ROLLING_INTENT_CHANGED');
      const record={...prior,id:field(sdk.Fr.random().toString(),true),method:'post_with_bok',args:[...postArgs,bok.pluginId,prior.bok.requestId],
        status:'prepared',txHash:null,encoded:undefined,predecessor:{operation:operation(prior.id),txHash:prior.txHash},
        bok:{...prior.bok,phase:'post',authorizationTxHash:prior.bok.authorizationTxHash??prior.txHash}};
      const selected=await interaction(await contract(),record);record.encoded=selected.encoded;
      progress('estimating');const estimate=await sdk.estimatePrivateFeeTransaction({wallet:session.wallet,node:session.node,interaction:selected.call,
        prepared:await payment(),from:session.owner,guard});record.maximumFee=estimate.maximumFee.toString();
      await waitingBok(record);await guard();await (await slot()).write(saved,record);return summary(record);
    });},
    // Explicit preference-only recovery. Inspection never acknowledges or writes.
    // Original revision/action/nonce remain immutable; a changed head is unresolved,
    // not silently rebased. Exact-byte recovery is separately user-confirmed and
    // never re-estimates or re-proves. Caller retains its wallet lease throughout.
    async inspectRecovery(id){return exclusive(async()=>{await guard();return recoverySnapshot(await savedIntent(id));});},
    async resumeSaved(id,input){
      let expectedTxHash;try{({expectedTxHash}=exactData(input,['expectedTxHash']));}catch{throw fail('ROLLING_INVALID_ACTION');}
      check(typeof expectedTxHash==='string'&&/^0x[0-9a-f]{64}$/.test(expectedTxHash));
      return exclusive(async()=>{
        await guard();const saved=await savedIntent(id),record=saved.value;
        check(preferenceAction(record),'ROLLING_RECOVERY_UNSUPPORTED');
        check(!['prepared','cancelled','replacement-prepared'].includes(record.status),'ROLLING_RECOVERY_REQUIRED');
        const current=await session.journal.inspect();
        check(current?.operation===operation(id)&&current.txHash===expectedTxHash,'ROLLING_RECOVERY_REQUIRED');
        // Canonical current attempts can reconcile even when their own effect
        // advanced the head. Pending/unknown states never authorize a broadcast.
        const inspected=await session.journal.inspectSavedRecovery(operation(id),expectedTxHash);
        if(inspected.status==='canonical'){await guard();return outcome(saved);}
        check(inspected.status==='resumable','ROLLING_RECOVERY_REQUIRED');
        await checkSavedResumeContext(saved,expectedTxHash);
        await session.journal.recover({expectedOperation:operation(id),expectedTxHash,beforeSubmit:async hash=>{
          check(hash===expectedTxHash,'ROLLING_RECOVERY_REQUIRED');
          await checkSavedResumeContext(saved,expectedTxHash);
        }});
        await guard();check((await savedIntent(id)).encoded===saved.encoded,'ROLLING_RECOVERY_REQUIRED');await guard();
        return outcome(saved);
      });
    },
    async prepareReplacement(id,input){
      // Capture only own data primitives before any asynchronous guard or RPC.
      let reviewInput,expectedHead;try{
        reviewInput=exactData(input,Object.hasOwn(input??{},'expectedMarkerHash')?['expectedTxHash','expectedHead','expectedMarkerHash']:['expectedTxHash','expectedHead']);
        expectedHead=exactData(reviewInput.expectedHead,['initialized','schema','revision','digest']);
      }catch{throw fail('ROLLING_INVALID_ACTION');}
      check(typeof reviewInput.expectedTxHash==='string'&&/^0x[0-9a-f]{64}$/.test(reviewInput.expectedTxHash));
      check(typeof expectedHead.initialized==='boolean'&&expectedHead.schema===1);preferenceRevision(expectedHead.revision);
      check(typeof expectedHead.digest==='string'&&/^(0|[1-9][0-9]*)$/.test(expectedHead.digest)&&BigInt(expectedHead.digest)<FIELD_MODULUS);
      if(Object.hasOwn(reviewInput,'expectedMarkerHash'))check(typeof reviewInput.expectedMarkerHash==='string'&&/^0x[0-9a-f]{64}$/.test(reviewInput.expectedMarkerHash));
      return exclusive(async()=>{await guard();const saved=await savedIntent(id),record=saved.value;
        check(!['prepared','cancelled'].includes(record.status),'ROLLING_RECOVERY_REQUIRED');
        const snapshot=await recoverySnapshot(saved);
        check(snapshot.status==='replacement-available'&&snapshot.currentTxHash===reviewInput.expectedTxHash,'ROLLING_RECOVERY_REQUIRED');
        check(same(snapshot.head,expectedHead),'ROLLING_RECOVERY_CONTEXT_CHANGED');
        check(record.action.type==='read-marker'?Object.hasOwn(reviewInput,'expectedMarkerHash')&&snapshot.marker.blockHash===reviewInput.expectedMarkerHash:!Object.hasOwn(reviewInput,'expectedMarkerHash'),'ROLLING_RECOVERY_CONTEXT_CHANGED');
        await session.journal.allowReplacement(operation(id),{requireMissingAnchor:true});await session.journal.assertCanStart();
        const selected=await interaction(await contract(),record);
        const estimated=await sdk.estimatePrivateFeeTransaction({wallet:session.wallet,node:session.node,interaction:selected.call,prepared:await payment(),from:session.owner,guard});
        const replacementReview={sourceTxHash:snapshot.currentTxHash,head:snapshot.head,marker:snapshot.marker,maximumFee:estimated.maximumFee.toString()};
        const next={...record,status:'replacement-prepared',replacementReview};
        await checkReplacementReview(next);await session.journal.inspectReplacement(operation(id),{requireMissingAnchor:true}).then(view=>check(view.status==='available'&&view.txHash===replacementReview.sourceTxHash,'ROLLING_RECOVERY_REQUIRED'));
        await guard();await (await slot()).write(saved,next);return {...summary(next),replacementReview:clone(replacementReview)};
      });
    },
    async submitPrepared(id){return exclusive(async()=>{await guard();const saved=await savedIntent(id),replacing=saved.value.status==='replacement-prepared';check(replacing||saved.value.status==='prepared','ROLLING_RECOVERY_REQUIRED');
      if(replacing){
        await checkReplacementReview(saved.value);
        const inspected=await session.journal.inspectReplacement(operation(id),{requireMissingAnchor:true});
        check(inspected.status==='available'&&inspected.txHash===saved.value.replacementReview.sourceTxHash,'ROLLING_RECOVERY_REQUIRED');
        await session.journal.allowReplacement(operation(id),{requireMissingAnchor:true});
      }else if(saved.value.predecessor){
        const found=await session.journal.inspectOutcome();acknowledge(found,saved.value.predecessor);
      }
      await session.journal.assertCanStart(); // Before private simulation, not merely before send.
      if(saved.value.action.type==='claim-deposit')check(same(await collateralClaim(saved.value.action),saved.value.args),'ROLLING_FUNDING_MISMATCH');
      if(saved.value.fundingBok)check(same(await bokFundingClaim(saved.value.action),saved.value.fundingBok),'ROLLING_FUNDING_MISMATCH');
      await checkModeration(saved.value);
      if(saved.value.bok?.phase==='authorize'){const available=await bokCredit();check(available>=BigInt(saved.value.bok.budget),'ROLLING_BOK_CREDIT_INSUFFICIENT');}
      if(saved.value.bok?.phase==='post')await waitingBok(saved.value);
      const selected=await interaction(await selectedContract(saved.value),saved.value);progress('estimating');
      const estimated=await sdk.estimatePrivateFeeTransaction({wallet:session.wallet,node:session.node,interaction:selected.call,prepared:await payment(saved.value.action),from:session.owner,guard});
      const maximumFee=replacing?saved.value.replacementReview.maximumFee:saved.value.maximumFee;
      check(estimated.maximumFee<=BigInt(maximumFee),'ROLLING_FEE_CHANGED');await guard();
      await (await slot()).write(saved,{...saved.value,status:'submitting'}); // Durable no-replay fence before wallet lifecycle.
      await guard();progress('submitting');
      await session.wallet.sendTx(estimated.payload,{from:session.owner,fee:{gasSettings:estimated.gasSettings},
        transactionJournal:session.journal,journalOperation:operation(id),...(saved.value.moderation?{beforeSubmit:async()=>{await checkModeration(saved.value);await guard();}}:{}),...(saved.value.bok?{beforeSubmit:async()=>{
          if(saved.value.bok.phase==='post')await waitingBok(saved.value);else await bokContext();await guard();
        }}:{}),...(replacing?{beforeSubmit:async hash=>{
          await session.journal.assertReplacementPredecessors(operation(id),hash,{requireMissingAnchor:true});
          // Predecessor validation itself awaits the node. Refresh the signed
          // action's context afterwards, not before that asynchronous window.
          await checkReplacementReview(saved.value,{synchronize:true});await guard();
        }}:{})});
      return outcome(await savedIntent(id));
    });},
    async cancelPrepared(id){return exclusive(async()=>{await guard();const saved=await savedIntent(id);
      check(saved.value.status==='prepared'&&saved.value.bok?.phase!=='post','ROLLING_RECOVERY_REQUIRED');
      const tx=await session.journal.inspect();check(!tx||tx.operation!==operation(id),'ROLLING_RECOVERY_REQUIRED');
      await guard();const cancelled={...saved.value,status:'cancelled'};await (await slot()).write(saved,cancelled);return summary(cancelled);
    });},
    async reconcile(id){return exclusive(async()=>{await guard();const saved=await savedIntent(id);
      if(['prepared','cancelled','replacement-prepared'].includes(saved.value.status))return {...summary(saved.value),...(saved.value.replacementReview?{replacementReview:clone(saved.value.replacementReview)}:{})};return outcome(saved);
    });},
  });
}
