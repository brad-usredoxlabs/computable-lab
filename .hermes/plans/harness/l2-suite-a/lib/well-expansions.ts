// L2-SUITE-A: emit the COMPILER's OWN well-range expansion (expandWellTokens)
// for the corpus's range tokens — the expectations JSON pins THESE values
// (well-range semantics are the compiler's, never re-derived in the harness;
// spec: "the probe takes the well set/count from the server result and
// byte-compares against the expectations JSON").
import { expandWellTokens } from '../../../../../server/src/ai/wellRange.ts';

const tokens = ['B1:H6', 'A2:H6', 'A2:H2', 'A3:H3'];
for (const t of tokens) {
  const w = expandWellTokens([t]);
  console.log(JSON.stringify({ token: t, count: w.length, wells: w }));
}
