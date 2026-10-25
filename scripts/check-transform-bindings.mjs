import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse = traverseModule.default ?? traverseModule;
// Existing build/runtime host bindings: Node polyfill and browser/worker clock and microtask API.
const suppliedGlobals = new Set(['Buffer', 'performance', 'queueMicrotask']);

// Check complete modules, including their imports. Comparing against the pinned
// original preserves upstream host globals without allowing new accidental ones.
export function unresolvedBindings(source) {
  const names = new Set();
  const ast = parse(source, {sourceType: 'unambiguous'});
  traverse(ast, {ReferencedIdentifier(path) {
    const name = path.node.name;
    if (!path.scope.hasBinding(name)) names.add(name);
  }});
  return names;
}
export function assertTransformBindings(original, transformed, filename) {
  const baseline = unresolvedBindings(original);
  const introduced = [...unresolvedBindings(transformed)].filter(name => !baseline.has(name) && !suppliedGlobals.has(name)).sort();
  if (introduced.length) throw new Error(`SDK transform introduced unresolved bindings in ${filename}: ${introduced.join(', ')}`);
  return transformed;
}
