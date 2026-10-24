import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
// Regenerate this local dependency from authenticated native sources; never patch
// the user's Nargo cache. Only the five qualified APIs below differ from v6.
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OWNER_NOIR_DIRECTORY='.build/owner-delivery/aztec-nr';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const OWNER_NOIR_PATCH_PINS={
  'aztec/src/note/note_message.nr':'aa518ac039246c0122f6abf3b2d92965ca64666ba42d8ab03aaa0f9b8ffed5e5',
  'aztec/src/event/event_message.nr':'3d0fd33e18c3d26f22cf92a54e01ddb1fe221af605687bf51eff7119a0131ad9',
  'aztec/src/messages/discovery/process_message.nr':'3db3505f24f41bbe018cd852977b67076c1317d4450e3440fd7a12dbabb95c02',
  'aztec/src/messages/discovery/mod.nr':'47451b2c42cabe16c236d1a4bf455a83ea8e6b40bc1c0d79df764decde81598e',
  'uint-note/src/uint_note.nr':'8aa6b858ba460528bc8daad5209c0e8ab5c11ca6c77f50f726456d86b34f289a',
};

export function patchOwnerNoirSources(input) {
 const sources={...input};
 for(const [name,hash] of Object.entries(OWNER_NOIR_PATCH_PINS)) {
  if(sha(sources[name]??'')!==hash)throw Error(`Unqualified owner delivery native source: ${name}`);
 }
const message='aztec/src/messages/discovery/process_message.nr';
const plaintextMarker='pub(crate) unconstrained fn process_message_plaintext(';
if(sources[message].split(plaintextMarker).length!==2)throw Error('Pinned plaintext dispatcher boundary changed');
sources[message] = sources[message].replace(plaintextMarker, 'pub unconstrained fn process_message_plaintext(');
const discovery='aztec/src/messages/discovery/mod.nr';
sources[discovery] += `\n/// Completes custom plaintext discovery using the unchanged native partial-note FSM and scoped validation.\npub unconstrained fn finish_plaintext_discovery(\n    contract_address: AztecAddress,\n    compute_note_hash: ComputeNoteHash,\n    compute_note_nullifier: ComputeNoteNullifier,\n    scope: AztecAddress,\n) {\n    partial_notes::sync(contract_address, compute_note_hash, compute_note_nullifier, scope);\n    validate_and_store_enqueued_notes_and_events(scope);\n}\n`;
const uintNote='uint-note/src/uint_note.nr';
const nativeUint=sources[uintNote];
const start=nativeUint.indexOf('    pub fn partial(');
const end=nativeUint.indexOf('\n}\n\n/// Computes a commitment',start);
if(start<0||end<0) throw new Error('Pinned partial constructor boundary changed');
const old=nativeUint.slice(start,end);
const deliveryStart=old.indexOf('        do_private_message_delivery(');
const deliveryEnd=old.indexOf('\n\n        let partial_note',deliveryStart);
if(deliveryStart<0||deliveryEnd<0) throw new Error('Pinned partial delivery boundary changed');
const constructor=old.replace('pub fn partial(','pub fn partial_with_message(')
 .replace('        recipient: AztecAddress,\n','')
 .replace(') -> PartialUintNote {',') -> (PartialUintNote, [Field; 4]) {')
 .replace(old.slice(deliveryStart,deliveryEnd),'        let message = encode_partial_note_private_message(private_log_content, owner, randomness, commitment);')
 .replace('        partial_note\n','        (partial_note, message)\n');
const standardDelivery=`    pub fn partial(
        owner: AztecAddress, context: &mut PrivateContext, recipient: AztecAddress, completer: AztecAddress,
    ) -> PartialUintNote {
        let (partial_note, message) = Self::partial_with_message(owner, context, completer);
        do_private_message_delivery(context, || message, Option::none(), recipient, MessageDelivery::onchain_unconstrained());
        partial_note
    }

    /// Native partial-note construction with delivery left to the calling contract.
`;
sources[uintNote]=nativeUint.slice(0,start)+standardDelivery+constructor+nativeUint.slice(end);


const eventMessage='aztec/src/event/event_message.nr';
let eventSource=sources[eventMessage];
const eventMarker='    pub fn deliver_to<D>(self, recipient: AztecAddress, delivery_mode: D)';
if(eventSource.split(eventMarker).length!==2) throw new Error('Pinned event message boundary changed');
eventSource=eventSource.replace(eventMarker,`    /// Existing native event plaintext, for a contract-selected encrypted transport.
    pub fn get_plaintext(self) -> BoundedVec<Field, 12> {
        BoundedVec::from_array(encode_private_event_message(self.new_event.event, self.new_event.randomness))
    }

`+eventMarker);
sources[eventMessage]=eventSource;

const noteMessage='aztec/src/note/note_message.nr';
let noteSource=sources[noteMessage];
const noteMarker='    pub fn get_note(self) -> Option<Note> {';
if(noteSource.split(noteMarker).length!==2) throw new Error('Pinned optional note message boundary changed');
noteSource=noteSource.replace(noteMarker,`    /// Existing native optional note metadata; no note is created by this accessor.
    pub fn get_new_note(self) -> Option<NewNote<Note>> { self.maybe_new_note }

`+noteMarker);
sources[noteMessage]=noteSource;

 return sources;
}

function scan(directory) {
 if(fs.lstatSync(directory).isSymbolicLink())throw Error('Symlink in owner delivery package');
 const result={};
 function walk(relative) {
  const name=path.join(directory,relative),stat=fs.lstatSync(name);
  if(stat.isSymbolicLink())throw Error(`Symlink in owner delivery source: ${relative}`);
  if(stat.isDirectory())for(const child of fs.readdirSync(name).sort())walk(path.join(relative,child));
  else if(stat.isFile())result[relative.split(path.sep).join('/')]=fs.readFileSync(name,'utf8');
  else throw Error(`Unexpected owner delivery source: ${relative}`);
 }
 walk('Nargo.toml');walk('src');return result;
}
export function ownerNoirSources({root=ROOT,cacheRoot=path.join(os.homedir(),'nargo')}={}) {
 const inventory=JSON.parse(fs.readFileSync(path.join(root,'scripts/owner-delivery-noir-sources.json'),'utf8'));
 if(inventory.version!=='v6.0.0'||Object.keys(inventory.packages).sort().join(',')!=='aztec,balance-set,uint-note')throw Error('Unexpected owner delivery native inventory');
 const source=path.join(cacheRoot,'github.com/aztec-labs-eng/aztec-nr/v6.0.0'),sources={};
 for(const [pkg,entry] of Object.entries(inventory.packages)) {
  const files=scan(path.join(source,pkg));
  if(Object.keys(files).sort().join('\n')!==Object.keys(entry.files).sort().join('\n'))throw Error(`Owner delivery source inventory changed: ${pkg}`);
  for(const [name,content] of Object.entries(files)) {
   if(sha(content)!==entry.files[name])throw Error(`Owner delivery original source changed: ${pkg}/${name}`);
   sources[`${pkg}/${name}`]=content;
  }
 }
 return patchOwnerNoirSources(sources);
}
export function checkOwnerNoir({root=ROOT,cacheRoot}={}) {
 const expected=ownerNoirSources({root,cacheRoot}),destination=path.join(root,OWNER_NOIR_DIRECTORY),actual={};
 if(fs.lstatSync(destination).isSymbolicLink()||fs.readdirSync(destination).sort().join(',')!=='aztec,balance-set,uint-note')throw Error('Unexpected generated owner dependency tree');
 for(const pkg of ['aztec','balance-set','uint-note'])for(const [name,content] of Object.entries(scan(path.join(destination,pkg))))actual[`${pkg}/${name}`]=content;
 if(Object.keys(actual).sort().join('\n')!==Object.keys(expected).sort().join('\n'))throw Error('Generated owner dependency inventory mismatch');
 for(const name of Object.keys(expected))if(actual[name]!==expected[name])throw Error(`Generated owner dependency changed: ${name}`);
 return {files:Object.keys(expected).length};
}
export function prepareOwnerNoir({root=ROOT,cacheRoot}={}) {
 const sources=ownerNoirSources({root,cacheRoot}); // Validate every input before any output mutation.
 const destination=path.join(root,OWNER_NOIR_DIRECTORY),temporary=destination+'.preparing';
 fs.rmSync(temporary,{recursive:true,force:true});
 for(const [name,content] of Object.entries(sources)) {
  const output=path.join(temporary,name);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,content);
 }
 fs.rmSync(destination,{recursive:true,force:true});fs.renameSync(temporary,destination);
 return checkOwnerNoir({root,cacheRoot});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(prepareOwnerNoir()));
