# Final core/private acceptance — 18 October 2026

Source c07e0fa7; live runtime86adc375 differs only in policy documentation. Native devnet/PXE proofs false. This is a concise record of the executed procedure, not a new harness.

## Public rebuild
Executed with pinned Node24 from rolling-lead-bok. Imported createRollingPublicIndexFromConfig/startRollingPublicServer from scripts/rolling-public-server.mjs, node:assert/strict and fs/promises. Read current public config, mkdtemp `/private/tmp/rolling-final-core-rebuild-`, use only its `/cache` for deletion. No live core cache, chain or archive was deleted.

The exact comparison logic was:
```js
const paths=['feed?limit=20','home?limit=20','board?id=0','directory','thread?root=4729438060944817773885932501194730891419773741996909741267936884292185979896'];
const normalize=x=>Array.isArray(x)?x.map(normalize):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).filter(([k])=>k!=='revision').map(([k,v])=>[k,normalize(v)])):x;
async function views(url){const out={};for(const path of paths){const r=await fetch(url+'/api/'+path);assert.equal(r.status,200,path);out[path]=normalize(await r.json());}return out;}
const expected=await views('http://127.0.0.1:4317');
async function check(label){const {index}=await createRollingPublicIndexFromConfig({...config,cacheDirectory,port:0});const server=await startRollingPublicServer({index,pollMs:30000});try{assert.deepEqual(await views(server.url),expected,label);return {label,status:'pass',checkpoint:index.status().checkpoint};}finally{await server.close();}}
const results=[];results.push(await check('empty-cache rebuild'));
await rm(cacheDirectory,{recursive:true});
results.push(await check('deleted-core-cache rebuild'));results.push(await check('retained-cache reopen'));
```
The production HTTP handler owns state-driven catch-up. No acceptance sleep/poll loop. Cache generation revision deliberately excluded; all other response contents compared. Raw result retained at `/private/tmp/rolling-final-core-rebuild-nMSoKc/result.json` and copied here. Raw HTTP bodies were not separately retained; comparisons executed in-process and exited0.

## Fresh browser
The lead used the persistent Playwright session. Existing account submitted bookmark, mark-thread-read and follow-board once each with UI fee confirmation. Exported encrypted recovery. `fresh=await rb.newContext(); fp=await fresh.newPage()` created a profile with no old IndexedDB/cookies/storage. Opened4317, Unlock, Recovery password/file and Import recovery. Clicked Private views then the explicit Recover private views button. Observed Refresh private views and recovered notice. The initial wait for Stop private recovery to disappear was invalid: the button remains disabled at idle; no operation was retried.

Waited for each actual feed heading plus loaded post/control: Bookmarks contained the original post and Unbookmark, Following contained that same main-board post; screenshot retained. Notifications was empty, not used as proof of marker restoration.

Decrypted the disposable backup in browser memory and returned only Object.keys(payload): schemaVersion,wallet,claims,journals. No preference cache was exported; no secret value was logged.

Then queried the already-open production session without creating another wallet:
```js
const runtime=await (await import('/wallet/runtime.mjs')).loadRollingWalletRuntime();
const session=await runtime.createSession();
return await session.application.readColdPreferences({signal:new AbortController().signal});
```
Result saved in restored-preferences.json: complete revision3, exact bookmark/followedBoard0 and read-marker throughBlock11/canonical hash, markersChecked1/markersTotal1. This reads the same recovered account. No restore transaction was sent.

Bok remained stopped throughout these procedures. Restarted afterwards on configured8797 using corrected board deployment anchor; health returned ready,active0,lastFailure:null. Simulated reorg/authentic-wallet/real-proof acceptance remain separate.

Independent review correctly noted top-level fields alone cannot exclude preference caches: journals can contain them. Lead then authenticated/decrypted every actual exported descriptor with journalRecoveryIdentity/decryptJournalDescriptor, returning domain names only. backup-domain-summary.json records ETH journal, workflow, aggregate funding and L2 journal; neither preference domain was present. No cache was removed or source altered.
