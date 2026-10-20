# Actual browser public-reader observation

Executed by lead in persistent Playwright node_repl, existing fresh recovered account page `fp`, current source2db3a542. Public account address retained only in memory: `String(window.walletState.aztec.address)` from that page, plus its BigInt decimal representation. The HMAC key was generated in memory with crypto.randomBytes(32); neither raw account identifier nor key is retained in evidence.

Used existing production-repository observer `createRollingPublicReaderObservation` from scripts/testing/rolling-preference-browser.mjs. Attached `page.on('request', listener)` before navigation. Listener selected public origin127.0.0.1:4317 and passed actual request.url(),request.method(),await request.headersArray(),request.postData() into observer.track/observe. Browser-added headers are included by headersArray. This is browser-side observation, not a server-ingress capture.

First capture was invalid because node_repl objects have another realm's Object.prototype; the observer requires same-realm plain or null-prototype data. Preserved four-invalid-request result. Focused boundary only: passed `{url:publicOrigin+'/api/feed?limit=30',method:'GET',headers:[],body:null}` as Object.assign(Object.create(null), data); observe returnedtrue. No application transaction or network request was made by this boundary check. Then used that same null-prototype conversion on actual input/header rows and repeated only four read-only navigations.

```js
const plain=v=>Object.assign(Object.create(null),v);
const observer=createRollingPublicReaderObservation({origin:publicOrigin,key,privateValues:[privateAddress,BigInt(privateAddress).toString()]});
const listener=r=>{if(new URL(r.url()).origin===publicOrigin)observer.track((async()=>observer.observe(plain({url:r.url(),method:r.method(),headers:(await r.headersArray()).map(plain),body:r.postData()})))());};
page.on('request',listener);
for(const view of ['Bookmarks','Following','Notifications','Main board']){
 await page.getByRole('link',{name:view,exact:true}).first().click();
 await page.getByRole('heading',{name:view,exact:true}).waitFor();
 await page.getByText('Loading conversations…',{exact:true}).waitFor({state:'hidden'});
}
page.off('request',listener);await observer.drain();
```

Result: fourvalidrequests, three identical feedrows groupedcount3 and oneboardrow; zero account matches, observererrors, invalid/overflow/pending. Snapshotcontains keyedvalue hashes only. No owned-name-list or privatefilter parameters: observer routeallowlistvalidatedexactquerykeys. Onehuman; does not prove unlinkability, responseprivacy, trustedquery/upstream behaviour or alltransportcoverage. No send/proof/model action in this read-only procedure.
