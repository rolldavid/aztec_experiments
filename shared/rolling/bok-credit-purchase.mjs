import {Interface,keccak256} from 'ethers';
export const bokCreditPurchaseAbi=Object.freeze([
 'function buyCredit((bytes32 commitment,uint128 amount,bytes32 secretHash,uint24 poolFee,uint256 deadline)) payable returns(bytes32 key,uint256 index)',
 'event CreditPurchased(address indexed payer,bytes32 indexed commitment,uint128 amount,bytes32 secretHash,bytes32 key,uint256 index,uint256 spentWei,uint256 refundWei)',
]);
const abi=new Interface(bokCreditPurchaseAbi),portalAbi=new Interface(['event Deposited(bytes32 indexed account,uint128 amount,bytes32 key,uint256 index)']);
const scopeAbi=new Interface(['function chainId() view returns(uint256)','function bokPortal() view returns(address)','function bokToken() view returns(address)','function weth() view returns(address)','function swapRouter() view returns(address)']);
const quoteAbi=new Interface(['function quoteExactOutputSingle((address tokenIn,address tokenOut,uint256 amount,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)']);
const lower=value=>typeof value==='string'?value.toLowerCase():'';
const address=value=>/^0x[0-9a-f]{40}$/.test(value)&&BigInt(value)>0n;
const hash=value=>/^0x[0-9a-f]{64}$/.test(value);
const field=value=>hash(value)&&BigInt(value)>0n&&BigInt(value)<21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const positive=value=>typeof value==='string'&&/^[1-9][0-9]{0,77}$/.test(value);
const check=(value,code='PURCHASE_INVALID')=>{if(!value)throw Object.assign(Error('The credit payment could not be verified.'),{code:'ROLLING_FUNDING_'+code});};
const together=async tasks=>{const results=await Promise.allSettled(tasks.map(task=>Promise.resolve().then(task)));const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;return results.map(result=>result.value);};
export function captureBokTopupScope(value){
 const keys=['chainId','router','routerCodeHash','bokPortal','bokToken','weth','swapRouter','quoter','quoterCodeHash'];
 check(value&&keys.every(key=>Object.getOwnPropertyDescriptor(value,key)&&'value' in Object.getOwnPropertyDescriptor(value,key)),'SWAP_UNAVAILABLE');
 const s=Object.fromEntries(keys.map(key=>[key,value[key]]));check(positive(s.chainId));
 for(const key of ['router','bokPortal','bokToken','weth','swapRouter','quoter'])check(address(s[key]));
 check(hash(s.routerCodeHash)&&hash(s.quoterCodeHash)&&s.bokToken!==s.weth);return Object.freeze(s);
}
async function verifyRouter(provider,s,block,read){
 await together([
  async()=>check(keccak256(await read(()=>provider.getCode(s.router,block)))===s.routerCodeHash,'PURCHASE_SCOPE'),
  ...['chainId','bokPortal','bokToken','weth','swapRouter'].map(key=>async()=>{
   const result=await read(()=>provider.call({to:s.router,data:scopeAbi.encodeFunctionData(key),blockTag:block}));
   check(String(scopeAbi.decodeFunctionResult(key,result)[0]).toLowerCase()===s[key],'PURCHASE_SCOPE');
  }),
 ]);
}
export async function prepareBokCreditPurchase({provider,scope,portal,token,recipient,secretHash,amount,chainId}){
 const s=captureBokTopupScope(scope);check(s.chainId===chainId&&s.bokPortal===portal&&s.bokToken===token,'PURCHASE_SCOPE');
 check(field(recipient)&&field(secretHash)&&positive(amount)&&BigInt(amount)<1n<<128n);
 const [network,head]=await together([()=>provider.getNetwork(),()=>provider.getBlock('latest')]);
 check(String(network.chainId)===chainId&&Number.isSafeInteger(head?.number)&&Number.isSafeInteger(head?.timestamp)&&head.timestamp>0&&hash(head.hash),'PURCHASE_SCOPE');
 await together([()=>verifyRouter(provider,s,head.number,fn=>fn()),async()=>check(keccak256(await provider.getCode(s.quoter,head.number))===s.quoterCodeHash,'PURCHASE_SCOPE')]);
 const quoted=quoteAbi.decodeFunctionResult('quoteExactOutputSingle',await provider.call({to:s.quoter,data:quoteAbi.encodeFunctionData('quoteExactOutputSingle',[[s.weth,token,amount,3000,0]]),blockTag:head.number}))[0];
 check(quoted>0n,'SWAP_LIQUIDITY');const maximumWei=((quoted*101n+99n)/100n).toString();
 const expected={kind:'bok-purchase',amount,recipient,secretHash,portal,token,weth:s.weth,swapRouter:s.swapRouter,routerCodeHash:s.routerCodeHash,poolFee:3000,maximumWei,deadline:String(head.timestamp+900)};
 const data=abi.encodeFunctionData('buyCredit',[[recipient,amount,secretHash,expected.poolFee,expected.deadline]]).toLowerCase();
 check((await provider.getBlock(head.number))?.hash===head.hash,'MISMATCH');return {to:s.router,data,value:maximumWei,expected};
}
export function validateBokCreditPurchaseIntent(record,scope){
 const e=record.expected;
 check(e&&Object.keys(e).sort().join()==='amount,deadline,kind,maximumWei,poolFee,portal,recipient,routerCodeHash,secretHash,swapRouter,token,weth');
 check(e.kind==='bok-purchase'&&positive(e.amount)&&BigInt(e.amount)<1n<<128n&&positive(e.maximumWei)&&positive(e.deadline)&&[100,500,3000,10000].includes(e.poolFee));
 check([e.portal,e.token,e.weth,e.swapRouter].every(address)&&e.token!==e.weth&&hash(e.routerCodeHash)&&field(e.recipient)&&field(e.secretHash));
 check(record.value===e.maximumWei&&record.to===scope.portal&&scope.token===e.token);
 check(record.data===abi.encodeFunctionData('buyCredit',[[e.recipient,e.amount,e.secretHash,e.poolFee,e.deadline]]).toLowerCase());
}
export function bokCreditPurchaseIntentFromTransaction(tx,scope){
 const s=captureBokTopupScope(scope);check(lower(tx.to)===s.router&&String(tx.chainId)===s.chainId&&positive(String(tx.value)),'PURCHASE_SCOPE');
 const parsed=abi.parseTransaction({data:tx.data,value:tx.value});check(parsed?.name==='buyCredit');const p=parsed.args[0];
 const expected={kind:'bok-purchase',amount:String(p.amount),recipient:lower(p.commitment),secretHash:lower(p.secretHash),portal:s.bokPortal,token:s.bokToken,weth:s.weth,swapRouter:s.swapRouter,routerCodeHash:s.routerCodeHash,poolFee:Number(p.poolFee),maximumWei:String(tx.value),deadline:String(p.deadline)};
 const record={from:lower(tx.from),to:s.router,chainId:s.chainId,nonce:tx.nonce,data:lower(tx.data),value:String(tx.value),expected};
 validateBokCreditPurchaseIntent(record,{portal:s.router,token:s.bokToken});return record;
}
export async function verifyBokCreditPurchaseEffects(provider,record,receipt,read=fn=>fn()){
 const own=(value,key)=>{const d=Object.getOwnPropertyDescriptor(value??{},key);check(d&&'value' in d);return d.value;};
 const expected=own(record,'expected');
 record=Object.freeze({...Object.fromEntries(['from','to','chainId','nonce','data','value'].map(key=>[key,own(record,key)])),expected:Object.freeze(Object.fromEntries(Object.keys(expected).map(key=>[key,own(expected,key)])))});
 const blockNumber=receipt.blockNumber,logs=structuredClone(receipt.logs);
 validateBokCreditPurchaseIntent(record,{portal:record.to,token:record.expected.token});const e=record.expected;
 await verifyRouter(provider,{chainId:record.chainId,router:record.to,routerCodeHash:e.routerCodeHash,bokPortal:e.portal,bokToken:e.token,weth:e.weth,swapRouter:e.swapRouter},blockNumber,read);
 const events=(where,interface_,name)=>logs.filter(log=>lower(log.address)===where&&lower(log.topics?.[0])===interface_.getEvent(name).topicHash.toLowerCase()).map(log=>interface_.parseLog(log).args);
 const bought=events(record.to,abi,'CreditPurchased'),deposited=events(e.portal,portalAbi,'Deposited');check(bought.length===1&&deposited.length===1,'PURCHASE_EFFECT');
 const b=bought[0],d=deposited[0];
 check(lower(b.payer)===record.from&&lower(b.commitment)===e.recipient&&String(b.amount)===e.amount&&lower(b.secretHash)===e.secretHash&&field(lower(b.key))&&b.spentWei>0n&&b.spentWei+b.refundWei===BigInt(record.value),'PURCHASE_EFFECT');
 check(lower(d.account)===e.recipient&&String(d.amount)===e.amount&&lower(d.key)===lower(b.key)&&d.index===b.index,'PURCHASE_EFFECT');
 return {account:e.recipient,amount:e.amount,key:lower(b.key),index:b.index};
}
