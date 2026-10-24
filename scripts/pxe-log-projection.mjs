import {createHash} from 'node:crypto';
export const PRIVATE_LOG_CACHE_PIN='f1e9cf066fb78c47c0ec836413247a085502af99a521129833bf99c281eb7865';
// Reuse an already cached richer page only for the identical immutable query.
// All native anchor/range/cursor keys, batching, failure eviction and wipe rules
// remain in charge; this adds no cache or independent expiry policy.
export function reusePrivateLogEffects(source){
 if(createHash('sha256').update(source).digest('hex')!==PRIVATE_LOG_CACHE_PIN)throw Error('PXE_LOG_PROJECTION_SOURCE');
 const marker='            const keyPrefix = `private-logs:${privateLogsQueryKey(query)}`;';
 if(source.split(marker).length!==2)throw Error('PXE_LOG_PROJECTION_LAYOUT');
 return source.replace(marker,marker+`
            if (query.includeEffects === false || query.includeEffects === undefined) {
                const richerPrefix = \`private-logs:\${privateLogsQueryKey({ ...query, includeEffects: true })}\`;
                const richer = cache.peekAll(query.tags.map(tag => \`\${richerPrefix}:\${tagQueryKey(tag)}\`));
                richer.forEach((page, index) => {
                    if (page !== undefined) cache.fetch(\`\${keyPrefix}:\${tagQueryKey(query.tags[index])}\`, () => page.then(logs => logs.map(({ noteHashes, nullifiers, ...log }) => ({ ...log, logData: [...log.logData] }))));
                });
            }
`);
}
