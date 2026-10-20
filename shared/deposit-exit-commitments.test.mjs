import test from 'node:test';
import assert from 'node:assert/strict';
import {AbiCoder,encodeBytes32String,getBytes} from 'ethers';
import {encodeDepositExitCommitment,encodeEscrowCommitment} from './protocol-commitments.mjs';
const hex=n=>'0x'+BigInt(n).toString(16).padStart(64,'0'),eth=n=>'0x'+BigInt(n).toString(16).padStart(40,'0');
const scope={l1ChainId:'31337',rollupAddress:eth(1),rollupVersion:'5',boardAddress:hex(2),portalAddress:eth(3)},receipt={depositor:eth(4),amount:'100',depositId:hex(5)};
for(const kind of ['exit','cancel','refund'])test('V2 '+kind+' matches Solidity ABI and commits to the deposit ID',()=>{
 const actual=encodeDepositExitCommitment(kind,scope,receipt),expected=getBytes(AbiCoder.defaultAbiCoder().encode(['bytes32','uint256','uint256','address','bytes32','uint256','address','uint128','bytes32'],[encodeBytes32String('AZTEC_BB_'+kind.toUpperCase()+'_V2'),2,31337,eth(3),hex(2),5,eth(4),100,hex(5)]));
 assert.deepEqual(actual,expected);assert.notDeepEqual(actual,encodeDepositExitCommitment(kind,scope,{...receipt,depositId:hex(6)}));
 assert.equal(encodeEscrowCommitment('exit',scope,{depositor:receipt.depositor,amount:receipt.amount}).length,256);
});
for(const depositId of [undefined,hex(0),'0x'+'ff'.repeat(32)])test('V2 rejects invalid deposit ID '+String(depositId),()=>assert.throws(()=>encodeDepositExitCommitment('exit',scope,{...receipt,depositId})));
