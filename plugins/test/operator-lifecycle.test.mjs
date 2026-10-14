import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {rollingOperatorConfig,rollingLifecycleConfig,rollingOperatorCommandScope,readOperatorActor,bindRollingJournal,onceAztecOperation,reconcileRollingEthereum,verifyPluginPortalRuntime,operatorEthereumRequest} from '../operations.mjs';
const f=n=>'0x'+BigInt(n).toString(16).padStart(64,'0'),a=n=>'0x'+BigInt(n).toString(16).padStart(40,'0');
const config=()=>({applicationProfile:'rolling',nodeUrl:'http://127.0.0.1:8083/v1/node',ethereumUrl:'http://127.0.0.1:8545/',chainId:'31337',rollupVersion:'3409706519',rollupAddress:a(1),boardAddress:f(2),operatorAddress:f(3),development:true});
const lifecycle=()=>({tokenAddress:a(4),pluginId:f(5)});
const memory=initial=>{let value=structuredClone(initial??{operations:{}});return {read:()=>value,write:async next=>{value=structuredClone(next);}};};

test('lifecycle config leaves exact historical constructor identity unchanged',()=>{
 const c=config(),original=JSON.stringify(rollingOperatorConfig(c));assert.equal(JSON.stringify(rollingOperatorConfig({...c,lifecycle:lifecycle()})),original);
 const input={...c,lifecycle:lifecycle()},captured=rollingLifecycleConfig(input);input.lifecycle.tokenAddress=a(9);assert.equal(captured.tokenAddress,a(4));assert(Object.isFrozen(captured));
});
test('lifecycle config rejects inherited accessors unknown fields and noncanonical IDs before actor reads',async()=>{
 let reads=0,gets=0;
 const bad=[undefined,{},Object.create(lifecycle()),{...lifecycle(),tokenAddress:a(0)},{...lifecycle(),pluginId:f(0)},{...lifecycle(),pluginId:f(2n**255n)},{...lifecycle(),tokenAddress:{toString(){gets++;return a(4);}}},{...lifecycle(),secret:'private'},Object.defineProperty({},'tokenAddress',{get(){gets++;return a(4);}})];
 for(const value of bad)await assert.rejects(readOperatorActor({command:'bind',config:{...config(),lifecycle:value},read:async()=>{reads++;}}));
 assert.equal(reads,0);assert.equal(gets,0);
});
test('actual CLI actor boundary admits only explicitly configured lifecycle commands',async()=>{
 let reads=0;const read=async()=>{reads++;return {address:f(3)};};
 for(const command of ['deploy-portal','bind','activate','register','status']){
  assert.equal(rollingOperatorCommandScope(command,{...config(),lifecycle:lifecycle()}),'portal-registration');
  await readOperatorActor({command,config:{...config(),lifecycle:lifecycle()},read});
 }
 for(const command of ['withdraw-earnings','redeem-earnings','future','config'])await assert.rejects(readOperatorActor({command,config:{...config(),lifecycle:lifecycle()},read}));
 assert.equal(reads,5);
});
test('constructor campaign accepts separately bound lifecycle records without identity migration',async()=>{
 const store=memory();await bindRollingJournal(store,'original-constructor',()=>f(7));
 const salt=store.read().salt;
 for(const name of ['deploy-portal','bind','activate','register']){
  let sends=0;
  const args={store,name,identity:'lifecycle-v1',journalIdentity:'original-constructor',scope:'portal-registration',execute:async({submit})=>{await submit({hash:f(8),raw:'ab'},async()=>{sends++;throw Error('response lost');});},reconcile:async r=>({status:'unresolved',hash:r.hash})};
  await onceAztecOperation(args);await onceAztecOperation({...args,execute:()=>assert.fail('replay')});assert.equal(sends,1);
  await bindRollingJournal(store,'original-constructor',()=>assert.fail());
 }
 assert.equal(store.read().salt,salt);assert.equal(store.read().identity,'original-constructor');
});
for(const name of ['deploy-portal','bind','activate','register'])test(`${name}: retained preparing and signed outcomes never prepare sign fund or resend`,async()=>{
 for(const phase of ['preparing','submission-unknown']){
  const record={schemaVersion:1,policy:'reconcile-only',identity:'scope',journalIdentity:'constructor',phase,...(phase==='submission-unknown'?{hash:f(8),raw:'abcd'}:{})},store=memory({operations:{[name]:record}}),before=JSON.stringify(store.read());let reads=0;
  const got=await onceAztecOperation({store,name,identity:'scope',journalIdentity:'constructor',scope:'portal-registration',execute:()=>assert.fail(),reconcile:async r=>{reads++;assert.deepEqual(r,record);return {status:'unresolved'};}});
  assert.equal(got.status,'unresolved');assert.equal(reads,1);assert.equal(JSON.stringify(store.read()),before);
  await assert.rejects(onceAztecOperation({store,name,identity:'changed',execute:()=>assert.fail(),reconcile:()=>assert.fail()}));
 }
});
function ethereumFixture(){
 const receipt={hash:f(8),status:1,blockNumber:9,blockHash:f(9)};let effects=0;
 return {record:{phase:'submission-unknown',hash:f(8),raw:'abcd'},development:false,receipt,effects:()=>effects,
  reads:{signed:async()=>true,receipt:async()=>receipt,block:async()=>({hash:f(9)}),head:async tag=>{assert.equal(tag,'finalized');return {number:10};},effect:async()=>{effects++;return true;}}};
}
test('L1 reconciliation requires exact retained bytes hash canonical receipt effect and finality',async()=>{
 const x=ethereumFixture(),r=await reconcileRollingEthereum(x);assert.equal(r.status,'succeeded');assert.equal(r.canonical,true);assert.equal(r.scope,'portal-registration');assert.equal(x.effects(),1);
});
for(const defect of ['unsigned','pending','wrong-hash','reverted','reorg','not-finalized','wrong-effect','unavailable'])test(`L1 reconciliation ${defect} preserves original record and never broadcasts`,async()=>{
 const x=ethereumFixture(),before=JSON.stringify(x.record);
 if(defect==='unsigned')x.reads.signed=async()=>false;
 if(defect==='pending')x.reads.receipt=async()=>null;
 if(defect==='wrong-hash')x.receipt.hash=f(10);
 if(defect==='reverted')x.receipt.status=0;
 if(defect==='reorg'){let n=0;x.reads.block=async()=>({hash:++n===1?f(9):f(10)});}
 if(defect==='not-finalized')x.reads.head=async()=>({number:8});
 if(defect==='wrong-effect')x.reads.effect=async()=>false;
 if(defect==='unavailable')x.reads.receipt=async()=>{throw Error('PRIVATE_UPSTREAM');};
 const r=await reconcileRollingEthereum(x);assert.equal(r.status,defect==='reverted'?'failed':'unresolved');assert(!JSON.stringify(r).includes('PRIVATE_UPSTREAM'));assert.equal(JSON.stringify(x.record),before);
 if(defect==='reverted')assert.equal(x.effects(),0);
});
test('portal verifier checks complete actual compiler runtime and every immutable occurrence',async()=>{
 const artifact=JSON.parse(await fs.readFile(new URL('../../billboard/portal/out/PluginPortal.sol/PluginPortal.json',import.meta.url),'utf8'));
 const metadata=artifact.deployedBytecode,bytes=Buffer.from(metadata.object.slice(2),'hex');let v=1;
 for(const refs of Object.values(metadata.immutableReferences)){for(const ref of refs)Buffer.from(f(v).slice(2),'hex').copy(bytes,ref.start);v++;}
 const actual='0x'+bytes.toString('hex');assert(verifyPluginPortalRuntime(actual,metadata));
 const changed=Buffer.from(bytes);changed[0]^=1;assert.throws(()=>verifyPluginPortalRuntime('0x'+changed.toString('hex'),metadata));
 const duplicate=structuredClone(metadata);Object.values(duplicate.immutableReferences)[0][1]={...Object.values(duplicate.immutableReferences)[0][0]};assert.throws(()=>verifyPluginPortalRuntime(actual,duplicate));
 const inconsistent=Buffer.from(bytes);inconsistent[Object.values(metadata.immutableReferences)[0][1].start+31]^=1;assert.throws(()=>verifyPluginPortalRuntime('0x'+inconsistent.toString('hex'),metadata));
 assert.throws(()=>verifyPluginPortalRuntime(actual+'00',metadata));
});
test('actual installed portal ABI retains constructor and activation shape with no test settlement entrypoint',async()=>{
 const {Interface}=await import('ethers'),artifact=JSON.parse(await fs.readFile(new URL('../../billboard/portal/out/PluginPortal.sol/PluginPortal.json',import.meta.url),'utf8')),abi=new Interface(artifact.abi);
 assert.deepEqual(abi.deploy.inputs.map(x=>x.type),['address','bytes32','uint256','address']);
 assert.deepEqual(abi.getFunction('activate').inputs.map(x=>x.type),['uint256','uint256','uint256','bytes32[]']);
 assert.equal(abi.getFunction('settle'),null);
});
test('actual ethers request never follows a redirect or retries throttled signed submission',async()=>{
 const {FetchRequest}=await import('ethers');let count=0,status=307,endpoint;
 const server=createServer((req,res)=>{count++;req.resume();res.writeHead(status,{location:endpoint,'retry-after':'1'});res.end('bounded public fixture');});
 try{
  server.listen(0,'127.0.0.1');await once(server,'listening');endpoint='http://127.0.0.1:'+server.address().port+'/';
  for(status of [307,429]){const request=operatorEthereumRequest(FetchRequest,endpoint);request.body=JSON.stringify({jsonrpc:'2.0',method:'eth_sendRawTransaction',params:['0x00'],id:1});await assert.rejects(request.send(),/Operator Ethereum RPC unavailable/);}
  assert.equal(count,2);
 }finally{await new Promise(r=>server.close(r));server.closeAllConnections();}
});

test('actual ethers signed lifecycle bytes reject wrong sender nonce chain value target and calldata',async()=>{
 const {Wallet,Transaction,keccak256}=await import('ethers'),{matchRollingEthereumSigned}=await import('../operations.mjs');
 const signer=new Wallet('0x'+'11'.repeat(32)); // Public deterministic test key; no provider.
 const tx={type:2,chainId:31337,nonce:2,gasLimit:100000,maxFeePerGas:10,maxPriorityFeePerGas:1,to:a(9),data:'0x1234',value:0};
 const raw=await signer.signTransaction(tx),record={raw:raw.slice(2),hash:keccak256(raw)};
 const args={parse:Transaction.from,record,chainId:'31337',to:a(9),data:'0x1234',from:signer.address.toLowerCase(),nonce:2};
 assert.equal(matchRollingEthereumSigned(args),true);
 for(const patch of [{chainId:'11155111'},{to:a(8)},{to:null},{data:'0x1235'},{from:a(1)},{nonce:3},{record:{...record,hash:f(99)}},{record:{...record,raw:'nothex'}}])assert.equal(matchRollingEthereumSigned({...args,...patch}),false);
 const paid=await signer.signTransaction({...tx,value:1});assert.equal(matchRollingEthereumSigned({...args,record:{raw:paid.slice(2),hash:keccak256(paid)}}),false);
});

test('Ready reread remains bound to original canonical transaction block and unique exact leaf',async()=>{
 const {requireRollingReadyEffect}=await import('../operations.mjs');
 const leaf={isZero:()=>false,equals:other=>other===leaf},zero={isZero:()=>true};
 const receipt={transactionHash:f(8),blockNumber:9,blockHash:f(9)},effect={l2BlockNumber:9,l2BlockHash:f(9),data:{txHash:f(8),revertCode:{isOK:()=>true},l2ToL1Msgs:[zero,leaf]}};
 assert(requireRollingReadyEffect(effect,receipt,leaf));
 for(const patch of [{l2BlockNumber:10},{l2BlockHash:f(10)},{data:{...effect.data,txHash:f(10)}},{data:{...effect.data,revertCode:{isOK:()=>false}}},{data:{...effect.data,l2ToL1Msgs:[leaf,leaf]}},{data:{...effect.data,l2ToL1Msgs:[zero]}}])assert.throws(()=>requireRollingReadyEffect({...effect,...patch},receipt,leaf));
});

test('Sepolia seed uses installed official mint ABI with finite deadline minimums owner and exact ETH refund',async()=>{
 const {sepoliaLiquidityTransactions}=await import('../operations.mjs'),{Interface}=await import('ethers');
 const abi=new Interface(['function multicall(bytes[]) payable returns(bytes[])','function createAndInitializePoolIfNecessary(address,address,uint24,uint160) payable returns(address)','function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) payable returns(uint256,uint128,uint256,uint256)','function refundETH() payable']);
 const p=sepoliaPlan();const steps=await sepoliaLiquidityTransactions(p),usdc=steps.find(s=>s.name==='seed-usdc-fee'),weth=steps.find(s=>s.name==='seed-weth-fee');assert(steps.indexOf(usdc)<steps.indexOf(weth));
 for(const s of [usdc,weth]){const calls=abi.decodeFunctionData('multicall',s.data)[0],init=abi.decodeFunctionData('createAndInitializePoolIfNecessary',calls[0]),mint=abi.decodeFunctionData('mint',calls[1])[0];assert.equal(init[2],3000n);assert.equal(mint.fee,3000n);assert.equal(mint.tickLower,-887220n);assert.equal(mint.tickUpper,887220n);assert.equal(mint.recipient.toLowerCase(),p.owner);assert.equal(mint.deadline,BigInt(p.expiresAt));assert.equal(mint.amount0Min,(mint.amount0Desired*99n+99n)/100n);assert.equal(mint.amount1Min,(mint.amount1Desired*99n+99n)/100n);assert.equal(calls.length,s===weth?3:2);if(s===weth)assert.equal(abi.parseTransaction({data:calls[2]}).name,'refundETH');}
 assert.equal(usdc.value,'0');assert.equal(weth.value,p.ethAmount);
 const single=await sepoliaLiquidityTransactions({...p,includeWethPool:false,ethAmount:'0',gasLimits:Object.fromEntries(Object.entries(p.gasLimits).filter(([k])=>k!=='seed-weth-fee'))});assert(!single.some(s=>s.name==='seed-weth-fee'));
});
function sepoliaPlan(){return {schemaVersion:1,campaign:'sepolia-seed-cli-controlled',chainId:'11155111',ethereumUrl:'https://example.org/',owner:a(1),inventoryOwner:a(2),ownerNonce:14,inventoryNonce:10,expiresAt:2000000000,feeAmount:'10000000000000000000',usdcAmount:'48000',ethAmount:'1000000000000',inventoryEth:'0',includeWethPool:true,gasLimits:{'inventory-usdc':'150000','approve-fee':'150000','approve-usdc':'150000','seed-usdc-fee':'40000000','seed-weth-fee':'40000000','revoke-fee':'150000','revoke-usdc':'150000'},maxFeePerGas:'1100000',maxPriorityFeePerGas:'1000000',futureReserveWei:'132000000000000',usdcImplementation:'0xda317c1d3e835dd5f1be459006471acaa1289068',usdcImplementationCodeHash:'0x'+'b'.repeat(64),codeHashes:Object.fromEntries(['factory','positions','fee','usdc','weth'].map(n=>[n,f(1)]))};}
test('actual Sepolia CLI rejects invalid plan and missing retained state before provider or private key loading',async()=>{
 const os=await import('node:os'),path=await import('node:path'),{seedTestnetLiquidity}=await import('../operator.mjs'),{sha256,toUtf8Bytes}=await import('ethers'),{captureSepoliaLiquidityPlan}=await import('../operations.mjs');
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'seed-cli-'));await fs.chmod(directory,0o700);const statePath=path.join(directory,'state.json');
 try{
  await assert.rejects(seedTestnetLiquidity({plan:{...sepoliaPlan(),chainId:'31337'},statePath,stage:'inventory-usdc',keyFile:'/unavailable'}));assert.deepEqual(await fs.readdir(directory),[]);
  const plan=captureSepoliaLiquidityPlan(sepoliaPlan());await fs.writeFile(statePath+'.initialized.json',JSON.stringify({schemaVersion:1,binding:sha256(toUtf8Bytes(JSON.stringify(plan))),campaign:plan.campaign}),{mode:0o600});
  await assert.rejects(seedTestnetLiquidity({plan,statePath,stage:'inventory-usdc',keyFile:'/unavailable'}),/preserve original plan/);assert.deepEqual(await fs.readdir(directory),['state.json.initialized.json']);
 }finally{await fs.rm(directory,{recursive:true});}
});
