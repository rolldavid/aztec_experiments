export const topupSwapAbi=Object.freeze([
 'function exactOutputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountOut,uint256 amountInMaximum,uint160 sqrtPriceLimitX96)) payable returns(uint256)',
 'function refundETH() payable',
 'function multicall(uint256 deadline,bytes[] data) payable returns(bytes[])',
]);
const lower=value=>typeof value==='string'?value.toLowerCase():'';
const address=value=>/^0x[0-9a-f]{40}$/.test(value)&&BigInt(value)>0n;
const positive=value=>typeof value==='string'&&/^[1-9][0-9]{0,77}$/.test(value);
const check=(value,code='SWAP_INVALID')=>{if(!value)throw Object.assign(Error('The ETH exchange could not be verified.'),{code:'ROLLING_FUNDING_'+code});};

// The same authenticated SwapRouter02/QuoterV2 used by account funding can
// buy credit without creating another posting deposit. The wallet receives
// the USDC; the existing portal approval and deposit follow separately.
export async function prepareTopupSwap({ethers,provider,scope,portal,token,recipient,amount,chainId}){
 const {Interface,keccak256}=ethers;
 const topupSwapInterface=new Interface(topupSwapAbi);
 const scopeInterface=new Interface(['function weth() view returns(address)','function swapRouter() view returns(address)','function bokToken() view returns(address)','function bokPortal() view returns(address)','function chainId() view returns(uint256)']);
 const quoteInterface=new Interface(['function quoteExactOutputSingle((address tokenIn,address tokenOut,uint256 amount,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256,uint160,uint32,uint256)']);

 check(scope&&scope.chainId===chainId&&scope.bokPortal===portal&&scope.bokToken===token,'SWAP_UNAVAILABLE');
 check(address(recipient)&&positive(amount));
 check(String((await provider.getNetwork()).chainId)===chainId,'MISMATCH');
 const head=await provider.getBlock('latest');
 check(Number.isSafeInteger(head?.number)&&Number.isSafeInteger(head?.timestamp)&&head.timestamp>0&&/^0x[0-9a-f]{64}$/.test(head.hash));
 for(const [where,hash] of [[scope.router,scope.routerCodeHash],[scope.quoter,scope.quoterCodeHash]]){
  check(address(where)&&/^0x[0-9a-f]{64}$/.test(hash));
  check(keccak256(await provider.getCode(where,head.number))===hash,'SWAP_SCOPE');
 }
 for(const key of ['weth','swapRouter','bokToken','bokPortal','chainId']){
  const encoded=await provider.call({to:scope.router,data:scopeInterface.encodeFunctionData(key),blockTag:head.number});
  check(String(scopeInterface.decodeFunctionResult(key,encoded)[0]).toLowerCase()===scope[key],'SWAP_SCOPE');
 }
 const quoted=quoteInterface.decodeFunctionResult('quoteExactOutputSingle',await provider.call({to:scope.quoter,
  data:quoteInterface.encodeFunctionData('quoteExactOutputSingle',[[scope.weth,token,amount,3000,0]]),blockTag:head.number}))[0];
 check(quoted>0n,'SWAP_LIQUIDITY');
 const maximumWei=((quoted*101n+99n)/100n).toString();
 const expected={kind:'topup-swap',amount,token,weth:scope.weth,recipient,poolFee:3000,maximumWei,deadline:String(head.timestamp+900)};
 const data=topupSwapInterface.encodeFunctionData('multicall',[expected.deadline,[
  topupSwapInterface.encodeFunctionData('exactOutputSingle',[[scope.weth,token,3000,recipient,amount,maximumWei,0]]),
  topupSwapInterface.encodeFunctionData('refundETH'),
 ]]).toLowerCase();
 check((await provider.getBlock(head.number))?.hash===head.hash,'MISMATCH');
 return {to:scope.swapRouter,data,value:maximumWei,expected};
}

export function validateTopupSwapIntent(record,scope,ethers){
 const topupSwapInterface=new ethers.Interface(topupSwapAbi);
 const e=record.expected;
 check(e&&Object.keys(e).sort().join()==='amount,deadline,kind,maximumWei,poolFee,recipient,token,weth');
 check(e.kind==='topup-swap'&&address(e.token)&&address(e.weth)&&e.token!==e.weth&&address(e.recipient));
 check(positive(e.amount)&&BigInt(e.amount)<1n<<128n&&positive(e.maximumWei)&&positive(e.deadline)&&e.poolFee===3000);
 check(record.value===e.maximumWei&&record.from===e.recipient&&record.to===scope.portal&&scope.token===e.token);
 const data=topupSwapInterface.encodeFunctionData('multicall',[e.deadline,[
  topupSwapInterface.encodeFunctionData('exactOutputSingle',[[e.weth,e.token,e.poolFee,e.recipient,e.amount,e.maximumWei,0]]),
  topupSwapInterface.encodeFunctionData('refundETH'),
 ]]).toLowerCase();
 check(record.data===data);
}

export function verifyTopupSwapEffects(record,receipt,ethers){
 const transferInterface=new ethers.Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
 const e=record.expected;
 let received=0n;
 for(const log of receipt.logs){
  if(lower(log.address)!==e.token||lower(log.topics?.[0])!==transferInterface.getEvent('Transfer').topicHash.toLowerCase())continue;
  const transfer=transferInterface.parseLog(log);
  if(lower(transfer.args.to)===e.recipient)received+=transfer.args.value;
  if(lower(transfer.args.from)===e.recipient)received-=transfer.args.value;
 }
 check(received===BigInt(e.amount),'SWAP_EFFECT');
 return {amount:e.amount,recipient:e.recipient};
}
