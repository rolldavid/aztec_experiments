// Native account derivation retained only inside one authenticated worker realm.
// The empty handle can cross trusted modules; structured cloning cannot preserve
// its WeakMap provenance or expose the private keys stored behind it.
const preparations = new WeakMap();
const invalid = () => Object.assign(Error('Account preparation does not match this wallet.'), {code:'BB_ACCOUNT_RECORD_INVALID'});

export async function prepareRollingAccount({sdk, secretKey, salt}) {
  const modulus = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  if ([secretKey, salt].some(value => typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value) || BigInt(value) >= modulus) || BigInt(secretKey) === 0n) throw invalid();
  const secret = sdk.Fr.fromHexString(secretKey), nativeSalt = new sdk.Fr(BigInt(salt));
  const accountContract = new sdk.SchnorrInitializerlessAccountContract(sdk.deriveSigningKey(secret));
  const keys = await sdk.deriveKeys(secret), artifact = await accountContract.getContractArtifact();
  const instance = await sdk.getContractInstanceFromInstantiationParams(artifact, {
    constructorArtifact:undefined, constructorArgs:undefined, salt:nativeSalt,
    publicKeys:keys.publicKeys, immutablesHash:await accountContract.getImmutablesHash(),
  });
  const identity = Object.freeze({address:instance.address.toString(), partialAddress:(await sdk.computePartialAddress(instance)).toString()});
  const preparation = Object.freeze({});
  preparations.set(preparation, Object.freeze({sdk, secretKey, salt, identity, secret, nativeSalt, accountContract, keys, artifact, instance}));
  return Object.freeze({preparation, identity});
}

export function consumeRollingAccountPreparation(preparation, {sdk, account}) {
  const ready = preparations.get(preparation);
  if (!ready || ready.sdk !== sdk || ready.secretKey !== account?.secretKey || ready.salt !== String(account?.salt) || ready.identity.address !== String(account?.address)) throw invalid();
  return ready;
}
