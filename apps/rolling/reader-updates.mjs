// One subscription and one refresh owner. Events carry only public revision data.
// EventSource owns transport reconnection; no feed polling or transaction timers.
export function createReaderUpdates({refresh,canRefresh=()=>true,EventSource=globalThis.EventSource}){
 let source=null,rendered=null,pending=null,running=null,closed=true;
 function revision(event){
  try{const value=JSON.parse(event.data);
   if(value?.schemaVersion!==1||typeof value.revision!=='string'||!value.revision.length||value.revision.length>200||typeof value.checkpoint?.number!=='string'||!/^\d+$/.test(value.checkpoint.number)||typeof value.checkpoint.hash!=='string'||!/^0x[0-9a-f]{64}$/.test(value.checkpoint.hash))return;
   pending=value.revision;void flush();
  }catch{/* Malformed public notifications never change the displayed feed. */}
 }
 function flush(){
  if(closed||running||!pending||pending===rendered||!canRefresh())return running??Promise.resolve();
  const selected=pending;pending=null;
  running=Promise.resolve().then(refresh).catch(()=>{}).finally(()=>{running=null;if(pending&&pending!==selected)void flush();});
  return running;
 }
 return Object.freeze({
  start(){if(!closed)return;closed=false;if(typeof EventSource!=='function')return;source=new EventSource('/api/events');source.addEventListener('revision',revision);},
  stop(){closed=true;source?.close();source=null;pending=null;},
  rendered(value){rendered=value;if(pending===value)pending=null;},
  flush
 });
}
