// Only the three native artifacts observed on first and repeat ordinary posts.
// Larger reset variants remain native lazy loads: note fragmentation may select
// another shape. This is an asset optimization, never a witness-shape override.
export const POSTING_KERNEL_ARTIFACTS=Object.freeze([
 'PrivateKernelInit3Artifact',
 'PrivateKernelResetTailToPublicArtifact_4_4_4_4_4_4_4_4_4',
 'PrivateKernelResetTailToPublicArtifact_0_8_0_8_4_0_4_16_8',
]);
export function createPostingKernelPreload(provider){
 let started;
 return function preloadPostingKernels(){
  if(!started){
   // All downloads start together and settle independently. Retain no artifact
   // values: the native module loader already owns their immutable cache.
   started=Promise.allSettled(POSTING_KERNEL_ARTIFACTS.map(name=>
    Promise.resolve().then(()=>provider.getClientCircuitArtifactByName(name)))).then(()=>undefined);
  }
  return started;
 };
}
