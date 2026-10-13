import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {devnetPorts,readDevnetRecord} from './network.mjs';

export function developmentOptions(args=[],env={}) {
 const options={};for(let i=0;i<args.length;i+=2){const key=args[i];if(!['--profile','--directory','--app-port','--node-port','--ethereum-port','--hosted-config'].includes(key)||Object.hasOwn(options,key)||!args[i+1])throw Error('Invalid development option');options[key]=args[i+1];}
 if(env.PLUGIN_PROOFS!==undefined&&env.PLUGIN_PROOFS!=='false')throw Error('Development requires proofs disabled');
 const profile=options['--profile']??'rolling';if(!['rolling','legacy'].includes(profile))throw Error('Unknown development profile');
 const ports=devnetPorts(Object.fromEntries([['appPort','--app-port'],['nodePort','--node-port'],['ethereumPort','--ethereum-port']].filter(([,k])=>options[k]!==undefined).map(([k,v])=>[k,/^[1-9][0-9]*$/.test(options[v])?Number(options[v]):NaN])));
 return {profile,directory:path.resolve(options['--directory']??'.build/rolling-devnet'),ports,...(options['--hosted-config']?{hostedConfig:path.resolve(options['--hosted-config'])}:{})};
}

export async function acquireDevelopmentLease(directory) {
 await fs.mkdir(directory,{recursive:true,mode:0o700});
 const stat=await fs.lstat(directory);
 if(!path.isAbsolute(directory)||await fs.realpath(directory)!==directory||!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o777)!==0o700||stat.uid!==process.getuid())throw Error('Development state directory must be canonical, owned and private');
 // Never replace an older unresolved startup record during this migration.
 if(await readDevnetRecord(path.join(directory,'owner.json')))throw Error('Original development owner requires reconciliation');
 const {acquireHostedLease}=await import('../main.mjs');return acquireHostedLease(directory);
}

export async function startDevelopment(options) {
 const {Barretenberg,BarretenbergSync}=await import('@aztec-foundation/bb.js');
 const {bootstrapPluginDevnet,bootstrapRollingDevnet}=await import('./bootstrap.mjs');
 const {directory}=options,lease=await acquireDevelopmentLease(directory);
 let fixture,server,service,closing;
 const shutdown=()=>close().then(()=>process.exit(0),()=>process.exit(1));
 if(options.handleSignals){process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);}
 function close(){return closing??=(async()=>{process.removeListener('SIGINT',shutdown);process.removeListener('SIGTERM',shutdown);const errors=[];for(const stop of [()=>service?.close(),()=>server?.close(),()=>fixture?.close(),()=>Barretenberg.destroySingleton(),()=>BarretenbergSync.destroySingleton()])try{await stop();}catch(error){errors.push(error);}
  if(!errors.length)await lease.close();if(errors.length)throw Error('Development cleanup requires reconciliation');
 })();}
 try{
  if(options.profile==='legacy'){
   fixture=await bootstrapPluginDevnet({directory,host:'127.0.0.1',proofs:false});
  }else{
   fixture=await bootstrapRollingDevnet({directory,ports:options.ports,onOwned:owner=>{fixture=owner;}});
   const {loadRollingWalletAssets}=await import('../../scripts/rolling-wallet-assets.mjs');
   const {createRollingPublicIndexFromConfig}=await import('../../scripts/rolling-public-server.mjs');
   const {startRollingReader}=await import('../../apps/rolling/start.mjs');
   const wallet=await loadRollingWalletAssets(fixture.walletConfig,fixture.readerConfig.scope);
   const index=await createRollingPublicIndexFromConfig(fixture.readerConfig);
   try{server=await startRollingReader({...index,wallet});}catch(error){await index.index.close();throw error;}
  }
  if(options.hostedConfig){const config=await readDevnetRecord(options.hostedConfig);if(!config||config.development!==true)throw Error('Explicit local hosted configuration required');const {runHostedService}=await import('../main.mjs');service=await runHostedService({config});}
  await lease.assertHeld();
  return {url:server?.url,profile:options.profile,close,readiness:fixture.readiness??'legacy-development-only'};
 }catch{await close();throw Error('Development startup failed; preserve state and reconcile its saved operations');}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let runtime;
 try{runtime=await startDevelopment({...developmentOptions(process.argv.slice(2),process.env),handleSignals:true});console.log(JSON.stringify({url:runtime.url,profile:runtime.profile,readiness:runtime.readiness,proofsEnabled:false}));

 }catch{console.error('Development startup failed. Preserve the selected private state directory; no automatic reset or retry is performed.');process.exitCode=1;}
}
