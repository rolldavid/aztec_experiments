import assert from 'node:assert/strict';
const together=async reads=>{const results=await Promise.allSettled(reads),failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;return results.map(r=>r.value);};
const field=value=>'0x'+BigInt(value).toString(16).padStart(64,'0');
/** Trusted hosted-service capability. Uses the authenticated persistent index,
 * never a user-supplied history or cache response. Returns all chronological
 * posts through this request, including authenticated bot replies/tombstones.
 * A changing publication, missing page or capacity limit fails before billing.
 */
export function rollingConversation({index,node,scope,development=false,maxMessages=4096}){
 assert.equal(typeof development,'boolean');assert(!development||scope.chainId==='31337');
 assert(Number.isSafeInteger(maxMessages)&&maxMessages>=1&&maxMessages<=4096);
 scope=Object.freeze({...scope});const expected=JSON.stringify(scope),sync=index.sync.bind(index),query=index.query.bind(index),status=index.status.bind(index);
 return Object.freeze({async load({postId}){
  const id=field(postId);await sync();const initial=status();assert(initial.state==='ready'&&initial.complete===true);
  assert.equal(JSON.stringify(initial.scope),expected);
  const selected=query('post',{id:BigInt(id).toString()}),request=selected.post;
  assert(request&&field(request.id)===id&&!request.bot&&!request.removal);
  const revision=selected.revision,checkpoint=selected.checkpoint,threadId=field(request.record.root);
  assert.equal(revision,initial.revision);
  const [info,confirmed]=await together([node.getNodeInfo(),node.getBlock('checkpointed')]);assert.equal(String(info.l1ChainId),scope.chainId);assert.equal(String(info.rollupVersion),scope.rollupVersion);
  assert.equal(String(info.l1ContractAddresses.rollupAddress).toLowerCase(),scope.rollupAddress);assert.equal(info.realProofs,!development);
  assert(confirmed&&Number.isSafeInteger(confirmed.number)&&/^0x[0-9a-f]{64}$/.test(String(confirmed.hash)));
  assert(Number.isSafeInteger(checkpoint.number)&&checkpoint.number<=confirmed.number,'Conversation publication is not checkpointed');
  const check=async()=>{
   const current=status();assert(current.state==='ready'&&current.complete&&current.revision===revision);
   const [block,confirmedBlock]=await together([node.getBlockData(checkpoint.number),...(checkpoint.number===confirmed.number?[]:[node.getBlock(confirmed.number)])]);
   assert.equal(Number(block?.header?.globalVariables?.blockNumber),checkpoint.number);assert.equal(String(block?.blockHash),checkpoint.hash);
   assert.equal(checkpoint.number===confirmed.number?String(block.blockHash):String(confirmedBlock?.hash),String(confirmed.hash));
   const end=status();assert(end.state==='ready'&&end.complete===true&&end.revision===revision);
  };
  // Pagination is synchronous under the host's index lane. One check after it
  // authenticates the unchanged revision and both anchors for the whole read.
  const messages=[],captured=[],seen=new Set(),cursors=new Set();let cursor=null,prior=-1n,found=false;
  while(!found){
   const page=query('thread',{root:BigInt(threadId).toString(),limit:100,cursor});
   assert(page.complete===true&&page.revision===revision&&JSON.stringify(page.scope)===expected&&JSON.stringify(page.checkpoint)===JSON.stringify(checkpoint));
   assert(Array.isArray(page.posts)&&page.posts.length>0);
   for(const post of page.posts){
    const postId=field(post.id),order=BigInt(post.order);assert(!seen.has(postId)&&order>prior&&field(post.record.root)===threadId);
    assert(BigInt(post.position.blockNumber)<=BigInt(confirmed.number));
    if(!messages.length)assert.equal(postId,threadId);
    assert(messages.length<maxMessages);seen.add(postId);prior=order;
    messages.push({id:postId,role:post.bot?'assistant':'user',text:post.removal?'[Removed post]':post.text});
    captured.push({id:postId,root:field(post.record.root),order:String(post.order),block:String(post.position.blockNumber),role:post.bot?'assistant':'user',text:post.removal?'[Removed post]':post.text});
    if(postId===id){found=true;break;}
   }
   if(!found){assert(typeof page.nextCursor==='string'&&!cursors.has(page.nextCursor));cursors.add(page.nextCursor);cursor=page.nextCursor;}
  }
  assert.equal(messages.at(-1).text,request.text);await check();
  // The trusted host retains this closure for its immediate pre-inference
  // guard. It validates this exact history; it never reloads a newer thread
  // after a summary has already been paid for. Do not serialize it into a
  // metering request or expose it as a user-supplied capability.
  const assertCurrent=async()=>{
   // Our own reservation advances the public index. A later complete projection
   // is allowed only while the exact summarized rows and original anchors remain
   // canonical. Newer posts do not silently enter the already-paid summary.
   const current=status();assert(current.state==='ready'&&current.complete===true&&JSON.stringify(current.scope)===expected);
   assert(Number.isSafeInteger(current.checkpoint.number)&&current.checkpoint.number>=checkpoint.number);
   const head=await node.getBlock('checkpointed');assert(head&&current.checkpoint.number<=head.number);
   for(const saved of captured){
    const result=query('post',{id:BigInt(saved.id).toString()}),post=result.post;
    assert(result.revision===current.revision&&post);
    assert.deepEqual({id:field(post.id),root:field(post.record.root),order:String(post.order),block:String(post.position.blockNumber),role:post.bot?'assistant':'user',text:post.removal?'[Removed post]':post.text},saved,'Paid conversation changed');
   }
   const anchors=[checkpoint];
   if(current.checkpoint.number===checkpoint.number)assert.equal(current.checkpoint.hash,checkpoint.hash);
   else anchors.push(current.checkpoint);
   // Identical anchors need one read. Independent historic anchors are checked
   // together and fully drained before releasing the shared index lane.
   const blocks=await together(anchors.map(anchor=>node.getBlockData(anchor.number)).concat(
    head.number===confirmed.number||anchors.some(anchor=>anchor.number===confirmed.number)?[]:[node.getBlock(confirmed.number)]));
   for(let i=0;i<anchors.length;i++){const anchor=anchors[i],block=blocks[i];assert.equal(Number(block?.header?.globalVariables?.blockNumber),anchor.number);assert.equal(String(block?.blockHash),anchor.hash);}
   const confirmedIndex=anchors.findIndex(anchor=>anchor.number===confirmed.number);
   const originalHash=head.number===confirmed.number?String(head.hash):confirmedIndex>=0?String(blocks[confirmedIndex]?.blockHash):String(blocks.at(-1)?.hash);
   assert.equal(originalHash,String(confirmed.hash));
   const end=status();assert(end.state==='ready'&&end.complete===true&&end.revision===current.revision);
  };
  return {canonical:true,complete:true,threadId,anchor:{...checkpoint},messages,assertCurrent};
 }});
}
