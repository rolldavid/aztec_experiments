// A browser-only projection of compiler artifacts. Compiled originals remain
// unchanged for source provenance, deployment, server execution and diagnostics.
// Bytecode, verification keys, ABI error types and assertion messages are retained.
export function browserContractArtifact(raw) {
 if (!raw || typeof raw !== 'object' || !Array.isArray(raw.functions) ||
     !raw.file_map || typeof raw.file_map !== 'object' || Array.isArray(raw.file_map)) {
  throw new Error('Invalid compiled contract artifact for browser publication');
 }
 const copy=structuredClone(raw);
 copy.file_map={};
 for (const fn of copy.functions) {
  if (!fn || typeof fn !== 'object' || typeof fn.debug_symbols !== 'string') {
   throw new Error('Invalid compiled function debug metadata');
  }
  // The native SDK explicitly represents omitted debug information this way.
  fn.debug_symbols='';
 }
 return copy;
}
