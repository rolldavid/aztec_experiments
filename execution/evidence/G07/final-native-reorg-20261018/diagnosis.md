# Focused real reorg result

Candidate343d5220e700c5ecfc60ce72a1ff6949e2a0ce20. One actual fork completed in the corrected setup: L1height40/depth2, retained checkpoint3, suffixcheckpoint5, finalized0. Sameheight replacement changedtip and preserved retainedancestor. Native archiver/world-state canonical unwind and productionSQLite public policyv2→v1 rollback passed.

Same live actor cold-reader failed twice afterfork; coldreopen was not reached. Product reader deliberately discards original cause, so the original underlying exception is not recoverable from this log.

Concrete source disconnect to reproduce: installed L2BlockStream.areBlockHashesEqualAt asks for oldtip5 while proposedtip is3. For absent heights above proposed it requires undefined to walk backward. PXE blockStreamSourceFromAztecNode lifts that to getBlock({number:5}). Production private-query historical canonicalRecord throws unavailable if no header or number above ready.latestBlockNumber; handler returns503. BlockSynchronizer treats any source failure as failedsync and does not acknowledge pruning. Existing actual synchronizer test uses a native double returningundefined at removedheight, so it bypasses this gateway behavior.

Potential narrow repair boundary: canonical absence for public header/body selectors strictly above a freshly validated proposed/worldtip, with fresh final tip/identity/canonical recheck; keep unknown hash, missing in-range blocks and all state/witness selectors failclosed. Must establish with actual SDK/publicgateway focused test before anotherfork. No product reader or gateway source edited.

Cleanup closed actor,index,service,wallet,node andAnvil. Encrypted private reader files retained in result.directory (143360bytes total); actor IndexedDB used existing CLI fake-indexeddb in memory, not a durable browser profile. No keys or private preference contents written to evidence. No coldreopen/browsers/realproof/orphanedpost acceptance claimed.

## Resolved on811edc315517ca8d71d774610af6cf5e2f4f64e0

ActualSDKBlockStream+HTTPgateway test reproduced5→3stuck at5 beforefix.40focusedhistoricalgatewaycases passed afterfix. One affected realreorg rerun passed publicsame-store, privatesame-store, publiccoldreopen and privatecoldreopen against exactretainednonemptybaseline. Nativecheckpoint5→3; L1depth2/sameheight40, retainedancestorunchanged; zero proofjobs. Start16:01:58.517Z; passed16:02:34.193Z (~35.7s). Cleanupcomplete; no assigned listeners remain; privateownedstate139264bytes. Priorfailure evidence preserved in before-gateway-repair.json/log; firstsetup failure preserved separately. Sourcehashes refreshed afterfinalcoherentcommit.
