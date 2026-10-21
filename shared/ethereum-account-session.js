// Ethereum signatures derive the account locally. Remembered keys never enter
// localStorage: IndexedDB clones a nonextractable key beside authenticated ciphertext.
(function (root) {
  'use strict';

  const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  const DATABASE = 'rolling-ethereum-account-session';
  const STORE = 'sessions';
  const VERSION = 1;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const error = code => Object.assign(new Error('The remembered account could not be opened.'), { code: 'BB_ETHEREUM_SESSION_' + code });
  const check = (value, code = 'INVALID') => { if (!value) throw error(code); };

  function ethereumAddress(value) {
    check(typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value) && BigInt(value) !== 0n);
    return value.toLowerCase();
  }

  function scopeValue(value) {
    check(value && typeof value.origin === 'string' && typeof value.chainId === 'string');
    let url;
    try { url = new URL(value.origin); } catch { throw error('INVALID'); }
    check(['https:', 'http:'].includes(url.protocol) && url.origin === value.origin);
    check(/^[1-9][0-9]{0,19}$/.test(value.chainId) && BigInt(value.chainId) < 1n << 64n);
    return { origin: url.origin, chainId: value.chainId };
  }

  function createMessage({ origin, chainId, address, testAccount = "0" }) {
    testAccount = testAccountValue(testAccount);
    check(testAccount === "0" || ["11155111", "31337"].includes(chainId));
    const scope = scopeValue({ origin, chainId });
    return 'Create or open your private Rolling Chat account.\n\n' +
      'Only sign this request on ' + scope.origin + '.\n' +
      'This signature is your account key; do not share it.\n\n' +
      'Ethereum account: ' + ethereumAddress(address) + '\n' +
      'Ethereum chain: ' + scope.chainId + '\n' +
      'Rolling Chat account version: 1' + (testAccount === '0' ? '' : '\nTest account: ' + testAccount);
  }

  function walletValue(value) {
    check(value && Object.keys(value).sort().join() === 'address,salt,secretKey');
    check(typeof value.address === 'string' && /^0x[0-9a-f]{64}$/.test(value.address));
    check(typeof value.secretKey === 'string' && /^0x[0-9a-f]{64}$/.test(value.secretKey));
    check(BigInt(value.address) > 0n && BigInt(value.address) < FIELD && BigInt(value.secretKey) > 0n && BigInt(value.secretKey) < FIELD);
    check(typeof value.salt === 'string' && /^0x[0-9a-f]{64}$/.test(value.salt) && BigInt(value.salt) < FIELD);
    return { address: value.address, secretKey: value.secretKey, salt: value.salt };
  }

  function testAccountValue(value) {
    check(typeof value === 'string' && /^(0|[1-9][0-9]{0,76})$/.test(value) && BigInt(value) < 1n << 256n);
    return value;
  }

  function metadataValue(value) {
    check(value && ['ethereumAddress,providerId', 'ethereumAddress,providerId,testAccount'].includes(Object.keys(value).sort().join()));
    check(typeof value.providerId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/.test(value.providerId));
    return { ethereumAddress: ethereumAddress(value.ethereumAddress), providerId: value.providerId, ...(value.testAccount === undefined ? {} : {testAccount:testAccountValue(value.testAccount)}) };
  }

  function create({ indexedDB = root.indexedDB, crypto = root.crypto } = {}) {
    let pending = Promise.resolve();
    const ordered = operation => {
      const result = pending.then(operation);
      pending = result.catch(() => {});
      return result;
    };
    const scopeKey = scope => JSON.stringify(['ROLLING_ETHEREUM_SESSION_V1', scope.origin, scope.chainId]);
    const authenticatedData = (scope, metadata) => encoder.encode(JSON.stringify({ version: VERSION, scope, metadata }));

    function open() {
      check(indexedDB && typeof indexedDB.open === 'function', 'STORAGE_UNAVAILABLE');
      return new Promise((resolve, reject) => {
        let blocked = false;
        const request = indexedDB.open(DATABASE, VERSION);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
        request.onerror = () => reject(error('STORAGE_UNAVAILABLE'));
        request.onblocked = () => { blocked = true; reject(error('STORAGE_BLOCKED')); };
      });
    }

    async function transaction(mode, operation) {
      const db = await open();
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, mode);
          let result;
          tx.oncomplete = () => resolve(result);
          tx.onabort = () => reject(error('STORAGE_UNAVAILABLE'));
          tx.onerror = () => reject(error('STORAGE_UNAVAILABLE'));
          const request = operation(tx.objectStore(STORE));
          request.onsuccess = () => { result = request.result; };
        });
      } finally { db.close(); }
    }

    async function derive({ ethers, signature, message, address }) {
      check(crypto?.subtle, 'CRYPTO_UNAVAILABLE');
      check(typeof message === 'string' && message.length <= 2048 && typeof signature === 'string', 'SIGNATURE');
      const expected = ethereumAddress(address);
      let canonical;
      try {
        canonical = ethers.Signature.from(signature).getCanonical().serialized;
        check(ethereumAddress(ethers.verifyMessage(message, canonical)) === expected, 'SIGNATURE');
      } catch { throw error('SIGNATURE'); }
      // Signing a different origin, chain, or message deliberately creates a
      // different account. The caller verifies the displayed message before signing.
      const salt = await crypto.subtle.digest('SHA-256', encoder.encode('ROLLING_ETHEREUM_ACCOUNT_V1\0' + message));
      const key = await crypto.subtle.importKey('raw', ethers.getBytes(canonical), 'HKDF', false, ['deriveBits']);
      const field = async label => {
        const bytes = new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt,
          info: encoder.encode('ROLLING_ETHEREUM_ACCOUNT_V1/' + label) }, key, 256));
        const number = BigInt('0x' + Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''));
        bytes.fill(0);
        return number % (FIELD - 1n) + 1n;
      };
      const secret = await field('secret-key');
      const accountSalt = await field('account-salt');
      return Object.freeze({ secretKey: '0x' + secret.toString(16).padStart(64, '0'), salt: '0x' + accountSalt.toString(16).padStart(64, '0') });
    }

    const selectionKey = (scope, address) => scopeKey(scopeValue(scope)) + ':test-account:' + ethereumAddress(address);
    function selectedTestAccount(scope, address) {
      const key = selectionKey(scope, address);
      return ordered(async () => testAccountValue((await transaction('readonly', store => store.get(key))) ?? '0'));
    }

    function save(scope, wallet, metadata) {
      const keyScope = scopeKey(scopeValue(scope));
      const capturedWallet = walletValue(wallet);
      const capturedMetadata = metadataValue(metadata);
      const selectedKey = selectionKey(scope, capturedMetadata.ethereumAddress);
      return ordered(async () => {
        check(crypto?.subtle && typeof crypto.getRandomValues === 'function', 'CRYPTO_UNAVAILABLE');
        const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const plaintext = encoder.encode(JSON.stringify(capturedWallet));
        let ciphertext;
        try {
          ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: authenticatedData(keyScope, capturedMetadata) }, key, plaintext);
        } finally { plaintext.fill(0); }
        await transaction('readwrite', store => {
          store.put(capturedMetadata.testAccount ?? '0', selectedKey);
          return store.put({ version: VERSION, scope: keyScope, metadata: capturedMetadata, key, iv, ciphertext }, keyScope);
        });
      });
    }

    function load(scope) {
      const keyScope = scopeKey(scopeValue(scope));
      return ordered(async () => {
        const record = await transaction('readonly', store => store.get(keyScope));
        if (record === undefined) return null;
        check(record && Object.keys(record).sort().join() === 'ciphertext,iv,key,metadata,scope,version');
        check(record.version === VERSION && record.scope === keyScope);
        const metadata = metadataValue(record.metadata);
        check(record.key?.type === 'secret' && record.key.extractable === false && record.key.algorithm?.name === 'AES-GCM' && record.key.algorithm.length === 256);
        check(Array.from(record.key.usages).sort().join() === 'decrypt,encrypt');
        check(ArrayBuffer.isView(record.iv) && record.iv.byteLength === 12);
        check(Object.prototype.toString.call(record.ciphertext) === '[object ArrayBuffer]' && record.ciphertext.byteLength > 16 && record.ciphertext.byteLength <= 2048);
        let plaintext;
        try {
          plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv,
            additionalData: authenticatedData(keyScope, metadata) }, record.key, record.ciphertext));
          const wallet = walletValue(JSON.parse(decoder.decode(plaintext)));
          return Object.freeze({ wallet: Object.freeze(wallet), metadata: Object.freeze(metadata) });
        } catch { throw error('INVALID'); }
        finally { plaintext?.fill(0); }
      });
    }

    function clear(scope) {
      const keyScope = scopeKey(scopeValue(scope));
      return ordered(() => transaction('readwrite', store => store.delete(keyScope)));
    }

    return Object.freeze({ createMessage, derive, save, load, clear, selectedTestAccount });
  }

  root.BillboardEthereumSession = Object.freeze({ ...create(), create });
})(globalThis);
