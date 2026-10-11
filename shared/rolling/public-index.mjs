// Server-side public indexing only. No wallet, private queries, signer or prover.
import {AztecAddress} from '@aztec-labs/stdlib/aztec-address';
import {createHash,randomUUID} from 'node:crypto';
import {createRollingEventDecoder,isRollingEvent,validateRollingScope} from './public-events.mjs';
import {createRollingProjection} from './public-projection.mjs';
const fail=code=>Object.assign(Error('Rolling public history is unavailable.'),{code});
const check=(v,code='ROLLING_PUBLIC_INVALID')=>{if(!v)throw fail(code);};
const hash=v=>typeof v==='string'&&/^0x[0-9a-f]{64}$/.test(v);
const natural=v=>Number.isSafeInteger(v)&&v>=0;
const exact=(v,keys)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join()===keys.slice().sort().join());
const bytes=s=>Buffer.byteLength(s,'utf8');
const copy=v=>structuredClone(v);
const textHash=v=>v?.toString();
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
const field=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,76})$/.test(v);

/** Deployment is a reviewed public manifest anchor {blockNumber,blockHash,txHash}.
 * It must contain RollingBoard's version-1 initial policy, not an arbitrary latest
 * block. storage is the existing bounded public load/atomic commit interface.
 * Its adapter must enforce maxRecordBytes/maxSnapshotBytes BEFORE parsing stored
 * data. Cold sync authenticates complete persisted ranges from canonical full block
 * bodies; JSON digest validation or unchanged checkpoint hashes alone are insufficient.
 * sync is serialized and bounded. Data reads are unavailable until all cold ranges
 * and the checkpointed head are processed. Ordinary public RPC supplies this history;
 * this is canonical consistency checking, not a new trustless consensus client.
 */
export async function createRollingPublicIndex({node,artifact,scope,deployment,storage,rangeSize=10,pagesPerSync=2,
  maxEvents=50000,maxRanges=20000,maxRollbackChecks=128,timeoutMs=20000,maxRecordBytes=1048576,maxSnapshotBytes=67108864}){
  scope=validateRollingScope(scope);deployment=copy(deployment);exact(deployment,['blockNumber','blockHash','txHash']);
  check(natural(deployment.blockNumber)&&deployment.blockNumber>0&&hash(deployment.blockHash)&&hash(deployment.txHash));
  for(const [v,min,max] of [[rangeSize,1,100],[pagesPerSync,1,20],[maxEvents,1,50000],[maxRanges,1,20000],
    [maxRollbackChecks,1,128],[timeoutMs,1,20000],[maxRecordBytes,1024,1048576],[maxSnapshotBytes,1024,67108864]])check(natural(v)&&v>=min&&v<=max);
  const decoder=await createRollingEventDecoder({artifact,scope}),projection=createRollingProjection({isValidatedEvent:isRollingEvent,maxEvents});
  const key='rolling-public-v1:'+createHash('sha256').update(JSON.stringify({scope,deployment})).digest('hex'),epoch=randomUUID();
  let headText=null,state=null,cold=null,coldOffset=0,hydrated=false,busy=false,ready=false,unavailable=false,revision=0,projectionRevision=0;
  const ranges=[];let storedBytes=0;
  const fresh=()=>({schemaVersion:1,scope,deployment,latest:null,eventCount:0,rangeCount:0});
  const checkpoint=()=>ranges.at(-1)?.checkpoint??null;
  function status(){return {schemaVersion:1,state:unavailable?'unavailable':ready?'ready':hydrated?'syncing':'authenticating',scope,
    checkpoint:copy(checkpoint()),complete:ready,revision:`${epoch}:${revision}`,authenticatedRanges:ranges.length,totalRanges:state?.rangeCount??0};}
  async function load(){
    if(state)return;
    const snapshot=await storage.load(key,maxRanges);check(snapshot&&Array.isArray(snapshot.ranges)&&snapshot.ranges.length<=maxRanges);
    headText=snapshot.head;check(headText===null||typeof headText==='string'&&bytes(headText)<=16384);
    const next=headText===null?fresh():JSON.parse(headText);exact(next,['schemaVersion','scope','deployment','latest','eventCount','rangeCount']);
    check(next.schemaVersion===1&&JSON.stringify(next.scope)===JSON.stringify(scope)&&JSON.stringify(next.deployment)===JSON.stringify(deployment));
    check(natural(next.eventCount)&&next.eventCount<=maxEvents&&natural(next.rangeCount)&&next.rangeCount<=maxRanges&&next.rangeCount===snapshot.ranges.length);
    check((next.rangeCount===0&&next.latest===null)||(next.rangeCount>0&&uuid(next.latest)));
    let prior=null,from=deployment.blockNumber,count=0,total=0;const records=[];
    for(const item of [...snapshot.ranges].reverse()){
      check(uuid(item.id)&&typeof item.value==='string'&&bytes(item.value)<=maxRecordBytes);total+=bytes(item.value);check(total<=maxSnapshotBytes);
      const value=JSON.parse(item.value);exact(value,['schemaVersion','previous','from','checkpoint','events']);exact(value.checkpoint,['number','hash']);
      check(value.schemaVersion===1&&value.previous===prior&&value.from===from&&natural(value.checkpoint.number)&&value.checkpoint.number>=from&&value.checkpoint.number-from<rangeSize&&hash(value.checkpoint.hash));
      check(Array.isArray(value.events)&&value.events.length<=maxEvents);count+=value.events.length;check(count<=maxEvents);
      records.push({id:item.id,value,size:bytes(item.value)});prior=item.id;from=value.checkpoint.number+1;
    }
    check(prior===next.latest&&count===next.eventCount);state=next;cold=records;storedBytes=total;
  }
  async function sync(){
    check(!busy,'ROLLING_PUBLIC_BUSY');busy=true;ready=false;unavailable=false;
    const deadline=Date.now()+timeoutMs;
    async function read(fn){const left=deadline-Date.now();check(left>0,'ROLLING_PUBLIC_TIMEOUT');let timer;
      try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail('ROLLING_PUBLIC_TIMEOUT')),left);})]);}finally{clearTimeout(timer);}}
    async function blockData(number){const block=await read(()=>node.getBlockData(number));
      if(!block)return null;const n=Number(block.header?.globalVariables?.blockNumber),h=textHash(block.blockHash);
      check(natural(n)&&hash(h));return {number:n,hash:h};}
    try{
      await read(load);
      const info=await read(()=>node.getNodeInfo());check(String(info.l1ChainId)===scope.chainId&&String(info.rollupVersion)===scope.rollupVersion&&textHash(info.l1ContractAddresses?.rollupAddress)===scope.rollupAddress);
      const instance=await read(()=>node.getContract(AztecAddress.fromBigIntUnsafe(BigInt(scope.boardAddress))));
      check(textHash(instance?.currentContractClassId)===scope.classId&&textHash(instance?.originalContractClassId)===scope.classId);
      const tip=await blockData('checkpointed');check(tip&&tip.number>=deployment.blockNumber);
      const origin=await blockData(deployment.blockNumber);check(origin?.hash===deployment.blockHash&&origin.number===deployment.blockNumber);
      async function scan(from,to){
        const events=[],anchors=[];let effects=0;
        for(let number=from;number<=to;number++){
          const block=await read(()=>node.getBlock(number,{includeTransactions:true}));check(block&&Number(block.header?.globalVariables?.blockNumber)===number&&hash(textHash(block.hash))&&Array.isArray(block.body?.txEffects));
          effects+=block.body.txEffects.length;check(effects<=4096);anchors.push({number,hash:textHash(block.hash)});
          const seen=new Set();
          for(const tx of block.body.txEffects){const txHash=textHash(tx.txHash);check(hash(txHash)&&!seen.has(txHash)&&Array.isArray(tx.publicLogs)&&tx.publicLogs.length<=4096);seen.add(txHash);
            if(tx.publicLogs.some(log=>textHash(log.contractAddress)===scope.boardAddress)){
              const decoded=await read(()=>decoder.decodeTransaction(node,txHash));
              check(decoded.every(e=>Number(e.position.blockNumber)===number&&e.position.blockHash===textHash(block.hash)));
              events.push(...decoded);check(events.length<=maxEvents&&bytes(JSON.stringify(events))<=maxRecordBytes);
            }
          }
        }
        if(from===deployment.blockNumber)check(events.some(e=>e.position.txHash===deployment.txHash&&e.type==='MainPolicyPublished'&&e.payload.version==='1'));
        for(const a of anchors){const now=await blockData(a.number);check(now?.number===a.number&&now.hash===a.hash);}
        const last=await blockData(tip.number);check(last?.hash===tip.hash&&last.number===tip.number);
        return {events,checkpoint:anchors.at(-1)};
      }
      async function rollback(keep,allRanges=ranges){
        const removed=allRanges.slice(keep),next={...state,latest:keep?allRanges[keep-1].id:null,
          rangeCount:keep,eventCount:allRanges.slice(0,keep).reduce((n,r)=>n+r.eventCount,0)};
        const serialized=JSON.stringify(next);await read(()=>storage.commit(key,headText,serialized,null,removed.map(r=>r.id)));
        while(ranges.length>keep){ranges.pop().undo();projectionRevision++;}storedBytes-=removed.reduce((n,r)=>n+r.size,0);
        headText=serialized;state=next;revision++;
      }
      let pages=0;
      while(!hydrated&&coldOffset<cold.length&&pages<pagesPerSync){
        const retained=cold[coldOffset],c=retained.value.checkpoint,current=c.number<=tip.number?await blockData(c.number):null;
        if(c.number<=tip.number)check(current,'ROLLING_PUBLIC_UNAVAILABLE');
        if(!current||current.hash!==c.hash){
          const all=cold.map(r=>({id:r.id,eventCount:r.value.events.length,size:r.size}));await rollback(coldOffset,all);cold=cold.slice(0,coldOffset);break;
        }
        const canonical=await scan(retained.value.from,c.number);
        check(JSON.stringify(canonical.events)===JSON.stringify(retained.value.events),'ROLLING_PUBLIC_CACHE_MISMATCH');
        const staged=projection.stage(canonical.events);staged.apply();projectionRevision++;
        ranges.push({id:retained.id,checkpoint:c,eventCount:canonical.events.length,size:retained.size,undo:staged.undo});coldOffset++;revision++;pages++;
      }
      if(!hydrated&&coldOffset===cold.length){
        const latest=await read(()=>storage.load(key,maxRanges));check(latest.head===headText,'PUBLIC_FEED_CONFLICT');hydrated=true;cold=null;
      }
      if(hydrated){
        let keep=ranges.length,checks=0;
        while(keep){const c=ranges[keep-1].checkpoint,current=c.number<=tip.number?await blockData(c.number):null;
          if(c.number<=tip.number)check(current,'ROLLING_PUBLIC_UNAVAILABLE');if(current?.hash===c.hash)break;
          if(++checks>=maxRollbackChecks){keep=0;break;}keep--;
        }
        if(keep!==ranges.length)await rollback(keep);
        while(pages<pagesPerSync){const from=(checkpoint()?.number??deployment.blockNumber-1)+1;if(from>tip.number)break;
          const to=Math.min(from+rangeSize-1,tip.number),canonical=await scan(from,to);
          check(state.eventCount+canonical.events.length<=maxEvents&&ranges.length<maxRanges,'ROLLING_PUBLIC_CAPACITY');
          const value={schemaVersion:1,previous:state.latest,from,checkpoint:canonical.checkpoint,events:canonical.events},serialized=JSON.stringify(value),size=bytes(serialized);
          check(size<=maxRecordBytes&&storedBytes+size<=maxSnapshotBytes,'ROLLING_PUBLIC_CAPACITY');
          const staged=projection.stage(canonical.events),id=randomUUID(),next={...state,latest:id,eventCount:state.eventCount+canonical.events.length,rangeCount:ranges.length+1},nextText=JSON.stringify(next);
          check(storedBytes+size+bytes(nextText)<=maxSnapshotBytes,'ROLLING_PUBLIC_CAPACITY');
          await read(()=>storage.commit(key,headText,nextText,{id,value:serialized},[]));
          staged.apply();projectionRevision++;ranges.push({id,checkpoint:canonical.checkpoint,eventCount:canonical.events.length,size,undo:staged.undo});state=next;headText=nextText;storedBytes+=size;revision++;pages++;
        }
        ready=checkpoint()?.number===tip.number;
      }
      return {...status(),pages};
    }catch(error){unavailable=true;throw error?.code?error:fail('ROLLING_PUBLIC_UNAVAILABLE');}
    finally{busy=false;}
  }
  function query(view,params={}){
    check(ready&&!busy&&!unavailable,'ROLLING_PUBLIC_NOT_READY');
    let cursor=params.cursor??null;if(cursor!==null){check(typeof cursor==='string'&&cursor.startsWith(epoch+':')&&cursor.length<=120,'ROLLING_PUBLIC_CURSOR_STALE');cursor=cursor.slice(epoch.length+1);check(/^[0-9]+:[0-9]+$/.test(cursor)&&Number(cursor.split(':')[0])===projectionRevision,'ROLLING_PUBLIC_CURSOR_STALE');}
    const requested=params.limit??50;check(Number.isSafeInteger(requested)&&requested>=1&&requested<=100);
    function envelopeFor(limit){
      const options={limit,cursor};let result;
      if(view==='feed')result=projection.feed(options);
      else if(view==='directory')result=projection.directory({...options,query:params.query??''});
      else if(view==='thread'){check(field(params.root));result=projection.thread(params.root,options);}
      else if(view==='profile'){check(field(params.nameId));result=projection.profile(params.nameId,options);}
      else if(view==='post'){check(field(params.id));result={post:projection.post(params.id)};}
      else throw fail('ROLLING_PUBLIC_INVALID');
      if(result.nextCursor)result.nextCursor=epoch+':'+result.nextCursor;
      const envelope={schemaVersion:1,scope,checkpoint:checkpoint(),complete:true,...result,revision:`${epoch}:${revision}`};
      if(view!=='directory'){
        const names={},boards={};for(const post of result.posts??(result.post?[result.post]:[])){
          // Current profile content is resolved once per distinct name at query
          // time, not embedded again in every historical post.
          if(post.record.name_id!=='0'&&!Object.hasOwn(names,post.record.name_id)){const name=projection.identity(post.record.name_id);check(name);names[name.id]=name;}
          if(post.record.subboard!=='0'&&!Object.hasOwn(boards,post.record.subboard)){const board=projection.board(post.record.subboard);check(board);boards[board.id]={id:board.id,name:board.name,slug:board.slug};}
        }envelope.names=names;envelope.boards=boards;
      }
      return envelope;
    }
    // Match the unchanged HTTP and reader 1MiB cap including all metadata,
    // current avatars, checkpoint and epoch-prefixed cursor. Re-query rather
    // than slicing: the projection alone determines the correct next cursor.
    const fits=value=>bytes(JSON.stringify(value))<=1048576;
    const initial=envelopeFor(requested);if(fits(initial))return copy(initial);
    check(view!=='post','ROLLING_PUBLIC_CAPACITY');
    let low=1,high=requested-1,best=null;
    while(low<=high){const limit=Math.floor((low+high)/2),candidate=envelopeFor(limit);
      if(fits(candidate)){best=candidate;low=limit+1;}else high=limit-1;
    }
    check(best,'ROLLING_PUBLIC_CAPACITY');return copy(best);
  }
  return Object.freeze({key,scope,sync,status,query});
}
