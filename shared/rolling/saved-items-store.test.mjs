import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {createSavedItemsStore,savedItemsId,SAVED_ITEMS_MAX_BYTES} from './saved-items-store.mjs';
const cap='11'.repeat(32),id=savedItemsId(cap),blob=n=>Buffer.alloc(32,n).toString('base64url');
function directory(t){const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'saved-items-')));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('opaque capability binding prevents first-write takeover and never persists capability or plaintext',t=>{
 const dir=directory(t),store=createSavedItemsStore(dir);t.after(()=>store.close());
 assert.equal(id,createHash('sha256').update(Buffer.concat([Buffer.from('rolling.saved-items.id.v1\0'),Buffer.from(cap,'hex')])).digest('hex'));
 assert.deepEqual(store.read(id),{revision:0,blob:null});
 for(const wrong of [undefined,'22'.repeat(32),cap.toUpperCase()+'A'])assert.throws(()=>store.write(id,wrong,{expectedRevision:0,blob:blob(1)}),{code:'SAVED_ITEMS_FORBIDDEN'});
 const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),plaintext=JSON.stringify({bookmarks:['123456789'],followedBoards:['5544332211'],followedNames:[]});
 const encrypted=Buffer.concat([iv,cipher.update(plaintext),cipher.final(),cipher.getAuthTag()]).toString('base64url');
 assert.deepEqual(store.write(id,cap,{expectedRevision:0,blob:encrypted}),{revision:1,blob:encrypted});
 for(const file of fs.readdirSync(dir)){const bytes=fs.readFileSync(path.join(dir,file));assert(!bytes.includes(Buffer.from(cap)));assert(!bytes.includes(Buffer.from('5544332211')));assert(!bytes.includes(Buffer.from('bookmarks')));}
 const packed=Buffer.from(store.read(id).blob,'base64url'),decipher=createDecipheriv('aes-256-gcm',key,packed.subarray(0,12));decipher.setAuthTag(packed.subarray(-16));
 assert.equal(Buffer.concat([decipher.update(packed.subarray(12,-16)),decipher.final()]).toString(),plaintext);
});
test('SQLite revision compare-and-swap survives reopen and concurrent connections',t=>{
 const dir=directory(t),a=createSavedItemsStore(dir),b=createSavedItemsStore(dir);t.after(()=>{a.close();b.close();});
 const left=a.read(id),right=b.read(id);a.write(id,cap,{expectedRevision:left.revision,blob:blob(1)});
 assert.throws(()=>b.write(id,cap,{expectedRevision:right.revision,blob:blob(2)}),{code:'SAVED_ITEMS_CONFLICT'});
 assert.equal(b.read(id).blob,blob(1));b.write(id,cap,{expectedRevision:1,blob:blob(2)});a.close();b.close();
 const reopened=createSavedItemsStore(dir);assert.deepEqual(reopened.read(id),{revision:2,blob:blob(2)});reopened.close();assert.throws(()=>reopened.read(id),{code:'SAVED_ITEMS_UNAVAILABLE'});
});
test('bounded documents/bytes fail atomically; replacement releases its prior byte usage',t=>{
 const store=createSavedItemsStore(directory(t),{maxDocuments:2,maxTotalBytes:64});t.after(()=>store.close());
 store.write(id,cap,{expectedRevision:0,blob:blob(1)});const cap2='22'.repeat(32),id2=savedItemsId(cap2);store.write(id2,cap2,{expectedRevision:0,blob:blob(2)});
 assert.throws(()=>store.write(savedItemsId('33'.repeat(32)),'33'.repeat(32),{expectedRevision:0,blob:blob(3)}),{code:'SAVED_ITEMS_CAPACITY'});
 assert.throws(()=>store.write(id,cap,{expectedRevision:1,blob:Buffer.alloc(33).toString('base64url')}),{code:'SAVED_ITEMS_CAPACITY'});
 assert.equal(store.read(id).revision,1);assert.equal(store.write(id,cap,{expectedRevision:1,blob:blob(4)}).revision,2);
});
test('strict opaque schema rejects plaintext, malformed encoding, extra fields and unsafe revisions',t=>{
 const store=createSavedItemsStore(directory(t));t.after(()=>store.close());
 for(const input of [null,[],{expectedRevision:0,blob:blob(1),owner:'wallet'},...[-1,0.1,Number.MAX_SAFE_INTEGER,'0'].map(expectedRevision=>({expectedRevision,blob:blob(1)})),...['',{},'a','=',blob(1)+'=',Buffer.alloc(SAVED_ITEMS_MAX_BYTES+1).toString('base64url')].map(blob=>({expectedRevision:0,blob}))])assert.throws(()=>store.write(id,cap,input),{code:'SAVED_ITEMS_INVALID'});
 for(const bad of ['../test','0x'+id,id.toUpperCase()])assert.throws(()=>store.read(bad),{code:'SAVED_ITEMS_INVALID'});
 assert.deepEqual(store.read(id),{revision:0,blob:null});
 assert.equal(store.write(id,cap,{expectedRevision:0,blob:Buffer.alloc(SAVED_ITEMS_MAX_BYTES).toString('base64url')}).revision,1);
});
test('private storage refuses symlink or multiply linked database files',t=>{
 const dir=directory(t),external=path.join(dir,'outside');fs.writeFileSync(external,'',{mode:0o600});const filename=path.join(dir,'rolling-saved-items-v1.sqlite');
 fs.symlinkSync(external,filename);assert.throws(()=>createSavedItemsStore(dir),{code:'SAVED_ITEMS_INVALID'});fs.unlinkSync(filename);
 fs.linkSync(external,filename);assert.throws(()=>createSavedItemsStore(dir),{code:'SAVED_ITEMS_INVALID'});fs.unlinkSync(filename);
 fs.chmodSync(dir,0o755);assert.throws(()=>createSavedItemsStore(dir),{code:'SAVED_ITEMS_INVALID'});
});
