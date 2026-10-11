import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {startRollingPublicServer,createRollingPublicIndexFromConfig} from '../../scripts/rolling-public-server.mjs';
import {loadRollingWalletAssets} from '../../scripts/rolling-wallet-assets.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const files=new Map([['/','live.html'],['/reader.mjs','reader.mjs'],['/reader-client.mjs','reader-client.mjs'],
 ['/model.mjs','model.mjs'],['/navigation.mjs','navigation.mjs'],['/style.css','style.css'],['/wallet-panel.mjs','wallet-panel.mjs']]);
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"};
export function createRollingReaderAssetHandler(wallet){
 const selectedHeaders=wallet?{...headers,'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin',
  'Content-Security-Policy':`default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; connect-src 'self' data: ${wallet.connectOrigins.join(' ')}; worker-src 'self' blob:; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`}:headers;
 return async function(req,res){
 const reply=(status,body='')=>{res.writeHead(status,selectedHeaders);res.end(body);};
 if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');reply(405);return;}
 const url=new URL(req.url,'http://127.0.0.1'),file=files.get(url.pathname);
 if(!url.search&&wallet){const asset=await wallet.read(url.pathname);if(asset){res.writeHead(200,{...selectedHeaders,'Content-Type':asset.type});res.end(req.method==='HEAD'?undefined:asset.body);return;}}
 if(!file||url.search){reply(404);return;}
 const body=await fs.readFile(path.join(root,file));
 res.writeHead(200,{...selectedHeaders,'Content-Type':file.endsWith('.mjs')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8'});
 res.end(req.method==='HEAD'?undefined:body);
 };
}
export const serveRollingReaderAsset=createRollingReaderAssetHandler();
export function startRollingReader({index,port=0,wallet}){
 return startRollingPublicServer({index,port,staticHandler:createRollingReaderAssetHandler(wallet)});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(![3,4].includes(process.argv.length))throw Error('A public deployment configuration and optional wallet configuration are required');
  const config=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
  const wallet=process.argv[3]?await loadRollingWalletAssets(JSON.parse(await fs.readFile(process.argv[3],'utf8')),config.scope):undefined;
  const server=await startRollingReader({...await createRollingPublicIndexFromConfig(config),wallet});
  process.stdout.write(JSON.stringify({rollingChatUrl:server.url,scope:wallet?'Public reader with private account actions':'Public reader; wallet deployment not configured'})+'\n');
  let closing=false;
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(closing)return;closing=true;server.close().then(()=>process.exit(0),()=>process.exit(1));});
 }catch{process.stderr.write('Rolling Chat could not start. Check the public deployment configuration and node.\n');process.exitCode=1;}
}
