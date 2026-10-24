// Actual Board/FPC functional qualification, using native TXE (no real proof).
import net from 'node:net';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {ROOT,assertNodeVersion,assertAztecPackages,nargoBinary,bbBinary} from '../../scripts/toolchain.mjs';
import {prepareOwnerNoir} from '../../scripts/prepare-owner-noir.mjs';
import {runWithService,probeTcp} from '../../scripts/process-lifecycle.mjs';
assertNodeVersion();assertAztecPackages();prepareOwnerNoir();
const cwd=path.join(ROOT,'billboard');
const env={...process.env,HARDWARE_CONCURRENCY:'2',TXE_WORKERS:'1',NODE_BACKEND:'js'};
const compiler=nargoBinary();
for(const [name,contract] of [['rolling_contract','RollingBoard'],['private_fee_contract','PrivateFPC'],['owner_delivery_test','OwnerPostingAccount']]){
 execFileSync(compiler,['compile','--package',name,'--silence-warnings'],{cwd,env,stdio:'inherit'});
 execFileSync(bbBinary(),['aztec_process','--force','-i',path.join(cwd,'target',`${name}-${contract}.json`)],{cwd,env,stdio:'inherit'});
}
const reservation=net.createServer();
await new Promise((resolve,reject)=>{reservation.once('error',reject);reservation.listen(0,'127.0.0.1',resolve);});
const port=reservation.address().port;
await new Promise(resolve=>reservation.close(resolve));
await runWithService({
 service:{command:process.execPath,args:['--preserve-symlinks','experiments/owner-state/txe-service.mjs'],options:{cwd:ROOT,env:{...env,TXE_PORT:String(port)},stdio:'inherit'}},
 tests:{command:compiler,args:['test','--package','owner_delivery_test','--oracle-resolver',`http://127.0.0.1:${port}`,'--test-threads','1','--silence-warnings'],options:{cwd,env,stdio:'inherit'}},
 probe:()=>probeTcp(port),
});
