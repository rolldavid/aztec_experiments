// Pure wallet-local replay. This does not authenticate an event's encrypted-log
// provenance, recipient, canonical inclusion or the supplied head. The caller
// must establish those facts through the trusted scoped PXE and retained chain.
// Full replay uses memory proportional to history; it is not bounded SDK paging.
import {FIELD_MODULUS} from './invocation.mjs';

export const PREFERENCE_DOMAIN = 0x52435031;
export const PREFERENCE_KINDS = Object.freeze({bookmark:1,followBoard:2,followName:3,subscription:4,replyNotifications:5,read:6});
const U64_MAX = (1n << 64n) - 1n;
const invalid = () => Object.assign(new Error('Private preference history is invalid or unavailable.'), {code:'ROLLING_PREFERENCES_INVALID'});
const check = value => { if (!value) throw invalid(); };

function record(input, keys) {
  check(input !== null && typeof input === 'object');
  const proto = Object.getPrototypeOf(input);
  check(proto === Object.prototype || proto === null);
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const actual = Reflect.ownKeys(descriptors);
  check(actual.length === keys.length && actual.every(key => typeof key === 'string' && keys.includes(key)));
  const result = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    check(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable);
    result[key] = descriptor.value;
  }
  return result;
}
function decimal(value, max, nonzero=false) {
  check(typeof value === 'string' && value.length <= 78 && /^(0|[1-9][0-9]*)$/.test(value));
  const n = BigInt(value);
  check(n <= max && (!nonzero || n !== 0n));
  return value;
}
const field = (value, nonzero=false) => decimal(value, FIELD_MODULUS - 1n, nonzero);
const integer = (value, max) => { check(Number.isSafeInteger(value) && value >= 0 && !Object.is(value,-0) && value <= max); return value; };
function eventRecord(input) {
  const e = record(input, ['schema','revision','kind','target','value','read_block','read_hash','previous_digest']);
  check(e.schema === 1);
  decimal(e.revision, U64_MAX, true); integer(e.kind, 6); check(e.kind >= 1);
  field(e.target); check(typeof e.value === 'boolean'); integer(e.read_block, 0xffffffff);
  field(e.read_hash); field(e.previous_digest);
  if (e.kind === 6) {
    check(e.target !== '0' && e.value && e.read_hash !== '0');
  } else {
    check(e.read_block === 0 && e.read_hash === '0');
    if (e.kind === 5) check(e.target === '0');
    else if (e.kind !== 2) check(e.target !== '0');
  }
  return Object.freeze(e);
}
function snapshot(input) {
  const options = record(input, ['scope','head','events','hash']);
  check(typeof options.hash === 'function');
  const scope = record(options.scope, ['chainId','version','board']);
  for (const key of ['chainId','version','board']) field(scope[key], true);
  const head = record(options.head, ['initialized','schema','revision','digest']);
  check(typeof head.initialized === 'boolean' && head.schema === 1);
  decimal(head.revision, U64_MAX); field(head.digest);
  check(head.initialized ? head.revision !== '0' && head.digest !== '0' : head.revision === '0' && head.digest === '0');
  check(Array.isArray(options.events));
  const descriptors = Object.getOwnPropertyDescriptors(options.events);
  const length = descriptors.length?.value;
  check(Number.isSafeInteger(length) && length >= 0 && Reflect.ownKeys(descriptors).length === length + 1);
  // Complete revision 1..head is required. No implicit sorting, deduplication,
  // partial-history fallback or arbitrary maximum number of user preferences.
  check(BigInt(length) === BigInt(head.revision));
  const events = [];
  for (let i=0;i<length;i++) {
    const descriptor = descriptors[String(i)];
    check(descriptor && Object.hasOwn(descriptor,'value') && descriptor.enumerable);
    const e = eventRecord(descriptor.value);
    check(BigInt(e.revision) === BigInt(i) + 1n);
    events.push(e);
  }
  return {scope:Object.freeze(scope),head:Object.freeze(head),events,hash:options.hash};
}
const sorted = values => Object.freeze([...values].sort((a,b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0));

/**
 * All field values, scope values and revisions are canonical decimal strings;
 * schema/kind/read_block are bounded JS integers, value/initialized are booleans.
 * hash(bigint[11], domain:number) must resolve to a canonical bigint field, e.g.
 * (fields, domain) => sdk.poseidon2HashWithSeparator(fields,domain).then(x=>x.toBigInt()).
 * No SDK import, private/public reader, network, storage or mutation occurs here.
 * Capture all records before invoking the asynchronous hash dependency.
 * Reply notifications default to true when no global choice was recorded;
 * this reversible UI default is overridden by an explicit false event. Read markers use the latest revision, even for an intentional earlier
 * block. Reorg recovery replays a replacement authenticated history/head afresh.
 */
export async function replayPreferenceEvents(input) {
  try {
    const {scope,head,events,hash} = snapshot(input);
    const bookmarks = new Set(), followedBoards = new Set(), followedNames = new Set(), subscriptions = new Set();
    const sets = [null,bookmarks,followedBoards,followedNames,subscriptions];
    const readMarkers = new Map();
    let digest = 0n, replyNotifications = true;
    for (const e of events) {
      check(BigInt(e.previous_digest) === digest);
      // EXACT preferences.nr: scope followed by all eight serialized event fields.
      const preimage = Object.freeze([BigInt(scope.chainId),BigInt(scope.version),BigInt(scope.board),
        BigInt(e.schema),BigInt(e.revision),BigInt(e.kind),BigInt(e.target),e.value ? 1n : 0n,
        BigInt(e.read_block),BigInt(e.read_hash),BigInt(e.previous_digest)]);
      digest = await hash(preimage, PREFERENCE_DOMAIN);
      check(typeof digest === 'bigint' && digest > 0n && digest < FIELD_MODULUS);
      if (e.kind <= 4) { if (e.value) sets[e.kind].add(e.target); else sets[e.kind].delete(e.target); }
      else if (e.kind === 5) replyNotifications = e.value;
      else readMarkers.set(e.target,Object.freeze({thread:e.target,throughBlock:e.read_block,blockHash:e.read_hash}));
    }
    check(digest === BigInt(head.digest));
    return Object.freeze({scope,head,bookmarks:sorted(bookmarks),followedBoards:sorted(followedBoards),
      followedNames:sorted(followedNames),subscriptions:sorted(subscriptions),replyNotifications,
      readMarkers:Object.freeze(sorted(readMarkers.keys()).map(id=>readMarkers.get(id)))});
  } catch {
    // No caller-provided strings, accessor errors or hash dependency causes leak.
    throw invalid();
  }
}
