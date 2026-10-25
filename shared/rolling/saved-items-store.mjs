// Encrypted browser documents only. No wallet identity, decryption key, graph,
// blockchain state, or write capability is persisted here.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,timingSafeEqual} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
export const SAVED_ITEMS_MAX_BYTES=256*1024;
const limits={maxDocuments:4096,maxTotalBytes:64*1024*1024};
const fail=code=>Object.assign(Error('Saved items unavailable.'),{code});
const check=(value,code='SAVED_ITEMS_INVALID')=>{if(!value)throw fail(code);};
const identifier=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
export function savedItemsId(capability){
 check(identifier(capability),'SAVED_ITEMS_FORBIDDEN');
 return createHash('sha256').update('rolling.saved-items.id.v1\0').update(Buffer.from(capability,'hex')).digest('hex');
}
export function authorizeSavedItems(id,capability){
 check(identifier(id));
 check(timingSafeEqual(Buffer.from(id,'hex'),Buffer.from(savedItemsId(capability),'hex')),'SAVED_ITEMS_FORBIDDEN');
}
function ciphertext(blob){
 check(typeof blob==='string'&&blob.length<=Math.ceil(SAVED_ITEMS_MAX_BYTES*4/3)&&/^[A-Za-z0-9_-]+$/.test(blob));
 const bytes=Buffer.from(blob,'base64url');check(bytes.length>=28&&bytes.length<=SAVED_ITEMS_MAX_BYTES&&bytes.toString('base64url')===blob);
 return bytes;
}
export function createSavedItemsStore(directory,options={}){
 check(typeof directory==='string'&&path.isAbsolute(directory));
 check(Object.keys(options).every(key=>Object.hasOwn(limits,key)));
 const bounds={...limits,...options};
 for(const [key,value]of Object.entries(bounds))check(Number.isSafeInteger(value)&&value>0&&value<=limits[key]);
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const parent=fs.lstatSync(directory),uid=process.geteuid();
 check(fs.realpathSync(directory)===path.resolve(directory)&&parent.isDirectory()&&!parent.isSymbolicLink()&&parent.uid===uid&&(parent.mode&0o777)===0o700);
 const filename=path.join(directory,'rolling-saved-items-v1.sqlite');
 for(const suffix of ['', '-wal','-shm'])if(fs.existsSync(filename+suffix)){
  const stat=fs.lstatSync(filename+suffix);check(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1&&stat.uid===uid&&(stat.mode&0o777)===0o600);
 }
 if(!fs.existsSync(filename))fs.closeSync(fs.openSync(filename,'wx',0o600));
 const db=new DatabaseSync(filename);let closed=false;
 try{db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=0;
 CREATE TABLE IF NOT EXISTS saved_items(id TEXT PRIMARY KEY,revision INTEGER NOT NULL CHECK(revision>0),ciphertext BLOB NOT NULL) WITHOUT ROWID;`);}catch(error){db.close();throw error;}
 const available=()=>check(!closed,'SAVED_ITEMS_UNAVAILABLE');
 const get=db.prepare('SELECT revision,ciphertext FROM saved_items WHERE id=?');
 return Object.freeze({
  read(id){available();check(identifier(id));const row=get.get(id);return row?{revision:row.revision,blob:Buffer.from(row.ciphertext).toString('base64url')}:{revision:0,blob:null};},
  write(id,capability,input){
   available();authorizeSavedItems(id,capability);
   check(input&&Object.getPrototypeOf(input)===Object.prototype&&Object.keys(input).sort().join(',')==='blob,expectedRevision');
   check(Number.isSafeInteger(input.expectedRevision)&&input.expectedRevision>=0&&input.expectedRevision<Number.MAX_SAFE_INTEGER);
   const bytes=ciphertext(input.blob);db.exec('BEGIN IMMEDIATE');
   try{
    const old=get.get(id);check((old?.revision??0)===input.expectedRevision,'SAVED_ITEMS_CONFLICT');
    const capacity=db.prepare('SELECT count(*) AS documents,coalesce(sum(length(ciphertext)),0) AS bytes FROM saved_items').get();
    check((old||capacity.documents<bounds.maxDocuments)&&capacity.bytes-(old?.ciphertext.length??0)+bytes.length<=bounds.maxTotalBytes,'SAVED_ITEMS_CAPACITY');
    const revision=input.expectedRevision+1;
    db.prepare('INSERT INTO saved_items(id,revision,ciphertext) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,ciphertext=excluded.ciphertext').run(id,revision,bytes);
    db.exec('COMMIT');return {revision,blob:input.blob};
   }catch(error){db.exec('ROLLBACK');throw error;}
  },
  close(){if(!closed){closed=true;db.close();}},
 });
}
