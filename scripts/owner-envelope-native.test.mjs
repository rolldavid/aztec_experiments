import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {abiEncode,abiDecode} from '@aztec-foundation/noir-noirc_abi';
import {buildACIRCallback,UtilityExecutionOracle} from '@aztec-labs/pxe/simulator';
import {BlockHeader,CallContext} from '@aztec-labs/stdlib/tx';
import {WASMSimulator} from '@aztec-labs/simulator/client';
import {withOwnerEnvelopeOracles} from '../shared/owner-envelope.mjs';
test('actual v6 WASMSimulator executes compiled Noir owner-envelope ABI',async()=>{
 const raw=JSON.parse(await fs.readFile(process.env.OWNER_ENVELOPE_ARTIFACT??new URL('fixtures/owner-envelope/target/owner_envelope_fixture-OwnerEnvelopeFixture.json',import.meta.url),'utf8'));
 const fn=raw.functions.find(f=>f.name.endsWith('envelope_roundtrip'));assert(fn);
 const inputs=abiEncode(fn.abi,{secret:'42',domain:['31337','679261766','3','4']});
 const simulator=withOwnerEnvelopeOracles(new WASMSimulator({module:'owner-envelope-test'}));
 const handler=Object.assign(Object.create(UtilityExecutionOracle.prototype),{isMisc:true,isUtility:true,anchorBlockHeader:BlockHeader.empty(),callContext:CallContext.empty()});
 const result=await simulator.executeUserCircuit(inputs,{...fn,bytecode:Buffer.from(fn.bytecode,'base64'),contractName:'OwnerEnvelopeFixture'},buildACIRCallback(handler));
 assert.equal(abiDecode(fn.abi,result.partialWitness).return_value,true);
});
