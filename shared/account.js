// Ethereum-derived Aztec custody and a remembered browser session.
// A page has one immutable wallet context.
window.walletState = { aztec:null, ethSigner:null, ethProvider:null, ethTransport:null, ethAccount:null, ethType:null, ethWalletName:null, invalidated:false };
let _onReady=null, _onSetupError=(_error)=>_wlog('Account unlocked, but setup did not finish. Try account setup again.','error'), _onAztecLoad=null, _requireEth=true, _readyFired=false;
let _canEndSession=()=>true;
let _walletBusy=false, _walletGeneration=0, _connectingEth=null;
/** @type {(state:ReturnType<typeof accountSnapshot>)=>void} */
let _accountNotify=()=>{};
/** @type {(message:string,type:string)=>void} */
let _accountLog=()=>{};
function _wlog(message,type='info') { _accountLog(message,type); }
function _updateAccountState() { try{_accountNotify(accountSnapshot());}catch{ /* Rendering cannot change custody state. */ } }
/** Public account state contains no signing material. */
function accountSnapshot() { return {address:window.walletState.aztec?.address.toString()||null,ethereumAddress:window.walletState.ethAccount,busy:_walletBusy,invalidated:window.walletState.invalidated,ethereumWalletName:window.walletState.ethWalletName,ethereumConnected:!!window.walletState.ethSigner && !window.walletState.invalidated}; }
function _assertWalletLive() { if(window.walletState.invalidated) throw new Error('Wallet context changed. Reload this page before continuing.'); }
function _invalidateWalletContext({forget=false}={}) {
  if(window.walletState.invalidated)return;
  window.walletState.invalidated=true; _walletGeneration++;
  if(forget)void _forgetRememberedAccount().catch(()=>{});
  _wlog('Wallet account or network changed. Reload this page to reconnect; pending transactions must be checked before retrying.','error');
  _updateAccountState();
}
async function _walletOperation(run) {
  _assertWalletLive(); if(_walletBusy) throw new Error('Another wallet operation is in progress.');
  _walletBusy=true; _updateAccountState();
  try { return await run(); } finally { _walletBusy=false; _updateAccountState(); }
}
function _checkReady() {
  if(_readyFired || window.walletState.invalidated) return;
  if(window.walletState.aztec && (!_requireEth || window.walletState.ethSigner)) {
    _readyFired=true;
    Promise.resolve().then(()=>_onReady?.()).catch(error=>{_readyFired=false;try{_onSetupError(error);}catch{_wlog('Account unlocked, but setup did not finish. Try account setup again.','error');}});
  }
}
async function _deriveAccountAddress(a,secretKeyHex,saltVal) {
  const secretKey=a.Fr.fromHexString(secretKeyHex);
  const accountContract=new a.SchnorrInitializerlessAccountContract(a.deriveSigningKey(secretKey));
  const {publicKeys}=await a.deriveKeys(secretKey);
  const artifact=await accountContract.getContractArtifact();
  const instance=await a.getContractInstanceFromInstantiationParams(artifact,{
    constructorArtifact:undefined,constructorArgs:undefined,salt:new a.Fr(BigInt(saltVal)),publicKeys,immutablesHash:await accountContract.getImmutablesHash(),
  });
  return {address:instance.address,partialAddress:await a.computePartialAddress(instance)};
}
async function _prepareWallet(raw) {
  if(window.walletState.aztec) throw Object.assign(Error('Sign out before changing accounts.'),{code:'BB_ACCOUNT_REPLACEMENT'});
  const modulus=21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  if(!raw||['secretKey','salt'].some(name=>typeof raw[name]!=='string'||!/^0x[0-9a-f]{64}$/.test(raw[name])||BigInt(raw[name])>=modulus)||BigInt(raw.secretKey)===0n)throw Object.assign(Error('Invalid saved account.'),{code:'BB_ACCOUNT_RECORD_INVALID'});
  const wallet={secretKey:raw.secretKey,salt:raw.salt};
  if(!window.__aztec?.Fr) throw new Error('Wait for the application to load before opening a wallet.');
  const derived=await _deriveAccountAddress(window.__aztec,wallet.secretKey,wallet.salt);
  if(raw.address && String(raw.address).toLowerCase()!==derived.address.toString().toLowerCase()) throw Object.assign(Error('Wallet address does not match its key and salt.'),{code:'BB_ACCOUNT_RECORD_INVALID'});
  return {...wallet,...derived,raw:wallet};
}
function _activateWallet(prepared) {
  _assertWalletLive(); if(window.walletState.aztec) throw Object.assign(Error('Sign out before changing accounts.'),{code:'BB_ACCOUNT_REPLACEMENT'});
  window.walletState.aztec=prepared; _walletGeneration++;
  _wlog('Aztec wallet loaded: '+prepared.address.toString(),'success');
  _updateAccountState(); if(_onAztecLoad) {try {_onAztecLoad(prepared.address.toString());}catch {_wlog('Wallet loaded, but address display did not update. Reload before continuing.','error');_invalidateWalletContext();}} _checkReady();
}
function _firstEthereumAccount(accounts) {
  return Array.isArray(accounts) && accounts.length>0 && accounts.every(account=>typeof account==='string' && /^0x[0-9a-fA-F]{40}$/.test(account)) ? accounts[0].toLowerCase() : null;
}
async function connectEthereumAccount(transport, walletName='Browser wallet', {selectAccount=false,deriveAccount=false,providerId='',freshAccount=false}={}) {
  return _walletOperation(async()=>{
    if(window.walletState.ethSigner) {
      if(window.walletState.aztec || !deriveAccount)throw new Error('An Ethereum wallet is already connected.');
      // A cancelled signature has not activated an account. Honour a new selection.
      Object.assign(window.walletState,{ethSigner:null,ethProvider:null,ethTransport:null,ethAccount:null,ethType:null,ethWalletName:null,ethChainId:null});
      _walletGeneration++;_updateAccountState();
    }
    if(typeof transport?.request!=='function')throw Object.assign(new Error('Choose an Ethereum wallet.'),{code:'BB_BROWSER_WALLET_MISSING'});
    _bindEthereumProvider(transport);
    const generation=_walletGeneration;
    const connection={disconnected:false};_connectingEth=connection;
    let stage='wallet-permission';
    try {
    // MetaMask account selection must not silently reuse an older site grant.
    if(selectAccount)await transport.request({method:'wallet_requestPermissions',params:[{eth_accounts:{}}]});
    stage='wallet-network';
    const expected=typeof _getPublicConfig==='function'?_getPublicConfig()?.network?.chainId:null;
    if(expected!==null&&expected!==undefined){
      const chainId='0x'+BigInt(expected).toString(16);
      if(BigInt(await transport.request({method:'eth_chainId'}))!==BigInt(expected)){
        try{await transport.request({method:'wallet_switchEthereumChain',params:[{chainId}]});}
        catch(error){throw Object.assign(new Error('Switch your wallet to the board network.'),{code:/** @type {{code?:number}} */ (error)?.code===4001?'BB_WALLET_REJECTED':'BB_WALLET_NETWORK'});}
        if(BigInt(await transport.request({method:'eth_chainId'}))!==BigInt(expected))throw Object.assign(new Error('Wallet network mismatch.'),{code:'BB_WALLET_NETWORK'});
      }
    }
    const provider=new ethers.BrowserProvider(transport);
    stage='wallet-accounts';
    const requested=await provider.send('eth_requestAccounts',[]);
    stage='wallet-signer';
    const signer=await provider.getSigner(), account=await signer.getAddress();
    stage='wallet-verification';
    const network=await provider.getNetwork();
    const chain=BigInt(await transport.request({method:'eth_chainId'}));
    const current=await transport.request({method:'eth_accounts'});
    _assertWalletLive(); if(generation!==_walletGeneration)throw new Error('Wallet context changed.');
    if(connection.disconnected)throw Object.assign(new Error('Wallet disconnected during setup. Reconnect your wallet and try again.'),{code:'BB_WALLET_DISCONNECTED'});
    if(chain!==network.chainId || (expected!==null&&expected!==undefined&&chain!==BigInt(expected)))throw Object.assign(new Error('Wallet network mismatch.'),{code:'BB_WALLET_NETWORK'});
    const selected=account.toLowerCase();
    if(_firstEthereumAccount(requested)!==selected || _firstEthereumAccount(current)!==selected) {
      _invalidateWalletContext();throw new Error('Wallet context changed.');
    }
    if(window.walletState.aztec?.ethereumAddress && window.walletState.aztec.ethereumAddress!==selected)throw Object.assign(Error('Connect the Ethereum wallet used for this account.'),{code:'BB_ACCOUNT_OWNER_MISMATCH'});
    window.walletState.ethTransport=transport;window.walletState.ethSigner=signer;window.walletState.ethProvider=provider;window.walletState.ethAccount=account;
    window.walletState.ethWalletName=typeof walletName==='string' && walletName.trim() && walletName.length<=128?walletName:'Browser wallet';
    window.walletState.ethType='browser';window.walletState.ethChainId=String(network.chainId);_walletGeneration++;
    // The engine independently verifies signer, node and portal chain agreement.
    _wlog(window.walletState.ethWalletName+' connected: '+account,'success');
    _updateAccountState();
    stage='account-sign-in';
    if(deriveAccount && !window.walletState.aztec)await _openEthereumAccount(providerId,{freshAccount});
    _checkReady();
    } catch(error) {
      // Never log wallet RPC payloads: personal_sign carries account key material.
      const safeCode=value=>typeof value==='number'&&Number.isSafeInteger(value)?value:typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(value)?value:'unclassified';
      console.warn('[account-sign-in]',stage,safeCode(error?.code),safeCode(error?.info?.error?.code),safeCode(error?.error?.code));
      throw error;
    } finally {_connectingEth=null;}
  });
}
// The stable signature is private key material, never an authentication token.
function _ethereumScope(){
 const chainId=String(_getPublicConfig().network.chainId);
 return {origin:globalThis.location.origin,chainId};
}
async function _forgetRememberedAccount(){
 const store=window.BillboardEthereumSession;
 if(!store)return;
 const scope=_ethereumScope(),owner=(window.walletState.aztec?.ethereumAddress??window.walletState.ethAccount)?.toLowerCase();
 if(!owner)return;
 await navigator.locks.request('rolling-chat-account-session:'+scope.origin+':'+scope.chainId,async()=>{
  const saved=await store.load(scope);
  if(saved?.metadata.ethereumAddress===owner){await store.clear(scope);_watchRememberedAccount();_sessionChannel?.postMessage({type:'signed-out'});}
 });
}
let _sessionChannel;
function _watchRememberedAccount(){
 if(_sessionChannel||typeof BroadcastChannel!=='function')return;
 _sessionChannel=new BroadcastChannel('rolling-chat-account-session-v1');
 _sessionChannel.onmessage=()=>{if(window.walletState.aztec)_invalidateWalletContext();};
}
async function _openEthereumAccount(providerId,{freshAccount=false}={}){
 const store=window.BillboardEthereumSession,scope=_ethereumScope(),generation=_walletGeneration;
 const address=window.walletState.ethAccount.toLowerCase(),signer=window.walletState.ethSigner,transport=window.walletState.ethTransport;
 const guard=async()=>{
  _assertWalletLive();if(generation!==_walletGeneration)throw Error('Wallet context changed.');
  if(_firstEthereumAccount(await transport.request({method:'eth_accounts'}))!==address || BigInt(await transport.request({method:'eth_chainId'}))!==BigInt(scope.chainId)){_invalidateWalletContext({forget:true});throw Object.assign(Error('Wallet context changed.'),{code:'BB_ACCOUNT_OWNER_MISMATCH'});}
  _assertWalletLive();if(generation!==_walletGeneration)throw Error('Wallet context changed.');
 };
 await navigator.locks.request('rolling-chat-account-session:'+scope.origin+':'+scope.chainId,async()=>{
  await guard();
  const saved=await store.load(scope);await guard();
  let raw,testAccount=await store.selectedTestAccount(scope,address);await guard();
  if(freshAccount){
   if(!['11155111','31337'].includes(scope.chainId))throw Object.assign(Error('Fresh test accounts are only available on test networks.'),{code:'BB_TEST_ACCOUNT_NETWORK'});
   const portal=new ethers.Contract(_getPublicConfig().board.portalAddress,['function depositNonces(address) view returns (uint256)'],window.walletState.ethProvider);
   // Each successful signup advances this durable counter, including gasless
   // payments. Clearing browser storage therefore cannot reuse a funded test account.
   testAccount=(await portal.depositNonces(address)+1n).toString();await guard();
  }
  if(!freshAccount&&saved?.metadata.ethereumAddress===address){raw=saved.wallet;testAccount=saved.metadata.testAccount??'0';}
  else {
   // Verification below proves EOA ownership, including delegated EOAs.
   const message=store.createMessage({...scope,address,testAccount});
   const signature=await signer.signMessage(message);await guard();
   raw=await store.derive({ethers,signature,message,address});await guard();
  }
  const prepared=await _prepareWallet(raw);await guard();
  prepared.ethereumAddress=address;
  await store.save(scope,{secretKey:prepared.secretKey,salt:prepared.salt,address:prepared.address.toString()},{ethereumAddress:address,providerId,...(testAccount==='0'?{}:{testAccount})});await guard();
  _watchRememberedAccount();_sessionChannel?.postMessage({type:'account-changed'});
  _activateWallet(prepared);
 });
}
async function restoreRememberedAccount(){
 return _walletOperation(async()=>{
  if(window.walletState.aztec)return true;
  const scope=_ethereumScope(),generation=_walletGeneration;
  return navigator.locks.request('rolling-chat-account-session:'+scope.origin+':'+scope.chainId,async()=>{
   const saved=await window.BillboardEthereumSession.load(scope);
   if(!saved)return false;
   const prepared=await _prepareWallet(saved.wallet);
   _assertWalletLive();if(generation!==_walletGeneration)throw Error('Wallet context changed.');
   prepared.ethereumAddress=saved.metadata.ethereumAddress;
   _watchRememberedAccount();_activateWallet(prepared);return true;
  });
 });
}
async function endAccountSession(){
  if(_walletBusy||!_canEndSession())throw Object.assign(Error('Operation in progress.'),{code:'BB_OPERATION_BUSY'});
  _walletBusy=true;_updateAccountState();
  try{
    const end=async()=>{if(window.BillboardEthereumSession){const scope=_ethereumScope();await navigator.locks.request('rolling-chat-account-session:'+scope.origin+':'+scope.chainId,()=>window.BillboardEthereumSession.clear(scope));_watchRememberedAccount();_sessionChannel?.postMessage({type:'signed-out'});}_readyFired=false;_walletGeneration++;_bindEthereumProvider(null);window.walletState.invalidated=true;return {reload:true};};
    const address=window.walletState.aztec?.address;
    if(!address)return await end();
    return await navigator.locks.request('billboard-wallet:'+address.toString(),{ifAvailable:true},async lock=>{if(!lock)throw Object.assign(Error('Wallet busy in another tab.'),{code:'BB_OPERATION_BUSY'});return end();});
  }finally{_walletBusy=false;_updateAccountState();}
}
function configureAccount(options={}) {
  _requireEth=options.requireEth!==false;
  _canEndSession=options.canEndSession||(()=>true);
  _onReady=options.onReady||null;if(options.onSetupError)_onSetupError=options.onSetupError;_onAztecLoad=options.onAztecLoad||null;
  _accountNotify=options.onChange||(()=>{});_accountLog=options.onMessage||(()=>{});
}
function _bindEthereumProvider(transport) {
  if(_accountProvider===transport)return;
  for(const [name,handler] of _accountListeners)_accountProvider?.removeListener?.(name,handler);
  _accountListeners=[];_accountProvider=transport;
  if(transport?.on) for(const name of ['accountsChanged','chainChanged','disconnect','connect']) {
    const handler=value=>{
    if(_accountProvider!==transport)return;
    if(window.walletState.ethType!=='browser') {
      // No session exists yet. Selection and network changes are reconciled by
      // the final direct provider reads before activation, not by notifications.
      if(_connectingEth && name==='disconnect')_connectingEth.disconnected=true;
      if(_connectingEth && name==='connect')_connectingEth.disconnected=false;
      return;
    }
    if(name==='connect')return;
    if(name==='accountsChanged' && _firstEthereumAccount(value)===window.walletState.ethAccount?.toLowerCase())return;
    if(name==='chainChanged') {
      try{if(BigInt(value)===BigInt(window.walletState.ethChainId))return;}catch{}
    }
    _invalidateWalletContext({forget:true});
    };
    _accountListeners.push([name,handler]);transport.on(name,handler);
  }
}
let _accountProvider, _accountListeners=[];
/** Account operations return data; rendering, downloads and reloads belong to the caller. */
window.BillboardAccount=Object.freeze({configure:configureAccount,snapshot:accountSnapshot,
  restoreRemembered:restoreRememberedAccount,endSession:endAccountSession,connect:connectEthereumAccount,invalidate:_invalidateWalletContext});
