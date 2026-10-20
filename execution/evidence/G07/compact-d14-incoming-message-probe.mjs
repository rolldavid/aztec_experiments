import {IncomingMessage} from 'node:http';import {EventEmitter} from 'node:events';import assert from 'node:assert/strict';
const socket=Object.assign(new EventEmitter(),{readable:true,destroyed:false,destroyCalls:0,destroy(){this.destroyCalls++;this.destroyed=true}});
const req=new IncomingMessage(socket);req.complete=true;req.push(Buffer.from('{}'));req.push(null);for await(const chunk of req){};
assert.equal(req.readableEnded,true);assert.equal(req.complete,true);req.destroy();await new Promise(r=>setImmediate(r));
assert.equal(socket.destroyCalls,0);assert.equal(req.aborted,false);
process.stdout.write(JSON.stringify({label:'Actual pinned Node IncomingMessage with labelled socket; no listener, SDK or native cryptography',complete:req.complete,readableEnded:req.readableEnded,requestDestroyed:req.destroyed,requestAborted:req.aborted,socketDestroyCalls:socket.destroyCalls,socketDestroyed:socket.destroyed},null,2)+'\n');
