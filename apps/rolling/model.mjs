export const MAX_BYTES = 992;
export function allowance(text) {
  const bytes = new TextEncoder().encode(text).length;
  const characters = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length;
  return { bytes, characters, remaining: MAX_BYTES - bytes, valid: bytes > 0 && bytes <= MAX_BYTES };
}
export function safeURL(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}
// Shared presentation for published messages and composer previews. No HTML is
// interpreted, and importing this module does not require a browser document.
export function createMessageContent(value) {
  const node = document.createElement('div');
  node.className = 'post-body';
  const source = typeof value === 'string' ? value : '';
  const pattern = /\[([^\]]+)\]\(([^\s)]+)\)|(https?:\/\/[^\s]+)/g;
  let end = 0;
  for (const match of source.matchAll(pattern)) {
    node.append(document.createTextNode(source.slice(end, match.index)));
    const url = safeURL(match[2] || match[3]);
    if (url) {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = match[1] || match[3];
      node.append(link);
    } else node.append(document.createTextNode(match[0]));
    end = match.index + match[0].length;
  }
  node.append(document.createTextNode(source.slice(end)));
  return node;
}
export function rankPosts(posts, mode, followedBoards, followedNames, curatedBoards) {
  const filtered = posts.filter(p => !p.parent && (mode === 'following'
    ? followedBoards.has(p.board) || followedNames.has(p.author)
    : curatedBoards.has(p.board)));
  return [...filtered].sort((a, b) => (mode === 'home' ? b.likes - a.likes : 0) || b.time - a.time || a.id.localeCompare(b.id));
}
export function searchBoards(boards, query) {
  const normalized = query.trim().toLocaleLowerCase();
  return boards.filter(b => `${b.name} ${b.description} ${b.id}`.toLocaleLowerCase().includes(normalized));
}

// A reader control owns one captured action until it settles. An uncertain
// result can be inspected, but this control cannot submit it a second time.
export function createInlineAction({action,perform,onState}) {
  let pending=null,uncertain=null;
  return function run() {
    if(pending)return pending;
    if(uncertain)return Promise.resolve(uncertain);
    const captured=Object.freeze({...action()});
    onState('pending',captured);
    let active=true,included=false;
    const onIncluded=()=>{if(active&&!included){included=true;onState('included',captured);}};
    pending=Promise.resolve().then(()=>perform(captured,onIncluded)).then(result=>{
      if(!['included','confirmed','reverted','blocked','cancelled','failed','unknown'].includes(result?.status))result={status:'unknown'};
      if(result.status==='unknown')uncertain=result;
      onState(result.status,captured,result);return result;
    },()=>{
      uncertain={status:'unknown'};onState('unknown',captured,uncertain);return uncertain;
    }).finally(()=>{active=false;pending=null;});
    return pending;
  };
}

// Only in-flight presentation survives renderer replacement. The wallet owns
// transaction state; completing or rejecting an action removes this entry.
export function createInlineActionRegistry({perform,onState}) {
 const active=new Map();
 return Object.freeze({
  snapshot:key=>active.get(key)?.snapshot??null,
  run(key,action){
   if(active.has(key))return active.get(key).pending;
   const entry={snapshot:null,pending:null};active.set(key,entry);
   const run=createInlineAction({action,perform,onState(state,captured,result){entry.snapshot={state,captured,result};onState(key,entry.snapshot);}});
   try{entry.pending=run().finally(()=>{if(active.get(key)===entry)active.delete(key);});return entry.pending;}
   catch(error){active.delete(key);throw error;}
  }
 });
}

// Unknown saved choices are never interpreted as disabled settings. Only a
// validated boolean supplies an inverse action.
export function savedPreferenceControl(label,value,status,loading=false){
 if(typeof value!=='boolean'){const busy=status==='recovering'&&loading;return {label,disabled:busy,busy,enabled:undefined};}
 return {label:value?({'Bookmark':'Unbookmark','Follow board':'Unfollow board','Follow name':'Unfollow name'}[label]??'Remove '+label):label,disabled:false,busy:false,enabled:!value};
}

// Saved lists are off-chain selections. Capture bounded identifiers before a
// public request; labels are display hints and never select a post or identity.
export function savedReaderSelection(view,snapshot){
 const fail=()=>{throw Error('Saved items are unavailable.');};
 if(!snapshot||!['following','bookmarks'].includes(view))return fail();
 const ids=key=>{const value=snapshot[key];if(!Array.isArray(value)||value.length>100||value.some(id=>typeof id!=='string'||!/^(0|[1-9][0-9]{0,76})$/.test(id)||key!=='followedBoards'&&id==='0'||BigInt(id)>=0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n)||new Set(value).size!==value.length)return fail();return [...value];};
 const bookmarks=ids('bookmarks'),boards=ids('followedBoards'),names=ids('followedNames');if(boards.length+names.length>100)return fail();
 const label=(kind,id)=>{const value=snapshot.labels?.[kind]?.[id];return typeof value==='string'&&value.length<=128?value:'';};
 return {api:view,parameters:view==='bookmarks'?{ids:bookmarks.join(','),limit:30}:{boards:boards.join(','),names:names.join(','),limit:30},bookmarks,boards,names,
  following:[...boards.map(id=>({id,kind:'board',label:label('boards',id)||(id==='0'?'Main board':'Board '+id)})),...names.map(id=>({id,kind:'profile',label:label('names',id)||'Named profile '+id}))]};
}
export function savedReaderRoute(route){return /^\/(notifications)(?:\/|$)/.test(route)?'/home':route;}
