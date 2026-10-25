import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function contractInputs(root) {
  const names = ['toolchain.json', 'package-lock.json', 'billboard/portal/package-lock.json',
    'billboard/portal/foundry.toml', 'scripts/build-contracts.mjs', 'scripts/build-funding-router.mjs', 'scripts/toolchain.mjs', 'scripts/artifact-provenance.mjs', 'scripts/normalize-noir.mjs', 'noir-dependencies.json', 'scripts/prepare-owner-noir.mjs', 'scripts/owner-delivery-noir-sources.json', 'scripts/fixtures/owner-noir-bootstrap/Nargo.toml', 'scripts/fixtures/owner-noir-bootstrap/src/lib.nr', 'scripts/check-noir-dependencies.mjs'];
  function scan(relative) {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      // Retired Noir packages are not part of the current application workspace.
      if (relative === 'billboard' && ['billboard_contract', 'billboard_test'].includes(entry.name)) continue;
      if (['target', 'node_modules', 'out', 'cache', 'lib'].includes(entry.name)) continue;
      const name = `${relative}/${entry.name}`;
      if (entry.isDirectory()) scan(name);
      else if (/\.(nr|sol)$/.test(name) || entry.name === 'Nargo.toml') names.push(name);
    }
  }
  scan('billboard');
  return Object.fromEntries(names.sort().map(name => [name, sha(fs.readFileSync(path.join(root, name)))]));
}
