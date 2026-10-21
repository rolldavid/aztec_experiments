// Shared demo controls. Wallet signatures are requested only after a click.
let _statusId='setupStatus',_walletPickerOpen=false,_rememberedWallet=null;
function walletMessage(message,type='info') {
  const region=document.getElementById('wbAccountStatus');
  if(region){region.textContent=message;region.className=type==='error'?'error':'';}
  if(typeof log==='function')log(message,type,_statusId);
}
function _updateButtonColors() {
  const state=window.BillboardAccount.snapshot(),connection=document.getElementById('wbConnectionStatus');
  if(connection)connection.textContent=state.invalidated?'Your wallet changed. Sign out before connecting again.':state.ethereumConnected?state.ethereumWalletName+' · '+state.ethereumAddress.slice(0,6)+'…'+state.ethereumAddress.slice(-4):state.address?'Signed in on this browser. Connect your Ethereum wallet when you need to pay.':'Connect your Ethereum wallet to open your account.';
  const summary=document.querySelector('#wbAccountMenu > summary');if(summary)summary.textContent=state.address?'Your account':'Account';
  const connect=document.getElementById('wbEthBrowserBtn');if(connect)connect.disabled=state.busy||state.invalidated||state.ethereumConnected&&!!state.address;
  const signOut=document.getElementById('wbLockBtn');if(signOut)signOut.disabled=state.busy||!state.address&&!state.ethereumConnected&&!state.invalidated;
}
function chooseEthereumWallet() {
  if(_walletPickerOpen)return Promise.resolve(null);
  _walletPickerOpen=true;
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog'),title=document.createElement('h2'),choices=document.createElement('div'),cancel=document.createElement('button');
    title.id='walletPickerTitle';title.textContent='Choose a wallet';dialog.setAttribute('aria-labelledby',title.id);
    cancel.type='button';cancel.textContent='Cancel';let unsubscribe=()=>{},finished=false;
    function finish(wallet){if(finished)return;finished=true;unsubscribe();dialog.close();dialog.remove();_walletPickerOpen=false;resolve(wallet);}
    function render(){
      choices.replaceChildren();const wallets=window.BillboardWalletProviders.list();
      if(!wallets.length){const message=document.createElement('p');message.textContent='No Ethereum wallet was found. Open this page in a browser with an Ethereum wallet installed.';choices.appendChild(message);}
      for(const wallet of wallets){
        const button=document.createElement('button');button.type='button';
        if(typeof wallet.icon==='string'&&wallet.icon.length<131072&&/^data:image\/(?:png|jpeg|webp|svg\+xml)[;,]/i.test(wallet.icon)){const icon=document.createElement('img');icon.src=wallet.icon;icon.alt='';icon.width=icon.height=32;button.appendChild(icon);}
        button.appendChild(document.createTextNode(wallet.name));button.addEventListener('click',()=>finish(wallet));choices.appendChild(button);
      }
    }
    dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});cancel.addEventListener('click',()=>finish(null));
    dialog.append(title,choices,cancel);document.body.appendChild(dialog);
    unsubscribe=window.BillboardWalletProviders.subscribe(render);render();dialog.showModal();window.BillboardWalletProviders.refresh();
  });
}
async function _loadEthBrowser() {
  if(_rememberedWallet)await _rememberedWallet;
  const wallet=await chooseEthereumWallet();
  if(wallet)return window.BillboardAccount.connect(wallet.provider,wallet.name,{selectAccount:wallet.rdns==='io.metamask',deriveAccount:true,providerId:wallet.id});
}
function initWalletButtons(containerId,options={}) {
  const container=document.getElementById(containerId);if(!container)return;
  _statusId=options.statusId||'setupStatus';
  const report=error=>walletMessage(publicOperationFailure(error?.code===4001||error?.code==='ACTION_REJECTED'?{code:'BB_WALLET_REJECTED'}:error).message,'error');
  const handle=run=>async()=>{try{await run();}catch(error){report(error);}};
  window.BillboardAccount.configure({...options,onSetupError:error=>{report(error);options.onSetupError?.(error);},onChange:()=>{_updateButtonColors();options.onChange?.(window.BillboardAccount.snapshot());},onMessage:walletMessage});
  document.getElementById('wbAccountMenu')?.remove();
  container.innerHTML='<div class="wallet-btns"><button class="wallet-btn" id="wbEthBrowserBtn" type="button">Connect wallet</button><details class="account-menu" id="wbAccountMenu"><summary>Account</summary><div class="account-menu-panel"><p id="wbConnectionStatus" class="account-address"></p><p id="wbAccountStatus" role="status" aria-live="polite"></p><button class="secondary" id="wbLockBtn" type="button">Sign out</button><div id="accountActions"></div></div></details></div>';
  document.getElementById('wbEthBrowserBtn').addEventListener('click',handle(_loadEthBrowser));
  document.getElementById('wbLockBtn').addEventListener('click',handle(async()=>{if(_rememberedWallet)await _rememberedWallet;await window.BillboardAccount.endSession();location.reload();}));
  const slot=document.getElementById('accountSlot');if(slot)slot.appendChild(document.getElementById('wbAccountMenu'));
  _updateButtonColors();
  // Share one silent restore across repeated mounts; it never requests wallet permissions.
  _rememberedWallet??=Promise.resolve().then(()=>window.BillboardAccount.restoreRemembered()).catch(error=>{report(error);return false;}).finally(_updateButtonColors);
  return _rememberedWallet;
}
function resetWalletState(){window.BillboardAccount.invalidate();_updateButtonColors();}
