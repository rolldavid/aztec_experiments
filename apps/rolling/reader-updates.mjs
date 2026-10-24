// One subscription and one refresh owner. Events carry only public revision data.
// EventSource owns transport reconnection; no feed polling or transaction timers.
export function createReaderUpdates({refresh,canRefresh=()=>true,EventSource=globalThis.EventSource}){
 let source=null,rendered=null,pending=null,running=null,closed=true,requested=false;
 function revision(event){
  try{const value=JSON.parse(event.data);
   if(value?.schemaVersion!==1||typeof value.revision!=='string'||!value.revision.length||value.revision.length>200||!(Number.isSafeInteger(value.checkpoint?.number)&&value.checkpoint.number>=0||typeof value.checkpoint?.number==='string'&&/^(0|[1-9][0-9]*)$/.test(value.checkpoint.number)&&Number.isSafeInteger(Number(value.checkpoint.number)))||typeof value.checkpoint.hash!=='string'||!/^0x[0-9a-f]{64}$/.test(value.checkpoint.hash))return;
   pending=value.revision;void flush();
  }catch{/* Malformed public notifications never change the displayed feed. */}
 }
 function flush(){
  if(closed||running||(!requested&&(!pending||pending===rendered))||!canRefresh())return running??Promise.resolve();
  const selected=pending!==rendered?pending:null;pending=null;requested=false;
  const retain=()=>{if(!closed&&!pending&&selected&&rendered!==selected)pending=selected;};
  running=Promise.resolve().then(()=>refresh(selected??undefined)).then(result=>{if(result===false)retain();},retain).finally(()=>{running=null;if(pending&&pending!==selected)void flush();});
  return running;
 }
 return Object.freeze({
  start(){if(!closed)return;closed=false;if(typeof EventSource!=='function')return;source=new EventSource('/api/events');source.addEventListener('revision',revision);},
  stop(){closed=true;source?.close();source=null;pending=null;requested=false;},
  rendered(value){rendered=value;if(pending===value)pending=null;},
  request(){if(running)return running;requested=true;return flush();},
  flush
 });
}
