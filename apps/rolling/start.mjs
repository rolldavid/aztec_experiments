import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {startRollingPublicServer,createRollingPublicIndexFromConfig} from '../../scripts/rolling-public-server.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const files=new Map([['/','live.html'],['/reader.mjs','reader.mjs'],['/reader-client.mjs','reader-client.mjs'],
 ['/model.mjs','model.mjs'],['/navigation.mjs','navigation.mjs'],['/style.css','style.css']]);
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"};
export async function serveRollingReaderAsset(req,res){
 const reply=(status,body='')=>{res.writeHead(status,headers);res.end(body);};
 if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');reply(405);return;}
 const url=new URL(req.url,'http://127.0.0.1'),file=files.get(url.pathname);
 if(!file||url.search){reply(404);return;}
 const body=await fs.readFile(path.join(root,file));
 res.writeHead(200,{...headers,'Content-Type':file.endsWith('.mjs')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8'});
 res.end(req.method==='HEAD'?undefined:body);
}
export function startRollingReader({index,port=0}){
 return startRollingPublicServer({index,port,staticHandler:serveRollingReaderAsset});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv.length!==3)throw Error('One public deployment configuration is required');
  const config=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
  const server=await startRollingReader(await createRollingPublicIndexFromConfig(config));
  process.stdout.write(JSON.stringify({rollingChatUrl:server.url,scope:'Public reader; wallet actions not yet connected'})+'\n');
  let closing=false;
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(closing)return;closing=true;server.close().then(()=>process.exit(0),()=>process.exit(1));});
 }catch{process.stderr.write('Rolling Chat could not start. Check the public deployment configuration and node.\n');process.exitCode=1;}
}
