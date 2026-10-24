import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareOwnerNoir,checkOwnerNoir,ownerNoirSources,OWNER_NOIR_PATCH_PINS,OWNER_NOIR_DIRECTORY} from './prepare-owner-noir.mjs';
import {checkNoirEmbeddedSources} from './check-noir-dependencies.mjs';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const original=path.join(os.homedir(),'nargo/github.com/aztec-labs-eng/aztec-nr/v6.0.0');
const sha=value=>createHash('sha256').update(value).digest('hex');
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'owner-noir-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.mkdirSync(path.join(dir,'scripts'));
 fs.copyFileSync(path.join(root,'scripts/owner-delivery-noir-sources.json'),path.join(dir,'scripts/owner-delivery-noir-sources.json'));
 return {root:dir};
}
test('exact original graph transforms only five native API files and is deterministic',t=>{
 const options=fixture(t),sources=ownerNoirSources(options);
 const changed=Object.entries(sources).filter(([name,value])=>fs.readFileSync(path.join(original,name),'utf8')!==value).map(([name])=>name).sort();
 assert.deepEqual(changed,Object.keys(OWNER_NOIR_PATCH_PINS).sort());
 assert.deepEqual(prepareOwnerNoir(options),{files:248});
 assert.deepEqual(prepareOwnerNoir(options),{files:248});
 assert.deepEqual(checkOwnerNoir(options),{files:248});
 assert.match(sources['uint-note/src/uint_note.nr'],/partial_with_message/);
 assert.doesNotMatch(sources['aztec/src/messages/discovery/process_message.nr'],/plaintext_note_matches_tx/);
});
test('original source mismatch fails before replacing existing prepared output',t=>{
 const options=fixture(t);prepareOwnerNoir(options);
 const cacheRoot=path.join(options.root,'cache'),base=path.join(cacheRoot,'github.com/aztec-labs-eng/aztec-nr/v6.0.0');
 const inventory=JSON.parse(fs.readFileSync(path.join(root,'scripts/owner-delivery-noir-sources.json')));
 for(const [pkg,record] of Object.entries(inventory.packages))for(const name of Object.keys(record.files)){
  const target=path.join(base,pkg,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(original,pkg,name),target);
 }
 fs.appendFileSync(path.join(base,'aztec/src/lib.nr'),'\n// unqualified');
 assert.throws(()=>prepareOwnerNoir({...options,cacheRoot}),/original source changed/);
 assert.deepEqual(checkOwnerNoir(options),{files:248});
});
test('generated tampering, extra macro and package symlink fail closed',t=>{
 const options=fixture(t);prepareOwnerNoir(options);const directory=path.join(options.root,OWNER_NOIR_DIRECTORY);
 const name=path.join(directory,'aztec/src/lib.nr'),initial=fs.readFileSync(name);fs.appendFileSync(name,'\n// changed');
 assert.throws(()=>checkOwnerNoir(options),/Generated owner dependency changed/);fs.writeFileSync(name,initial);
 const added=path.join(directory,'aztec/src/extra.nr');fs.writeFileSync(added,'extra');
 assert.throws(()=>checkOwnerNoir(options),/inventory mismatch/);fs.rmSync(added);
 fs.renameSync(path.join(directory,'aztec'),path.join(options.root,'aztec'));
 fs.symlinkSync(path.join(options.root,'aztec'),path.join(directory,'aztec'));
 assert.throws(()=>checkOwnerNoir(options),/Symlink/);
});
test('embedded generated sources require exact registration, full inventory and byte equality',t=>{
 const options=fixture(t);prepareOwnerNoir(options);
 const relative=OWNER_NOIR_DIRECTORY+'/aztec/src/messages/discovery/process_message.nr';
 const source=fs.readFileSync(path.join(options.root,relative),'utf8');
 const external='dependencies/github.com/example/lib/v1/src/lib.nr';
 const lock={schema:2,algorithm:'sha256',packages:{fixture:{files:{one:'ignored'}}},localManifests:{},ownerDelivery:OWNER_NOIR_DIRECTORY,embeddedSourcesByContract:{Fixture:{[relative]:sha(source),[external]:sha('native')}}};
 const artifact={name:'Fixture',file_map:{0:{path:relative,source},1:{path:external,source:'native'}}};
 assert.deepEqual(checkNoirEmbeddedSources(artifact,{...options,lock}),{embeddedSources:2});
 assert.throws(()=>checkNoirEmbeddedSources({...artifact,file_map:{1:artifact.file_map[1]}},{...options,lock}),/Embedded Noir dependency sources/);
 artifact.file_map[0].source+='changed';assert.throws(()=>checkNoirEmbeddedSources(artifact,{...options,lock}),/differs from prepared tree/);
 artifact.file_map[0].source=source;delete lock.ownerDelivery;assert.throws(()=>checkNoirEmbeddedSources(artifact,{...options,lock}),/Unregistered generated/);
});
