import {createEncryptedJournalSlot} from '../journal-record.mjs';
import {l2JournalScopeText} from '../l2-journal.mjs';
import {nameRegistration} from './name-policy.mjs';
import {FIELD_MODULUS} from './invocation.mjs';

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
function text(value,count,required=true){
  check(typeof value==='string'&&value.isWellFormed()&&!value.includes('\0'));
  const bytes=new TextEncoder().encode(value);check(bytes.length<=count*31&&(!required||bytes.length));
  const packed=Array(count).fill(0n);for(let i=0;i<bytes.length;i++)packed[Math.floor(i/31)]|=BigInt(bytes[i])<<BigInt(8*(30-i%31));
  return [packed.map(n=>field(n.toString())),bytes.length];
}
const keys={name:['first','last'],subboard:['slug','name','description','rules'],like:['post'],unlike:['post'],withdraw:['deposit'],
  post:['deposit','content','name','subboard'],reply:['deposit','content','name','subboard','parent','root'],
  quote:['deposit','content','name','subboard','reference'],repost:['deposit','content','name','subboard','reference']};
const methods={name:'register_name',subboard:'create_subboard',like:'set_like',unlike:'set_like',withdraw:'withdraw',post:'post',reply:'post',quote:'post',repost:'post'};

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
 * hex strings. ownedIdentities returns private IDs, never a public ownership grouping.
 * A prepared post includes authenticated-wallet screening hints and live policy versions.
 * submit delegates the sole prove/journal/send lifecycle to wallet.sendTx. Once its
 * durable fence exists, only read-only reconcile is allowed, including after a crash
 * before transaction bytes were saved. Missing receipt is never absence. No automatic
 * replacement; cancelPrepared permits only the pre-send prepared state. Recovery UI must preserve both encrypted journals.
 * This slice excludes bridging, deposit claims, L1 exits and composite Bok request/post;
 * withdraw is ONLY existing funded deposit's L2 exit. These remain integration work.
 */
export function createRollingApplication({sdk,deployment,accountSession,privateStore,publicReader,onProgress=()=>{},contextGuard}){
  void publicReader; // Private methods must never send anything to this dependency.
  let busy=false,slotPromise;
  const session=accountSession;
  const owner=session?.owner?.toString();
  const fixed=deployment&&{board:deployment.board.address.toString(),network:clone(deployment.network),portal:deployment.portal,
    fee:deployment.privateFee.address.toString(),gas:JSON.parse(JSON.stringify(deployment.privateFee.gasSettings,(_,v)=>typeof v==='bigint'?v.toString():v)),proofsEnabled:deployment.proofsEnabled!==false};
  const scope=session&&fixed&&{account:owner,chainId:String(fixed.network.chainId),version:String(fixed.network.version),
    rollup:fixed.network.rollup,board:fixed.board,portal:fixed.portal};
  const slot=()=>slotPromise??=createEncryptedJournalSlot({storage:privateStore,walletSecret:session.walletSecret,walletSalt:session.walletSalt,
    scopeText:JSON.stringify(['ROLLING_WORKFLOW_V1',l2JournalScopeText(scope)]),keyDomain:'ROLLING_WORKFLOW_V1'});
  async function guard(){
    check(session&&typeof contextGuard==='function','ROLLING_LOCKED');await contextGuard();
    check(owner===session.owner.toString()&&sdk.isTrustedPrivateNode(session.node)&&
      session.wallet.aztecNode===session.node&&sdk.isPrivateWalletForNode(session.wallet,session.node)&&sdk.isPrivatePXEForNode(session.wallet.pxe,session.node)&&fixed.board===deployment.board.address.toString()&&fixed.fee===deployment.privateFee.address.toString()&&
      JSON.stringify(fixed.network)===JSON.stringify(deployment.network)&&fixed.portal===deployment.portal,'ROLLING_CONTEXT_CHANGED');
    await sdk.inspectTrustedNode(session.node,{expectedNetworkScope:fixed.network,proofsEnabled:fixed.proofsEnabled});
    const chain=await session.wallet.getChainInfo();check(String(chain.chainId)===scope.chainId&&String(chain.version)===scope.version,'ROLLING_CONTEXT_CHANGED');
    const accounts=await session.wallet.getAccounts();check(accounts.some(a=>(a.address??a).toString()===owner),'ROLLING_CONTEXT_CHANGED');
  }
  async function exclusive(fn){check(!busy,'ROLLING_BUSY');busy=true;try{return await fn();}finally{busy=false;}}
  const progress=stage=>{try{onProgress({stage});}catch{/* display errors cannot alter transaction control */}};
  const contract=()=>sdk.Contract.at(new sdk.AztecAddress(new sdk.Fr(BigInt(fixed.board))),deployment.board.artifact,session.wallet);
  async function utility(board,name,args){const out=await board.methods[name](...args).simulate({from:session.owner});return plain(out.result??out);}
  async function payment(){return sdk.preparePrivateFeePayment({wallet:session.wallet,node:session.node,owner:session.owner,
    privateFeeAddress:fixed.fee,privateFeeArtifact:deployment.privateFee.artifact,expectedChainId:scope.chainId,expectedVersion:scope.version,gasSettings:fixed.gas});}
  const operation=id=>`ROLLING_WORKFLOW_V1:${id}`;
  function summary(record){return {intentId:record.id,action:clone(record.action),status:record.status,maximumFee:record.maximumFee,
    nonce:record.nonce,txHash:record.txHash??null,stage:'single-transaction'};}
  async function savedIntent(id){const saved=await (await slot()).read();check(saved.value?.id===id,'ROLLING_INTENT_NOT_FOUND');return saved;}
  function acknowledge(found,expected){
    check(found&&found.operation===expected.operation&&found.txHash===expected.txHash&&
      ['success','reverted'].includes(found.outcome)&&found.receipt?.txHash?.toString()===found.txHash,'ROLLING_RECOVERY_REQUIRED');
    // inspectOutcome verified this exact receipt canonically. assertCanStart still
    // rechecks canonicality and rejects non-final reverted sender-tagging ranges.
    session.journal.confirmed(found.receipt);
  }
  async function outcome(saved){
    const found=await session.journal.inspectOutcome();
    if(!found||found.operation!==operation(saved.value.id))return {...summary(saved.value),status:'unknown'};
    if(!['success','reverted'].includes(found.outcome))return {...summary(saved.value),status:'unknown',txHash:found.txHash};
    acknowledge(found,{operation:operation(saved.value.id),txHash:saved.value.txHash??found.txHash});
    const next={...saved.value,status:found.outcome==='success'?'confirmed':'reverted',txHash:found.txHash};
    await (await slot()).write(saved,next);return summary(next);
  }
  async function argumentsFor(action,board,nonce){
    const allowed=keys[action?.type];check(allowed&&Object.keys(action).every(k=>k==='type'||allowed.includes(k)));
    switch(action.type){
      case 'name':return nameRegistration(action.first,action.last).arguments;
      case 'subboard':{
        check(typeof action.slug==='string'&&/^[a-z0-9](?:[a-z0-9]|-(?!-)){1,38}[a-z0-9]$/.test(action.slug));
        return [[...new TextEncoder().encode(action.slug),...Array(40-action.slug.length).fill(0)],action.slug.length,
          ...text(action.name,3),...text(action.description,16),...text(action.rules,32,false)];
      }
      case 'like':case 'unlike':return [field(action.post,true),action.type==='like'];
      case 'withdraw':return [field(action.deposit,true)];
      default:{
        const subboard=field(action.subboard??'0'),kind=action.type==='quote'?2:action.type==='repost'?3:1;
        const policy=subboard===zero?await utility(board,'main_policy',[]):await utility(board,'effective_policy',[subboard]);
        check(Array.isArray(policy)&&policy.length===(subboard===zero?2:5)&&policy[4]!==true,'ROLLING_POLICY_UNAVAILABLE');
        const [message,length]=text(action.content,32,kind!==3);
        const draft={subboard,parent:field(action.parent??'0',action.type==='reply'),root_reference:field(action.root??'0',action.type==='reply'),kind,
          name_id:field(action.name??'0'),reference:field(action.reference??'0',kind!==1),message,length,
          expected_main_policy_version:Number(BigInt(policy[0])),expected_local_policy_version:subboard===zero?0:Number(BigInt(policy[2]))};
        const deposit=field(action.deposit,true),hints=await utility(board,'get_screen_hints',[session.owner,deposit]);
        check(Array.isArray(hints)&&hints.length===2&&!(!hints[0]&&hints[1]),'ROLLING_HISTORY_UNAVAILABLE');
        return [deposit,nonce,draft,...hints];
      }
    }
  }
  function interaction(board,record){
    check(methods[record.action.type]===record.method,'ROLLING_INTENT_CHANGED');
    const call=board.methods[record.method](...record.args);
    const abi=deployment.board.artifact.functions.find(f=>f.name===record.method);check(abi,'ROLLING_ABI_MISMATCH');
    const encoded=sdk.encodeArguments(abi,record.args).map(f=>f.toString());
    if(record.encoded)check(JSON.stringify(encoded)===JSON.stringify(record.encoded),'ROLLING_INTENT_CHANGED');
    return {call,encoded};
  }
  return Object.freeze({
    async readAccountStatus(){
      if(!session)return {status:'locked'};
      return exclusive(async()=>{await guard();const saved=await (await slot()).read();
        if(saved.value&&saved.value.status!=='cancelled'){
          if(!['confirmed','reverted'].includes(saved.value.status))return {status:'recovering',intent:summary(saved.value)};
          const canonical=await outcome(saved);if(!['confirmed','reverted'].includes(canonical.status))return {status:'recovering',intent:canonical};
        }
        let fee;try{fee=await payment();}catch(error){if(error.code==='PRIVATE_FEE_BALANCE_INSUFFICIENT')return {status:'fee-needed'};throw error;}
        const ids=await utility(await contract(),'get_deposit_ids',[session.owner,0]);check(Array.isArray(ids)&&ids.length===10,'ROLLING_INVALID_RESPONSE');
        return {status:ids.some(id=>BigInt(id)!==0n)?'fee-ready':'collateral-pending',privateFeeCredit:String(fee.availableCredit),
          depositIds:ids.filter(id=>BigInt(id)!==0n),postEligibility:'requires-action-simulation'};
      });
    },
    async ownedIdentities({cursor=0}={}){return exclusive(async()=>{await guard();check(Number.isInteger(cursor)&&cursor>=0&&cursor<=0xffffffff-8);
      const ids=await utility(await contract(),'owned_names',[session.owner,cursor]);check(Array.isArray(ids)&&ids.length===8,'ROLLING_INVALID_RESPONSE');
      return {identities:ids.filter(id=>BigInt(id)!==0n),nextCursor:ids.every(id=>BigInt(id)!==0n)?cursor+8:null};});},
    async prepare(input){return exclusive(async()=>{await guard();const action=clone(input),store=await slot();let prior=await store.read();
      if(prior.value&&prior.value.status!=='cancelled'){check(['confirmed','reverted'].includes(prior.value.status),'ROLLING_RECOVERY_REQUIRED');
        const final=await outcome(prior);check(['confirmed','reverted'].includes(final.status),'ROLLING_RECOVERY_REQUIRED');prior=await store.read();}
      const previousTx=await session.journal.assertCanStart();
      const predecessor=previousTx?.value?{operation:previousTx.value.operation??null,txHash:previousTx.value.txHash}:null;
      const nonce=field(sdk.Fr.random().toString(),true),id=field(sdk.Fr.random().toString(),true),board=await contract();
      const args=plain(await argumentsFor(action,board,nonce));
      const record={version:1,id,action,args,method:methods[action.type],nonce,predecessor,status:'prepared'};
      const selected=interaction(board,record);record.encoded=selected.encoded;
      progress('estimating');const estimated=await sdk.estimatePrivateFeeTransaction({wallet:session.wallet,node:session.node,interaction:selected.call,
        prepared:await payment(),from:session.owner,guard});
      record.maximumFee=estimated.maximumFee.toString();await guard();await store.write(prior,record);return summary(record);
    });},
    async submitPrepared(id){return exclusive(async()=>{await guard();const saved=await savedIntent(id);check(saved.value.status==='prepared','ROLLING_RECOVERY_REQUIRED');
      if(saved.value.predecessor){
        const found=await session.journal.inspectOutcome();acknowledge(found,saved.value.predecessor);
      }
      await session.journal.assertCanStart(); // Before private simulation, not merely before send.
      const selected=interaction(await contract(),saved.value);progress('estimating');
      const estimated=await sdk.estimatePrivateFeeTransaction({wallet:session.wallet,node:session.node,interaction:selected.call,prepared:await payment(),from:session.owner,guard});
      check(estimated.maximumFee<=BigInt(saved.value.maximumFee),'ROLLING_FEE_CHANGED');await guard();
      await (await slot()).write(saved,{...saved.value,status:'submitting'}); // Durable no-replay fence before wallet lifecycle.
      await guard();progress('submitting');
      await session.wallet.sendTx(estimated.payload,{from:session.owner,fee:{gasSettings:estimated.gasSettings},
        transactionJournal:session.journal,journalOperation:operation(id)});
      return outcome(await savedIntent(id));
    });},
    async cancelPrepared(id){return exclusive(async()=>{await guard();const saved=await savedIntent(id);
      check(saved.value.status==='prepared','ROLLING_RECOVERY_REQUIRED');
      const tx=await session.journal.inspect();check(!tx||tx.operation!==operation(id),'ROLLING_RECOVERY_REQUIRED');
      await guard();const cancelled={...saved.value,status:'cancelled'};await (await slot()).write(saved,cancelled);return summary(cancelled);
    });},
    async reconcile(id){return exclusive(async()=>{await guard();const saved=await savedIntent(id);
      if(['prepared','cancelled'].includes(saved.value.status))return summary(saved.value);return outcome(saved);
    });},
  });
}
