import {createHash} from 'node:crypto';

// A zero batching window must not depend on browser timers: hidden tabs may
// throttle those timers. Keep the native bounded queue, codecs and transport.
export function zeroWindowRpcMicrotasks(source){
 const expected='3c7116060b417015c373d02bcdb7d69fef839f89e4da88a33cd98f44685db21a';
 if(createHash('sha256').update(source).digest('hex')!==expected)throw Error('RPC scheduling source mismatch');
 const replace=(before,after,count=1)=>{
  if(source.split(before).length!==count+1)throw Error('RPC scheduling boundary mismatch');
  source=source.replaceAll(before,after);
 };
 replace('    let sendBatchTimeoutHandle;',`    let scheduledBatch;
    const scheduleBatch = ()=>{
        const token = {};
        scheduledBatch = token;
        const dispatch = ()=>{
            // An explicit native batch(values) flush invalidates its old task.
            // It must never flush calls belonging to a newer scheduled batch.
            if (scheduledBatch === token) void sendBatch();
        };
        if (batchWindowMS === 0) queueMicrotask(dispatch);
        else token.timer = setTimeout(dispatch, batchWindowMS);
    };`);
 replace(`        if (sendBatchTimeoutHandle !== undefined) {
            clearTimeout(sendBatchTimeoutHandle);
            sendBatchTimeoutHandle = undefined;
        }`,`        if (scheduledBatch !== undefined) {
            if (scheduledBatch.timer !== undefined) clearTimeout(scheduledBatch.timer);
            scheduledBatch = undefined;
        }`);
 replace('sendBatchTimeoutHandle = setTimeout(sendBatch, batchWindowMS);','scheduleBatch();',2);
 replace('if (sendBatchTimeoutHandle === undefined) {','if (scheduledBatch === undefined) {');
 return source;
}
