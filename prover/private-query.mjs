import {createSafeJsonRpcClient} from '@aztec-labs/foundation/json-rpc/client';
import {jsonStringify} from '@aztec-labs/foundation/json-rpc';
import {getSchemaParameters, getSchemaReturnType, parseWithOptionals, schemaHasMethod} from '@aztec-labs/foundation/schemas';
import {AztecNodeApiSchema} from '@aztec-labs/stdlib/interfaces/client';
import {getVersioningResponseHandler} from '@aztec-labs/stdlib/versioning';

export const QUERY_LIMITS = Object.freeze({bodyBytes: 8 * 1024 ** 2, responseBytes: 32 * 1024 ** 2, batch: 8, concurrent: 8, timeoutMs: 10000});
const silent = Object.assign(() => {}, Object.fromEntries(['trace','debug','verbose','info','warn','error','fatal'].map(k => [k, () => {}])));
const unavailable = () => Object.assign(Error('Trusted node unavailable'), {code: 'BB_TRUSTED_NODE_UNAVAILABLE'});
const errorResponse = (id, code = -32000) => ({jsonrpc: '2.0', id, error: {code, message: 'Trusted node request rejected'}});

// This is a trust-boundary adapter, not an anonymity proxy. Its independently
// operated full node, archive and upstream data sources must share prover trust.
// Queue cleanup never owns the full node or its persistent storage.
export function validateQueryNode(config) {
  if (config === undefined) return;
  if (!config || typeof config !== 'object' || Array.isArray(config)
    || Object.keys(config).some(k => !['url','rollupAddress','maxLagSeconds'].includes(k))) throw Error('Invalid query node configuration');
  let url; try { url = new URL(config.url); } catch { throw Error('Invalid query node configuration'); }
  if (url.protocol !== 'http:' || !['127.0.0.1','[::1]'].includes(url.hostname)
    || url.username || url.password || url.search || url.hash
    || (url.pathname !== '/' && url.pathname !== '')
    || !/^0x[0-9a-f]{40}$/.test(config.rollupAddress) || BigInt(config.rollupAddress) === 0n
    || !Number.isSafeInteger(config.maxLagSeconds ?? 120) || (config.maxLagSeconds ?? 120) < 1
    || (config.maxLagSeconds ?? 120) > 600) throw Error('Invalid query node configuration');
  return Object.freeze({url: url.href, rollupAddress: config.rollupAddress, maxLagSeconds: config.maxLagSeconds ?? 120});
}

export async function createPrivateQuery(options) {
  if (options.queryNode === undefined) return undefined;
  const {inspectTrustedNode} = await import('../shared/trusted-private-node.mjs');
  return createPrivateQueryWithInspector(options, inspectTrustedNode);
}

// Inspector injection is only for labelled unit tests. Production composition
// above always uses the shared identity/sync/freshness inspector.
export function createPrivateQueryWithInspector({queryNode, chainId, rollupVersion, proofsEnabled}, inspectTrustedNode) {
  const config = validateQueryNode(queryNode);
  if (!config || typeof inspectTrustedNode !== 'function') throw Error('Query inspector required');
  const options = Object.freeze({expectedNetworkScope: Object.freeze({chainId: String(chainId), version: String(rollupVersion), rollup: config.rollupAddress}), proofsEnabled, maxLagSeconds: config.maxLagSeconds});
  const node = createSafeJsonRpcClient(config.url, AztecNodeApiSchema, {
    namespaceMethods: 'aztec', log: silent, maxBatchSize: QUERY_LIMITS.batch,
    maxRequestBodySize: QUERY_LIMITS.bodyBytes,
    onResponse: getVersioningResponseHandler({l1ChainId: String(chainId), rollupVersion: String(rollupVersion), l1RollupAddress: config.rollupAddress}),
    // Exactly one transport attempt, including sendTx. Never follow redirects or
    // forward client headers/cookies/credentials to the fixed local upstream.
    fetch: async (host, body) => {
      try {
        const response = await fetch(host, {method: 'POST', body: jsonStringify(body),
          headers: {'content-type': 'application/json'}, redirect: 'error', credentials: 'omit',
          referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(QUERY_LIMITS.timeoutMs)});
        if (!response.ok) {await response.body?.cancel(); throw unavailable();}
        const chunks = []; let size = 0;
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > QUERY_LIMITS.responseBytes) throw unavailable();
          chunks.push(chunk);
        }
        return {response: JSON.parse(Buffer.concat(chunks).toString('utf8')), headers: response.headers};
      } catch { throw unavailable(); }
    },
  });
  let active = 0;
  const inspect = () => inspectTrustedNode(node, options);
  const health = async () => {
    if (active >= QUERY_LIMITS.concurrent) return {enabled: true, ready: false, reason: 'busy'};
    active++;
    try {await inspect(); return {enabled: true, ready: true};}
    catch {return {enabled: true, ready: false, reason: 'unavailable'};}
    finally {active--;}
  };
  const handle = async (req, res) => {
    const reply = (status, body) => {res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); res.end(jsonStringify(body));};
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) {reply(415, errorResponse(null)); return;}
    if (active >= QUERY_LIMITS.concurrent) {reply(429, errorResponse(null)); return;}
    active++;
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > QUERY_LIMITS.bodyBytes) {reply(413, errorResponse(null)); return;}
        chunks.push(chunk);
      }
      let body; try {body = JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {reply(400, errorResponse(null, -32600)); return;}
      const batch = Array.isArray(body), calls = batch ? body : [body];
      if (!calls.length || calls.length > QUERY_LIMITS.batch) {reply(400, errorResponse(null, -32600)); return;}
      const prepared = [];
      // Validate the complete batch before any operation (including sendTx).
      try {
        for (const call of calls) {
          if (!call || typeof call !== 'object' || Array.isArray(call) || call.jsonrpc !== '2.0'
            || Object.keys(call).some(k => !['jsonrpc','id','method','params'].includes(k))
            || !(Number.isSafeInteger(call.id) || (typeof call.id === 'string' && call.id.length <= 64))
            || typeof call.method !== 'string' || !/^(aztec|node)_[A-Za-z0-9]+$/.test(call.method)
            || !Array.isArray(call.params ?? [])) throw Error();
          const method = call.method.slice(call.method.indexOf('_') + 1);
          if (!schemaHasMethod(AztecNodeApiSchema, method)) throw Error();
          const args = await parseWithOptionals(call.params ?? [], getSchemaParameters(AztecNodeApiSchema[method]));
          prepared.push({id: call.id, method, args});
        }
      } catch {reply(400, errorResponse(null, -32602)); return;}
      try {await inspect();} catch {reply(503, errorResponse(null)); return;}
      const results = await Promise.all(prepared.map(async ({id, method, args}) => {
        try {
          const result = await node[method](...args);
          // The pinned safe client already validates/decodes defined outputs.
          // Its null shortcut bypasses validation, so check only that case:
          // required values must fail, genuine optional/void absence may pass.
          if (result === undefined) await getSchemaReturnType(AztecNodeApiSchema[method]).parseAsync(undefined);
          return {jsonrpc: '2.0', id, result: result ?? null};
        }
        catch {return errorResponse(id);}
      }));
      const encoded = jsonStringify(batch ? results : results[0]);
      if (Buffer.byteLength(encoded) > QUERY_LIMITS.responseBytes) {reply(502, errorResponse(null)); return;}
      res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); res.end(encoded);
    } catch {if (!res.writableEnded) reply(400, errorResponse(null));}
    finally {active--;}
  };
  return Object.freeze({health, handle});
}
