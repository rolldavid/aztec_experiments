import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const source=path.join(os.homedir(),'nargo/github.com/aztec-labs-eng/aztec-nr/v6.0.0');
const destination=path.join(root,'.build/aztec-nr');
const pins={
  'aztec/src/note/note_message.nr':'aa518ac039246c0122f6abf3b2d92965ca64666ba42d8ab03aaa0f9b8ffed5e5',
  'aztec/src/event/event_message.nr':'3d0fd33e18c3d26f22cf92a54e01ddb1fe221af605687bf51eff7119a0131ad9',
  'aztec/src/messages/discovery/process_message.nr':'3db3505f24f41bbe018cd852977b67076c1317d4450e3440fd7a12dbabb95c02',
  'aztec/src/messages/discovery/mod.nr':'47451b2c42cabe16c236d1a4bf455a83ea8e6b40bc1c0d79df764decde81598e',
  'uint-note/src/uint_note.nr':'8aa6b858ba460528bc8daad5209c0e8ab5c11ca6c77f50f726456d86b34f289a',
};
for(const [file,hash] of Object.entries(pins)) {
  if(createHash('sha256').update(fs.readFileSync(path.join(source,file))).digest('hex')!==hash) throw new Error(`Unqualified v6.0.0 source: ${file}`);
}
// This private prototype copy never changes the user's global dependency cache.
fs.mkdirSync(path.dirname(destination),{recursive:true});
fs.cpSync(source,destination,{recursive:true,filter:(entry)=>!entry.split(path.sep).includes('.git')});
const message=path.join(destination,'aztec/src/messages/discovery/process_message.nr');
fs.writeFileSync(message,fs.readFileSync(message,'utf8').replace('pub(crate) unconstrained fn process_message_plaintext(', 'pub unconstrained fn process_message_plaintext('));
const discovery=path.join(destination,'aztec/src/messages/discovery/mod.nr');
fs.appendFileSync(discovery,`\n/// Completes custom plaintext discovery using the unchanged native partial-note FSM and scoped validation.\npub unconstrained fn finish_plaintext_discovery(\n    contract_address: AztecAddress,\n    compute_note_hash: ComputeNoteHash,\n    compute_note_nullifier: ComputeNoteNullifier,\n    scope: AztecAddress,\n) {\n    partial_notes::sync(contract_address, compute_note_hash, compute_note_nullifier, scope);\n    validate_and_store_enqueued_notes_and_events(scope);\n}\n`);
const uintNote=path.join(destination,'uint-note/src/uint_note.nr');
const nativeUint=fs.readFileSync(uintNote,'utf8');
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
const compatibility=`    pub fn partial(
        owner: AztecAddress, context: &mut PrivateContext, recipient: AztecAddress, completer: AztecAddress,
    ) -> PartialUintNote {
        let (partial_note, message) = Self::partial_with_message(owner, context, completer);
        do_private_message_delivery(context, || message, Option::none(), recipient, MessageDelivery::onchain_unconstrained());
        partial_note
    }

    /// Native partial-note construction with delivery left to the calling contract.
`;
fs.writeFileSync(uintNote,nativeUint.slice(0,start)+compatibility+constructor+nativeUint.slice(end));
console.log(JSON.stringify({dependency:'aztec-nr@v6.0.0',originalSha256:pins,changedFiles:Object.keys(pins)}));

const eventMessage=path.join(destination,'aztec/src/event/event_message.nr');
let eventSource=fs.readFileSync(eventMessage,'utf8');
const eventMarker='    pub fn deliver_to<D>(self, recipient: AztecAddress, delivery_mode: D)';
if(eventSource.split(eventMarker).length!==2) throw new Error('Pinned event message boundary changed');
eventSource=eventSource.replace(eventMarker,`    /// Existing native event plaintext, for a contract-selected encrypted transport.
    pub fn get_plaintext(self) -> BoundedVec<Field, 12> {
        BoundedVec::from_array(encode_private_event_message(self.new_event.event, self.new_event.randomness))
    }

`+eventMarker);
fs.writeFileSync(eventMessage,eventSource);

const noteMessage=path.join(destination,'aztec/src/note/note_message.nr');
let noteSource=fs.readFileSync(noteMessage,'utf8');
const noteMarker='    pub fn get_note(self) -> Option<Note> {';
if(noteSource.split(noteMarker).length!==2) throw new Error('Pinned optional note message boundary changed');
noteSource=noteSource.replace(noteMarker,`    /// Existing native optional note metadata; no note is created by this accessor.
    pub fn get_new_note(self) -> Option<NewNote<Note>> { self.maybe_new_note }

`+noteMarker);
fs.writeFileSync(noteMessage,noteSource);
