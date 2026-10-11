// TEST ONLY. Pinned SDK observations, never raw log/error/address payloads.
// This hook observes the existing sequencer; it changes no clock or retry policy.
const events=['state-changed','preparing-checkpoint','proposer-rollup-check-failed','block-tx-count-check-failed','block-build-failed','checkpoint-empty','header-validation-failed','checkpoint-publish-failed','checkpoint-published','checkpoint-error'];
const states=new Set(['STOPPED','STOPPING','IDLE','SYNCHRONIZING','PROPOSER_CHECK','INITIALIZING_CHECKPOINT','WAITING_FOR_TXS','CREATING_BLOCK','WAITING_UNTIL_NEXT_BLOCK','ASSEMBLING_CHECKPOINT','COLLECTING_ATTESTATIONS','PUBLISHING_CHECKPOINT']);
const numbers=['slot','targetSlot','checkpointNumber','checkpoint','secondsIntoBuildFrame','nowForStartGate','startDeadline','syncedL2Slot','minTxs'];
const patterns=[
  ['missing-committee',/^No committee (?:found )?for slot \d+(?:;|:| yet:)/],
  ['past-start-deadline',/^Past start deadline for slot \d+, abandoning block building$/],
  ['pending-l1-sync',/^Cannot propose block at next L2 slot \d+ due to pending sync from L1$/],
  ['not-proposer',/^Cannot propose at target slot \d+ since we are not a proposer$/],
  ['proposer-lookup-error',/^Error getting proposer for target slot \d+$/],
  ['sync-mismatch',/^Sequencer sync check failed(?:$|:)/],
  ['pending-proposed-checkpoint',/^Waiting for proposed checkpoint to catch up with reexecuted block$/],
  ['escape-hatch',/^Escape hatch open but we are not proposer, skipping vote-only actions$/],
  ['already-processed',/^Target slot \d+ has already been processed$/],
];
function numeric(value){if(typeof value==='bigint'&&value>=-9007199254740991n&&value<=9007199254740991n)return Number(value);if(typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=Number.MAX_SAFE_INTEGER)return value;}
function fields(input={}){const out={};for(const key of numbers){const n=numeric(input[key]);if(n!==undefined)out[key]=n;}for(const key of ['oldState','newState'])if(states.has(input[key]))out[key]=input[key];return out;}
export function observeSequencer(node){
  const sequencer=node.getSequencer().getSequencer();
  const observation={events:{},skips:{},recent:[],samples:[]};
  const record=(group,name,input)=>{const count=observation[group][name]??0;observation[group][name]=Math.min(count+1,100000);observation.recent.push({kind:name,...fields(input)});if(observation.recent.length>32)observation.recent.shift();};
  const listeners=events.map(name=>{const listener=input=>record('events',name,input);sequencer.on(name,listener);return[name,listener];});
  // The pinned SDK does not emit events for early skips. Wrap only this instance
  // logger, forward exactly once and restore on detach. No global log enabling.
  const original=sequencer.log,wrapped=Object.create(original);
  for(const level of ['trace','debug','verbose','info','warn','error'])wrapped[level]=function(message,...args){
    if(typeof message==='string')for(const [kind,pattern] of patterns)if(pattern.test(message)){record('skips',kind,args[0]);break;}
    return original[level].call(original,message,...args);
  };
  sequencer.log=wrapped;
  return {observation,async sample(){
    const [pending,syncedSlot,l1,world,tips]=await Promise.all([node.getPendingTxCount(),node.getSyncedL2SlotNumber(),node.getSyncedL1Timestamp(),node.getWorldStateSyncStatus(),node.getChainTips()]);
    const values={pending,syncedSlot,l1,worldBlock:world.latestBlockNumber,finalizedBlock:world.finalizedBlockNumber,proposedBlock:tips.proposed.number,checkpointedBlock:tips.checkpointed.block.number};
    const row={};for(const [key,value] of Object.entries(values)){const n=numeric(value);if(n!==undefined)row[key]=n;}
    row.treesAreSynched=world.treesAreSynched===true;observation.samples.push(row);if(observation.samples.length>32)observation.samples.shift();
  },stop(){for(const [name,listener] of listeners)sequencer.off(name,listener);if(sequencer.log===wrapped)sequencer.log=original;}};
}
