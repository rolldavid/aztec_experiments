// TEST ONLY: native Node adapter for the pinned browser SDK's attribute-less
// JSON imports. No source/byte transformation, alternative provider, or network.
// Node24 API: https://nodejs.org/docs/latest-v24.x/api/module.html#moduleregisterhooksoptions
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import {pins} from '../toolchain.mjs';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=()=>Object.assign(Error('Pinned native artifact adapter configuration mismatch'),{code:'ROLLING_NATIVE_ARTIFACTS_CONFIG'});
const VERSION='6.0.0';
// Exact installed official loader maps. Updating pins requires source review,
// complete map enumeration and all-provider byte equality tests again.
const LOADERS=Object.freeze({
  "protocol-contracts/dest/fee-juice/lazy.js": "49ec7e07e98e608aa359af6ded3a02543637ef348af610d563049cd59b85c665",
  "protocol-contracts/dest/class-registry/lazy.js": "256f14b4451f3f7de9d55512409ce87c40ca41ae490afc234a4a2fc7ca47fb15",
  "protocol-contracts/dest/instance-registry/lazy.js": "fef787ccb08fc7bf02c73c9eb9e5b26fde1a7cdf401aaca8e4580ee0433f3462",
  "standard-contracts/dest/auth-registry/lazy.js": "2298afe1df16bc4a9e1153d6af50819662d123916d012190b0dd6077bb25ffb7",
  "standard-contracts/dest/handshake-registry/lazy.js": "4ad7a29776282399da32556c3f85425d9fc91c48276bccb64963c98412899314",
  "standard-contracts/dest/multi-call-entrypoint/lazy.js": "aca9517c0a334263873f976c4bd55069259701fa30982ec9e65e96549a81f00d",
  "noir-protocol-circuits-types/dest/client_artifacts_helper.js": "7dd23be379bec54bdd7ba4de79b31f898457e9c7a88227ec2d559d081a13decd"
});
const ARTIFACTS=Object.freeze({
  "noir-protocol-circuits-types/artifacts/hiding_kernel_to_public.json": "33ae15697b81d6e1d3ac725009dd2c4c8f5b1e02a9943e33ecbcc01361fa0de0",
  "noir-protocol-circuits-types/artifacts/hiding_kernel_to_rollup.json": "ffb6fb18baa2a862868238ae2952baf93a002060c4ee602a029853df31708000",
  "noir-protocol-circuits-types/artifacts/private_kernel_init.json": "baec1a5b416c62dd6b8c8d827ea0b7cdaaa475e46692e61b8e1a4bdf6f51cb36",
  "noir-protocol-circuits-types/artifacts/private_kernel_init_2.json": "063ee50c9be4c0ed6d5fbb54040c61ce0cf10307f98aaf5a39db1afd56d4e136",
  "noir-protocol-circuits-types/artifacts/private_kernel_init_3.json": "b9868ff912533b9dfd5a8abb90fcbb843388015e24c3263652d058648a2a5bdd",
  "noir-protocol-circuits-types/artifacts/private_kernel_init_4.json": "8e9bb2fed0ffa58a3abc9d3fcf879fdc5f1bda1e7e0918a7f0e750895bc1d2d6",
  "noir-protocol-circuits-types/artifacts/private_kernel_init_5.json": "9dca90f20a65e27ea18e461c7f48b7f1175bdd637bec6ae74362cfbc78c0d5ed",
  "noir-protocol-circuits-types/artifacts/private_kernel_init_simulated.json": "a2576412890467eef30e5d6db79ef4c1b2d7036bdb0f244de079cbb78510ffc1",
  "noir-protocol-circuits-types/artifacts/private_kernel_inner.json": "d84b923be5efd6ed460167540073d663f290ee3cde3bdec80e2f6db3c81e5d8d",
  "noir-protocol-circuits-types/artifacts/private_kernel_inner_2.json": "ddb7e64d0fc692bc10070d119afbf0ef6c4fd6ed58199a4c7255fec2046f0a4f",
  "noir-protocol-circuits-types/artifacts/private_kernel_inner_3.json": "8049662f64ec0165bd2129a84e2786252f8b61fdd08edf877551f1890eda89b8",
  "noir-protocol-circuits-types/artifacts/private_kernel_inner_4.json": "8daa3d2aa1d218aea2895e5f3007322571f121e232b10334c779d869e7e943d6",
  "noir-protocol-circuits-types/artifacts/private_kernel_inner_5.json": "1bc11484eccf1055a2c594a7b5984f00052fb31e1f9184feac4f4c9d2fb1236e",
  "noir-protocol-circuits-types/artifacts/private_kernel_inner_simulated.json": "536cb73c841c5bce0fa45bad86e7ae3a62f70117de6ccfb4f21da9f0b8bbb540",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_0_0_0_0_0_64_0_0_0.json": "7ee0bda07dd640ba4e10eb0f80c3a635535e949f9383a141746294a2d59f14ff",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_0_0_0_0_64_0_0_0_0.json": "90b47a22a5707ff5924a5a629e6df1e2a05372b5dea7dfcadd03db875d4d74a6",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_0_0_0_64_0_0_0_0_0.json": "ed395c9fd2ec6b21b1b2982956d1248baada6abcb123458ec3c02c486f0d04cc",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_0_0_64_0_0_0_0_0_0.json": "6e406e0d46e7e02d05595ae2e0ed53824cb6e1239f3aac5b6e12a844f9ca0158",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_0_64_0_0_0_0_0_0_0.json": "d5177175d6dc360f88f5417ebd6f5e9e064f412059a73e417d50f2a51d664356",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_32_32_32_32_16_16_0_0_0.json": "d9663bcdfd3011904fe096f31e0c73bb38d6bad924bb82179b9bdef7d941cff6",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_4_4_4_4_4_4_0_0_0.json": "9132eb77243c7ab3e1eaaebbc45b36e8047ed9678e8a8ebf1fa220a0e46467dd",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_64_0_0_0_0_0_0_0_0.json": "11064639ac6511881bb00656db4b72b03d477aff2a2a682ff72a9260b405d660",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_simulated_0_0_0_0_0_64_0_0_0.json": "f278b10ff5dc1e90b5a4b4a437c085a2b854178c03809b870c326581c31facae",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_simulated_0_0_0_0_64_0_0_0_0.json": "90243dffc2d01ca959c0980acb0455e2108049abd38ef860c71677565cf965e0",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_simulated_0_0_0_64_0_0_0_0_0.json": "33be77f8e4b9f5fb8933e4ae0d113dbd91fa4d1eef0362f7f4f167bae28cdcf8",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_simulated_0_0_64_0_0_0_0_0_0.json": "bd0c93d64cdc65378d61fd867da3fb09afc529de27bd269c4c215fcf2015759c",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_simulated_0_64_0_0_0_0_0_0_0.json": "cd21ec370045e4ef246373a6a3cd5c6a2b3b25a3a6e48dc108ccae71735476de",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_simulated_32_32_32_32_16_16_0_0_0.json": "210e7d441a40582abbd269b667ee8fce5ea2d170bfabb017d5174e3005a05046",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_simulated_4_4_4_4_4_4_0_0_0.json": "58b9dc1d77cecae6bf29b969aa845fbeff84cc7beffd083852e0cfda6add478f",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_simulated_64_0_0_0_0_0_0_0_0.json": "b712f691edca6cf03eb09c4f98ac043498feae0c94def85c51413e12795f4bc1",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail.json": "69a567a48adc4c3b7eefb0a4a3f9e61a58031ccc3dbdea132600860f18a9d744",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_0_8_0_8_4_0_4_16_8.json": "12211bb62a8ceaa49a1c50b74b2b2da2fb99f79bcd6f83094e28b1b076aa17db",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_16_16_16_16_16_16_16_16_16.json": "0937c3d2e5f2bc761eb3a838a766b391219321e21e7455343edffe151ba7ec2a",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_32_32_32_32_32_32_32_32_32.json": "d6af7a99d7746fd85e171c5cd92fd9f69f3a5a3444e5c56215f2cd2a8c674dde",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_4_4_4_4_4_4_4_4_4.json": "b21075f9054ad6426b006b879682f8cfdcce1893e0cc4bd0a309dd4045dfe9d1",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_8_8_8_8_8_8_8_8_8.json": "a9aa84bbf3f224d7faa741d25bcc40f85bb46bd78b33311a9845ca5f0dc4d337",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_simulated.json": "ef1d7546a33ab54e9a680f3c9ce44379086c9942bcac924d5f05a9d0943b3bcb",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_simulated_0_8_0_8_4_0_4_16_8.json": "2138ff24044d14c713baf0547c4ce389ca5c9ae093328e60db12e84da069df28",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_simulated_16_16_16_16_16_16_16_16_16.json": "f115037451f5b51d055cb090a76911fc3554bd2488bda236f20e222f2910ba22",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_simulated_32_32_32_32_32_32_32_32_32.json": "6348cc06b90a8a5a0d93e4f45ef4cd225856d233209d9b08a0106c60cc29cdb0",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_simulated_4_4_4_4_4_4_4_4_4.json": "e0bbb58998aa97fad3d857552c362fc80714192024cc45df26de7c01abb6498d",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_simulated_8_8_8_8_8_8_8_8_8.json": "552c05fef85d8cda3f3910e60587a070617cec990e49a04ae448b5b41c3cf305",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_to_public.json": "f318de8a6714b378474b45bcadd912bb9268f31447f010fe8aa5abec00d05b68",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_to_public_0_8_0_8_4_0_4_16_8.json": "cdce2f3630a8a23e71ef5a9c5c1bef9cb6edff547eb4436cb8cf7d6739d54d67",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_to_public_16_16_16_16_16_16_16_16_16.json": "abcdd103365ce77b2ed9f8a7d12a26078fdff8e8c4cccbb9ed43bc69e5764840",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_to_public_32_32_32_32_32_32_32_32_32.json": "7cdb3c29ad2c54cd3d8c7b75abeca4eb0f8c4866c050f149787f78cb18cf680c",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_to_public_4_4_4_4_4_4_4_4_4.json": "88a365a46a1fea975680e4e4e4a3ceef8e3dff6603e87ee609c3557109066c6a",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_to_public_8_8_8_8_8_8_8_8_8.json": "6580e8940f9dacc9c8f73fa55edc15b34861c4dc6c6e7721db1f20ac7b29c073",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_to_public_simulated.json": "11bb0791e0fbd5744e0a68023d8b8859b62defeac4bf153c4686db243d11d45d",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_to_public_simulated_0_8_0_8_4_0_4_16_8.json": "7c4d1bd33a0c59dd5eab6e7fef5291adeaa75aaf85e2cd7e5ddfe4c551434213",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_to_public_simulated_16_16_16_16_16_16_16_16_16.json": "0779c2983bb10d0deab231e2d8e9ff475f1eb8fd8e0a50d6f91eb60c534cbad8",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_to_public_simulated_32_32_32_32_32_32_32_32_32.json": "5b032e632955ff98e25002cd820205ced29f2f702aa5f57a83e1a6046ce24a31",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_to_public_simulated_4_4_4_4_4_4_4_4_4.json": "d50cc62a9e95ab8809a46f5d2a9d1fdc29c0adf59c618ff6c7f360d8335c755c",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_to_public_simulated_8_8_8_8_8_8_8_8_8.json": "fbc40b17b9476e3f5e718c1dadeb7b30bd03a2c6575a586e7d61de32adb07665",
  "protocol-contracts/artifacts/ContractClassRegistry.json": "727770b23b0c3077a2072ee365df5d2b3a8ea176c141bf6096ebd827ce394411",
  "protocol-contracts/artifacts/ContractInstanceRegistry.json": "059e7dd2cacb4cd4d37b68e21de009d94ead33c0bd9b47bb0b9b4ee9fdec9979",
  "protocol-contracts/artifacts/FeeJuice.json": "0523d80ec5f412e4a68484caaa2c75c08d454f8f8e5cdb44bf88fd0111ecd4dd",
  "standard-contracts/artifacts/AuthRegistry.json": "4ae34365cc38472c1b96c111c205dc27431b0ebaafae4aeb62009fd34bda7652",
  "standard-contracts/artifacts/HandshakeRegistry.json": "a07ac7abb2546dbe1a30798787dee022610b18071068da407335f6fd04a4880c",
  "standard-contracts/artifacts/MultiCallEntrypoint.json": "01f5073987a3a5df3fd6c5c8614ba503dcf89112996d2d4005487ec6a80f509a"
});

const ROOTS=Object.freeze({
  'protocol-contracts':path.resolve(path.dirname(fileURLToPath(import.meta.resolve('@aztec-labs/protocol-contracts/providers/lazy'))),'../..'),
  'standard-contracts':path.resolve(path.dirname(fileURLToPath(import.meta.resolve('@aztec-labs/standard-contracts/auth-registry/lazy'))),'../..'),
  'noir-protocol-circuits-types':path.resolve(path.dirname(fileURLToPath(import.meta.resolve('@aztec-labs/noir-protocol-circuits-types/client/lazy'))),'../../..'),
});
const local=name=>{const [pkg,...parts]=name.split('/');assert(ROOTS[pkg]);return path.join(ROOTS[pkg],...parts);};
let active=false;
export function installRollingNativeArtifacts() {
  if(active||typeof window!=='undefined'||process.versions.node!==pins.node||!pins.node.startsWith('24.'))throw fail();
  const inputs={},urls=new Map(),actualArtifacts=new Set();
  // Check package identity, exact map contents, path confinement and artifact bytes
  // BEFORE registering a hook. A package update cannot widen the adaptation.
  for(const [pkg,root] of Object.entries(ROOTS)){
    const bytes=fs.readFileSync(path.join(root,'package.json')),metadata=JSON.parse(bytes);
    if(metadata.name!=='@aztec-labs/'+pkg||metadata.version!==VERSION)throw fail();
    inputs['node_modules/@aztec-labs/'+pkg+'/package.json']=digest(bytes);
  }
  for(const [name,expected] of Object.entries(LOADERS)){
    const filename=local(name),bytes=fs.readFileSync(filename);
    if(digest(bytes)!==expected)throw fail();inputs['node_modules/@aztec-labs/'+name]=expected;
    const pkg=name.split('/')[0],root=ROOTS[pkg];
    const targets=[...bytes.toString('utf8').matchAll(/import\((['"])([^'"]+\.json)\1\)/g)];
    if(targets.length===0)throw fail();
    for(const [, ,target] of targets){
      if(!/^\.\.\/(?:\.\.\/)?artifacts\/[A-Za-z0-9_]+\.json$/.test(target))throw fail();
      const filename=path.resolve(path.dirname(local(name)),target);
      const relative=pkg+'/'+path.relative(root,filename).split(path.sep).join('/');
      if(!Object.hasOwn(ARTIFACTS,relative)||fs.realpathSync(filename)!==filename)throw fail();
      actualArtifacts.add(relative);
    }
  }
  if(actualArtifacts.size!==Object.keys(ARTIFACTS).length)throw fail();
  for(const name of actualArtifacts){
    const expected=ARTIFACTS[name],filename=local(name);
    if(digest(fs.readFileSync(filename))!==expected)throw fail();
    inputs['node_modules/@aztec-labs/'+name]=expected;urls.set(pathToFileURL(filename).href,expected);
  }
  let adaptedLoads=0,closed=false;
  const hook=registerHooks({load(url,context,nextLoad){
    const expected=urls.get(url);
    if(!expected)return nextLoad(url,context);
    // Never reinterpret a format, explicit type, unsupported attribute or URL.
    // Preserve the default loader's exact result/error, checking bytes it loaded.
    const missing=context.format==='json'&&Object.keys(context.importAttributes).length===0;
    const result=nextLoad(url,missing?{...context,importAttributes:{type:'json'}}:context);
    if(digest(result.source)!==expected)throw fail();
    if(missing)adaptedLoads++;
    return result;
  }});
  active=true;
  const verify=()=>{
    for(const [name,expected] of Object.entries(inputs)){
      if(digest(fs.readFileSync(local(name.slice('node_modules/@aztec-labs/'.length))))!==expected)throw fail();
    }
  };
  return Object.freeze({
    observation:()=>({adapter:'Node24 pinned JSON import type only; CLI test fixture',nodeVersion:pins.node,packageVersion:VERSION,
      artifactCount:urls.size,adaptedLoads,closed,inputs:{...inputs}}),
    verify,
    close(){if(closed)return;try{verify();}finally{hook.deregister();closed=true;active=false;}},
  });
}
