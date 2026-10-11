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
const VERSION='6.0.0-rc.1';
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
  "noir-protocol-circuits-types/artifacts/hiding_kernel_to_public.json": "61b84f64ab897cb33415e6c848871f60be64c6d6f5771daaeab50a584a786273",
  "noir-protocol-circuits-types/artifacts/hiding_kernel_to_rollup.json": "f9b16567cf6c5cda6fa34dfdb2fbb678bae8e8dc53dc4cc414b106d1885d9f95",
  "noir-protocol-circuits-types/artifacts/private_kernel_init.json": "3c45372ecba74baf9470fcad19e7bfc2d241989d7b5bd850cd06a8c3bf5769f1",
  "noir-protocol-circuits-types/artifacts/private_kernel_init_2.json": "134a29eb6175905c75797911581e9820b903ccd6c3d4d1e0005d561971db8f78",
  "noir-protocol-circuits-types/artifacts/private_kernel_init_3.json": "844b2d641e251eccd57689bb73c7e4eafda4e0db46787fccccf50d4e7acfcead",
  "noir-protocol-circuits-types/artifacts/private_kernel_init_4.json": "462a716143d879ef50283c05e16fed4ee7a238dce711f0893ad14f87eb266377",
  "noir-protocol-circuits-types/artifacts/private_kernel_init_5.json": "71bb69277f7986a3d5d0baedaae05fcab5cfc3c7b869d3bc458cdb6b7b1e706c",
  "noir-protocol-circuits-types/artifacts/private_kernel_init_simulated.json": "01d58a5ce0be60aaa2a4c7f4c693f2caf573025d472622741f0de1d05ad00093",
  "noir-protocol-circuits-types/artifacts/private_kernel_inner.json": "9bb9337425405b76e179aa39a6996ce6144a61e4a3c08b86ee30f3f5e86fc4ee",
  "noir-protocol-circuits-types/artifacts/private_kernel_inner_2.json": "263fe6135fd3d760be5f016eb6ea884d0fc6a3ff8d6c74c6bf56a3a6535d5638",
  "noir-protocol-circuits-types/artifacts/private_kernel_inner_3.json": "1e18cece34af3d60b2c09a0275d593203fb65dedf101cfa34cdb3a8f46abf78c",
  "noir-protocol-circuits-types/artifacts/private_kernel_inner_4.json": "eb4c1e594800c7cbc362689a391a1a7223756ee095dcab14b1962933c1533955",
  "noir-protocol-circuits-types/artifacts/private_kernel_inner_5.json": "179efad2a0b2019dd74a2672bc809bb594a1b9e6616ffb714130a42adb151a51",
  "noir-protocol-circuits-types/artifacts/private_kernel_inner_simulated.json": "d30c17e0f74c77da253253f396a81e0174c31dd0950fc5226599d88984c01c27",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_0_0_0_0_0_64_0_0_0.json": "9b5db99839ffa3b682b1151e052a6e66dc64b5563a406a94da00973faa73a4c0",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_0_0_0_0_64_0_0_0_0.json": "ffb484dc05339dd2b058d3288a62acd953410fc04a7558f6bcb178fcd2d92fa9",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_0_0_0_64_0_0_0_0_0.json": "748a1649902371308b7fac0b131e29a1129a75e9d9686b44791af3b3704c72d2",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_0_0_64_0_0_0_0_0_0.json": "2ec0aa3dcaae8c426cd8350399e184da3a1ccc9e7738beda6700d45ed604790e",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_0_64_0_0_0_0_0_0_0.json": "699641c849d8aa80525225373b022aa8a82c11e9afa7a07484fe2f664f5e190f",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_32_32_32_32_16_16_0_0_0.json": "1ea33c14e6ca7136090f480b46db99331415dc20e0d54155f3a57766aec5cae6",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_4_4_4_4_4_4_0_0_0.json": "6f172ca2f3d3aff13db1105b50e2f997a6021cc9f9e6a8136325189cc250d5f6",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_64_0_0_0_0_0_0_0_0.json": "bda7a89cac5e58bcca89b58a75e0e142cb4ec2dc143bad5825bd6058443ae42a",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_simulated_0_0_0_0_0_64_0_0_0.json": "c3b2410fd4443318942ce4106decae512282b48d6df38881926e4ec4d26dca55",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_simulated_0_0_0_0_64_0_0_0_0.json": "3ec2778b9592d4be113e76ac07e086c9e3abdf7c1ce5af076cd054f706097358",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_simulated_0_0_0_64_0_0_0_0_0.json": "abbf5e4ee7d6049fa0ac3c310fd10eff31b203c5aea4f6d103357c86d98c5619",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_simulated_0_0_64_0_0_0_0_0_0.json": "2ce82b60fc2b0c38986456d2daf670191cac3a3af10b8ef728833e3cbc137445",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_simulated_0_64_0_0_0_0_0_0_0.json": "d6afbdc7099995b6246cf11505f77e99058ec69cf5979ab074c6fe6ea53b25ec",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_simulated_32_32_32_32_16_16_0_0_0.json": "73b07c33edd60001436cb643b545171d1fd0f75e0eeada1db2335f75182062d4",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_simulated_4_4_4_4_4_4_0_0_0.json": "481e8aa5555fda6eba6fe9dbb92e3b84327adbec68a80fa398c4781c2f13bf0b",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_simulated_64_0_0_0_0_0_0_0_0.json": "58da2ef5d6b634391acc145054aaa0c75a24dd28c1098f3fc819699b68cecafa",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail.json": "1eb915e50d1da4aaa5a39250865580e0f11988c53ee23f5bcbc5ce2703a42c0f",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_0_8_0_8_4_0_4_16_8.json": "8f825b77fd725cbd5d685ef367b42f42d5121475001a609b1a25a3e2c132150e",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_16_16_16_16_16_16_16_16_16.json": "353d9f31ec2953bd9dc99750cb45d6d05979e61677c84aa6d2d9a5c2e1ce9695",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_32_32_32_32_32_32_32_32_32.json": "146510332877219dc302a66fa596b72b9dad9c81e2238d55b87e5319732b9892",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_4_4_4_4_4_4_4_4_4.json": "ffb5774a729beba9614ff640656cdbd419146de554fd30ab5f648a5df3ad134b",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_8_8_8_8_8_8_8_8_8.json": "d6f705b94513bf4b9ca4dc04c6bc5b221f26b52103da28cfcebcff7208431663",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_simulated.json": "3c04872535a05913d6a51eb4f965a64acb42a6193df3dbf2fe6a03122433389a",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_simulated_0_8_0_8_4_0_4_16_8.json": "dbd79c6eaac041de4c4664198175b8f5f6d8f83c8e94327497ab91bb6edf9f2c",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_simulated_16_16_16_16_16_16_16_16_16.json": "37b3785d88f42101fb793e143a2a6a1a922bf49e6fa691297150b93786c68787",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_simulated_32_32_32_32_32_32_32_32_32.json": "c6c6ad43a209f5473e41f1ed4ffcd3cd49890d53c1e9368e31fd631227d588ac",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_simulated_4_4_4_4_4_4_4_4_4.json": "f1565468d247a9989749d01bdb0bd5dcd72afd007d9102437342ebb05ae093bd",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_simulated_8_8_8_8_8_8_8_8_8.json": "7b27375178fbbd0b41e324fc960cd429f1298efe96d0c2e03986eec5d00bfa4c",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_to_public.json": "db9fcd456c60eaf1f438fd825feccbe6c72ef2247fce9c174d3c89242168a30b",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_to_public_0_8_0_8_4_0_4_16_8.json": "75db240bd97f2b21a026e50540365ecf87be7d9e296f0cafd18deffa4ede5025",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_to_public_16_16_16_16_16_16_16_16_16.json": "f2e7221a76c9e794d361bd809547eea87d9ba02666115644aebcdba346f19edc",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_to_public_32_32_32_32_32_32_32_32_32.json": "756a98b951deababc0ffb5471a8659bf4c1c9a29d9a15df4ecf1ea5c5b073e13",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_to_public_4_4_4_4_4_4_4_4_4.json": "d1d50b35ee2e243bbd7588645434f526e30f65b095436ccf97dea77cf1a3e6f7",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_to_public_8_8_8_8_8_8_8_8_8.json": "151d8901a4c9b4c7144dba7ec45a8df4303de005938ddf2a5684aa32bf39fe23",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_to_public_simulated.json": "351263861ac2d428bf0b15094dbed11c5372e1a5cfb6d9cf831253a313463fb0",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_to_public_simulated_0_8_0_8_4_0_4_16_8.json": "da935393da2500490be86ea8e4398fa106b035754ec39719827290024b1c11ab",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_to_public_simulated_16_16_16_16_16_16_16_16_16.json": "ff40802f76b12982bc4e7902941bbaa2598b8f92e127391e45ccdf6143a9a118",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_to_public_simulated_32_32_32_32_32_32_32_32_32.json": "dc53c6f267e7de3dc2a92379e52d52b55ad660b31548d1f78521deaf47f1c77f",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_to_public_simulated_4_4_4_4_4_4_4_4_4.json": "f4854ff653b9ca15235cfb6db9c9b70f3817d6f7822a5545d644c2bef6e145b1",
  "noir-protocol-circuits-types/artifacts/private_kernel_reset_tail_to_public_simulated_8_8_8_8_8_8_8_8_8.json": "9185d2e1966d46cca05f5dc133df5d57fe25f58dbf431d30c2f600820da5d2c9",
  "protocol-contracts/artifacts/ContractClassRegistry.json": "9291bfe9f4b69e0759d0b4716fccb5ea46f19eb3ffaaf89d3b2dcb0a3668d395",
  "protocol-contracts/artifacts/ContractInstanceRegistry.json": "ffad591d82069a09f0a452ab7d24b2ea6c6375ca212411285bf5d99af8a9086c",
  "protocol-contracts/artifacts/FeeJuice.json": "bdd946bbec6dccef2ede601363c907ed10efd61028ddccdfd32ba663aa0a28f1",
  "standard-contracts/artifacts/AuthRegistry.json": "90460098eba7bb81076296db7cd643ba1a730bcd220d08b1591eab57558702dc",
  "standard-contracts/artifacts/HandshakeRegistry.json": "9ab37c0fb9b7ba564783b0dbe184cbe2082a4c32668998e93c45137b04428b08",
  "standard-contracts/artifacts/MultiCallEntrypoint.json": "f3894e2175cfefbf91f61f987cdbf0865e0f296cd49eb2c10abba125c5fd018a"
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
