// Local elapsed durations of fixed native BB calls, nested within native-prove.
// Aggregates are not separate wall-clock spans; concurrent calls may overlap.
const methods = Object.freeze({
  chonkStart: 'bb-start', chonkLoad: 'bb-load', chonkAccumulate: 'bb-accumulate',
  chonkProve: 'bb-prove', chonkVerify: 'bb-verify', chonkCompressProof: 'bb-compress',
});
export function instrumentNativeCalls(api, timings, now = () => performance.now()) {
  for (const [name, label] of Object.entries(methods)) {
    const call = api[name].bind(api);
    api[name] = (...args) => {
      let start;
      try { start = now(); } catch {}
      // Diagnostics must not replace the native result or its original error.
      const finish = () => {
        try {
          const elapsed = now() - start;
          if (Number.isFinite(elapsed) && elapsed >= 0) timings[label] = (timings[label] ?? 0) + elapsed;
        } catch {}
      };
      let result;
      try { result = call(...args); } catch (error) { finish(); throw error; }
      if (result instanceof Promise) result.then(finish, finish);
      else finish();
      return result;
    };
  }
}
