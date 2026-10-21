// Presentation double: no actual wallet, browser, keys, signing or persistence.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('./wallet-buttons.js',import.meta.url),'utf8');
function fixture({restoreGate}={}){
 const nodes=new Map(),calls={restore:0,connect:[],end:0,reload:0},state={busy:false,invalidated:false,address:null,ethereumConnected:false};let options;
 function node(tag='div'){return {tagName:tag,children:[],disabled:false,events:{},textContent:'',setAttribute(){},append(...items){this.children.push(...items);},appendChild(item){this.children.push(item);return item;},replaceChildren(){this.children=[];},remove(){},showModal(){this.open=true;},close(){this.open=false;},addEventListener(name,fn){this.events[name]=fn;}};}
 const container=node();nodes.set('wallet',container);
 Object.defineProperty(container,'innerHTML',{set(value){this.html=value;for(const match of value.matchAll(/id="([^"]+)"/g))nodes.set(match[1],node());}});
 const body=node(),provider={request(){}},wallet={id:'test-wallet',name:'Test wallet',provider,rdns:'io.metamask',icon:'javascript:private-sentinel'};
 const account={snapshot:()=>({...state}),configure:value=>{options=value;},async restoreRemembered(){calls.restore++;if(restoreGate)await restoreGate.promise;return false;},async connect(...args){calls.connect.push(args);state.address='0xprivate';state.ethereumConnected=true;state.ethereumAddress='0x'+'1'.repeat(40);state.ethereumWalletName='Test wallet';options.onChange();await options.onReady?.();},async endSession(){calls.end++;},invalidate(){state.invalidated=true;}};
 const context=vm.createContext({window:{BillboardAccount:account,BillboardWalletProviders:{list:()=>[wallet],subscribe:()=>()=>{},refresh(){}}},document:{body,getElementById:id=>nodes.get(id)??null,querySelector:()=>null,createElement:tag=>node(tag),createTextNode:text=>({textContent:text})},location:{reload(){calls.reload++;}},publicOperationFailure:()=>({message:'Wallet action unavailable.'})});
 vm.runInContext(source,context);return {context,nodes,calls,container,body,provider};
}
test('demo controls restore once across mounts without prompts or legacy inputs',async()=>{
 const gate=Promise.withResolvers(),f=fixture({restoreGate:gate});const first=f.context.initWalletButtons('wallet');assert.equal(f.context.initWalletButtons('wallet'),first);gate.resolve();await first;
 assert.equal(f.calls.restore,1);assert.equal(f.calls.connect.length,0);assert.doesNotMatch(f.container.html,/password|type="file"|passkey|backup/i);assert.equal(f.nodes.get('wbLockBtn').disabled,true);
});
test('explicit wallet choice derives account, preserves hooks and signs out through custody',async()=>{
 const f=fixture();let ready=0,changed=0;await f.context.initWalletButtons('wallet',{onReady(){ready++;},onChange(){changed++;}});
 const picking=f.context._loadEthBrowser();await Promise.resolve();const dialog=f.body.children[0];assert(dialog?.open);const choice=dialog.children[1].children[0];assert.equal(choice.children.length,1,'Unsafe icon must not create an image');choice.events.click();await picking;
 assert.equal(f.calls.connect.length,1);const [provider,name,options]=f.calls.connect[0];assert.equal(provider,f.provider);assert.equal(name,'Test wallet');assert.deepEqual(JSON.parse(JSON.stringify(options)),{selectAccount:true,deriveAccount:true,providerId:'test-wallet'});assert.equal(ready,1);assert.equal(changed,1);
 await f.nodes.get('wbLockBtn').events.click();assert.equal(f.calls.end,1);assert.equal(f.calls.reload,1);
});
