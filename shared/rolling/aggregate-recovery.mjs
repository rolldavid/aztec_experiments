import {Interface,AbiCoder,keccak256} from 'ethers';
import {aggregateFundingAbi} from './aggregate-funding.mjs';
const router=new Interface(aggregateFundingAbi);
const board=new Interface(['event Deposited(address indexed depositor,uint128 amount,bytes32 secretHash,bytes32 key,uint256 index)']);
const fee=new Interface(['event DepositToAztecPublic(bytes32 indexed to,uint256 amount,bytes32 secretHash,bytes32 key,uint256 index)']);
const bok=new Interface(['event Deposited(bytes32 indexed account,uint128 amount,bytes32 key,uint256 index)']);
const lower=x=>typeof x==='string'?x.toLowerCase():'';
const check=x=>{if(!x)throw Object.assign(Error('Aggregate funding recovery is unresolved.'),{code:'BB_ETH_RECOVERY_REQUIRED'});};
const hex=(x,n=32)=>typeof x==='string'&&new RegExp('^0x[0-9a-f]{'+n*2+'}$').test(x)&&BigInt(x)>0n;
const field=x=>hex(x)&&BigInt(x)<21888242871839275222246405745257275088548364400416034343698204186575808495617n;
/** Fixed aggregate variant of the existing Ethereum journal; never sends or retries. */
export function validateAggregateFundingIntent(record){
 const e=record.expected,keys=['kind','routerCodeHash','collateralPortal','feePortal','bokPortal','privateFpc','planHash'];
 check(e&&Object.keys(e).sort().join()===keys.sort().join()&&e.kind==='aggregate-funding');
 for(const key of ['collateralPortal','feePortal','bokPortal'])check(hex(e[key],20));
 check(new Set([record.to,e.collateralPortal,e.feePortal,e.bokPortal]).size===4);
 check(hex(e.routerCodeHash)&&hex(e.planHash)&&field(e.privateFpc));
 const parsed=router.parseTransaction({data:record.data,value:record.value});
 check(parsed?.name==='fund'&&lower(router.encodeFunctionData('fund',parsed.args))===record.data);
 const p=parsed.args[0];check(lower(p.beneficiary)===record.from&&p.collateral>0n&&p.collateral<2n**96n);
 for(const leg of [p.fee,p.bok])check(leg.amount>0n&&leg.amount<2n**128n&&leg.maxEth>0n&&[100n,500n,3000n,10000n].includes(leg.poolFee));
 for(const value of [p.collateralSecretHash,p.feeSecretHash,p.bokCommitment,p.bokSecretHash])check(field(lower(value)));
 check(p.deadline>0n&&parsed.args[1].length>2&&parsed.args[1].length<=8194);
 check(BigInt(record.value)===p.collateral+p.fee.maxEth+p.bok.maxEth);
 check(keccak256(AbiCoder.defaultAbiCoder().encode([router.getFunction('fund').inputs[0]],[p]))===e.planHash);
 return p;
}
export async function verifyAggregateFundingEffects(provider,record,receipt,read=fn=>fn()){
 const p=validateAggregateFundingIntent(record),e=record.expected;
 const code=await read(()=>provider.getCode(record.to,receipt.blockNumber));
 check(typeof code==='string'&&/^0x(?:[0-9a-fA-F]{2})+$/.test(code)&&keccak256(code)===e.routerCodeHash);
 check(Array.isArray(receipt.logs)&&receipt.logs.length<=4096);
 const one=(address,abi,name)=>{
  const topic=abi.getEvent(name).topicHash,logs=receipt.logs.filter(l=>lower(l.address)===address&&lower(l.topics?.[0])===topic);
  check(logs.length===1);const log=logs[0];check(Array.isArray(log.topics)&&log.topics.length<=4&&typeof log.data==='string'&&log.data.length<=4096);
  return abi.parseLog(log).args;
 };
 const funded=one(record.to,router,'Funded');
 check(lower(funded.beneficiary)===record.from&&funded.planHash===e.planHash&&funded.collateral===p.collateral&&funded.feeAmount===p.fee.amount&&funded.bokAmount===p.bok.amount);
 check(funded.feeEth>0n&&funded.feeEth<=p.fee.maxEth&&funded.bokEth>0n&&funded.bokEth<=p.bok.maxEth&&funded.refund===p.fee.maxEth+p.bok.maxEth-funded.feeEth-funded.bokEth);
 const collateral=one(e.collateralPortal,board,'Deposited'),privateFee=one(e.feePortal,fee,'DepositToAztecPublic'),credit=one(e.bokPortal,bok,'Deposited');
 check(lower(collateral.depositor)===record.from&&collateral.amount===p.collateral&&collateral.secretHash===p.collateralSecretHash);
 check(privateFee.to===e.privateFpc&&privateFee.amount===p.fee.amount&&privateFee.secretHash===p.feeSecretHash);
 check(credit.account===p.bokCommitment&&credit.amount===p.bok.amount);
 for(const event of [collateral,privateFee,credit])check(field(lower(event.key))&&event.index>=0n);
 // Each claim verifier still checks canonical L1 finality and its L1→L2 witness.
 return {planHash:e.planHash,refund:funded.refund.toString(),feeEth:funded.feeEth.toString(),bokEth:funded.bokEth.toString(),
  collateral:{amount:String(collateral.amount),secretHash:collateral.secretHash,messageKey:collateral.key,leafIndex:String(collateral.index)},
  privateFee:{amount:String(privateFee.amount),secretHash:privateFee.secretHash,messageKey:privateFee.key,leafIndex:String(privateFee.index)},
  bok:{amount:String(credit.amount),secretHash:p.bokSecretHash,messageKey:credit.key,leafIndex:String(credit.index),commitment:credit.account}};
}
