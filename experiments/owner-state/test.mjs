import net from 'node:net';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {ROOT,assertNodeVersion,assertAztecPackages,nargoBinary,bbBinary} from '../../scripts/toolchain.mjs';
import {runWithService,probeTcp} from '../../scripts/process-lifecycle.mjs';
assertNodeVersion();assertAztecPackages();
const cwd=path.join(ROOT,'experiments/owner-state');
const env={...process.env,HARDWARE_CONCURRENCY:'2',TXE_WORKERS:'1',NODE_BACKEND:'js'};
const run=(command,args,options={})=>execFileSync(command,args,{cwd,env,stdio:'inherit',...options});
run(process.execPath,['prepare-dependency.mjs']);
const compiler=nargoBinary();
run(compiler,['compile','--package','owner_fixture','--silence-warnings']);
run(bbBinary(),['aztec_process','-i','target/owner_fixture-OwnerFixture.json']);
const reservation=net.createServer();
await new Promise((resolve,reject)=>{reservation.once('error',reject);reservation.listen(0,'127.0.0.1',resolve);});
const port=reservation.address().port;
await new Promise(resolve=>reservation.close(resolve));
await runWithService({
 service:{command:process.execPath,args:['--preserve-symlinks','experiments/owner-state/txe-service.mjs'],options:{cwd:ROOT,env:{...env,TXE_PORT:String(port)},stdio:'inherit'}},
 tests:{command:compiler,args:['test','--package','owner_fixture','--oracle-resolver',`http://127.0.0.1:${port}`,'--test-threads','1','--silence-warnings'],options:{cwd,env,stdio:'inherit'}},
 probe:()=>probeTcp(port),
});
