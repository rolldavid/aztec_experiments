import test from 'node:test';
import assert from 'node:assert/strict';
import {Interface,keccak256} from 'ethers';
import {prepareBokCreditPurchase,bokCreditPurchaseAbi,bokCreditPurchaseIntentFromTransaction,verifyBokCreditPurchaseEffects,validateBokCreditPurchaseIntent} from './bok-credit-purchase.mjs';
const a=n=>'0x'+n.toString(16).padStart(40,'0'),h=n=>'0x'+n.toString(16).padStart(64,'0');
const abi=new Interface(bokCreditPurchaseAbi),scopeAbi=new Interface(['function chainId() view returns(uint256)','function bokPortal() view returns(address)','function bokToken() view returns(address)','function weth() view returns(address)','function swapRouter() view returns(address)']);
const portalAbi=new Interface(['event Deposited(bytes32 indexed account,uint128 amount,bytes32 key,uint256 index)']);
const quoteAbi=new Interface(['function quoteExactOutputSingle((address tokenIn,address tokenOut,uint256 amount,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)']);
function fixture(){
 const scope={chainId:'31337',router:a(1),routerCodeHash:keccak256('0x6000'),bokPortal:a(2),bokToken:a(3),weth:a(4),swapRouter:a(5),quoter:a(6),quoterCodeHash:keccak256('0x6001')};
 const calls=[],provider={getNetwork:async()=>({chainId:31337n}),getBlock:async()=>({number:9,timestamp:100,hash:h(9)}),getCode:async address=>address===scope.router?'0x6000':'0x6001',call:async request=>{
  calls.push(request);if(request.to===scope.quoter)return quoteAbi.encodeFunctionResult('quoteExactOutputSingle',[1000,0,0,100]);
  const parsed=scopeAbi.parseTransaction({data:request.data});return scopeAbi.encodeFunctionResult(parsed.name,[scope[parsed.name]]);
 }};
 const input={provider,scope,portal:scope.bokPortal,token:scope.bokToken,recipient:h(11),secretHash:h(12),amount:'2000000',chainId:scope.chainId};
 return {scope,provider,input,calls};
}
async function purchaseFixture(){
 const f=fixture(),payment=await prepareBokCreditPurchase(f.input),tx={...payment,from:a(20),chainId:'31337',nonce:7},record=bokCreditPurchaseIntentFromTransaction(tx,f.scope);
 const event=(where,iface,name,values)=>({address:where,...iface.encodeEventLog(iface.getEvent(name),values)});
 const receipt={blockNumber:9,logs:[event(f.scope.router,abi,'CreditPurchased',[tx.from,h(11),2000000,h(12),h(13),4,1000,10]),event(f.scope.bokPortal,portalAbi,'Deposited',[h(11),2000000,h(13),4])]};
 return {...f,tx,record,receipt};
}
test('one exact-output ETH payment contains the exact credit and private commitment',async()=>{
 const f=await purchaseFixture();assert.equal(f.tx.to,f.scope.router);assert.equal(f.tx.value,'1010');assert.equal(f.record.expected.deadline,'1000');
 assert.deepEqual(await verifyBokCreditPurchaseEffects(f.provider,f.record,f.receipt),{account:h(11),amount:'2000000',key:h(13),index:4n});
 assert(f.calls.every(request=>request.blockTag===9));
});
for(const [name,change] of [
 ['different value',f=>f.record.value='1011'],['different calldata',f=>f.record.data+='00'],['wrong runtime',f=>f.provider.getCode=async()=> '0x6002'],
 ['wrong immutable token',f=>f.scope.bokToken=a(90)],['missing purchase event',f=>f.receipt.logs.shift()],['duplicate portal event',f=>f.receipt.logs.push(f.receipt.logs[1])],
 ['different portal recipient',f=>f.receipt.logs[1]={address:f.scope.bokPortal,...portalAbi.encodeEventLog(portalAbi.getEvent('Deposited'),[h(99),2000000,h(13),4])}],
 ['different portal key',f=>f.receipt.logs[1]={address:f.scope.bokPortal,...portalAbi.encodeEventLog(portalAbi.getEvent('Deposited'),[h(11),2000000,h(99),4])}],
])test('atomic credit receipt rejects '+name,async()=>{const f=await purchaseFixture();change(f);await assert.rejects(verifyBokCreditPurchaseEffects(f.provider,f.record,f.receipt));});
test('configured route and canonical quote block are checked before presenting payment',async()=>{
 const f=fixture();f.input.portal=a(99);await assert.rejects(prepareBokCreditPurchase(f.input));
 f.input.portal=f.scope.bokPortal;let reads=0;f.provider.getBlock=async()=>({number:9,timestamp:100,hash:h(++reads===1?9:10)});await assert.rejects(prepareBokCreditPurchase(f.input));
});
test('new router cannot be relabelled as a different payment destination or token',async()=>{
 const f=await purchaseFixture();assert.throws(()=>validateBokCreditPurchaseIntent(f.record,{portal:a(99),token:f.scope.bokToken}));
 assert.throws(()=>validateBokCreditPurchaseIntent(f.record,{portal:f.scope.router,token:a(99)}));
});
test('receipt verification binds a detached request and logs before asynchronous reads',async()=>{
 const f=await purchaseFixture(),held=Promise.withResolvers(),entered=Promise.withResolvers(),getCode=f.provider.getCode;
 f.provider.getCode=async(...args)=>{entered.resolve();await held.promise;return getCode(...args);};
 const result=verifyBokCreditPurchaseEffects(f.provider,f.record,f.receipt);await entered.promise;
 f.record.expected.recipient=h(99);f.record.value='999';f.receipt.logs=[];held.resolve();
 assert.deepEqual(await result,{account:h(11),amount:'2000000',key:h(13),index:4n});
});
