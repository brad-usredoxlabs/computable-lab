#!/usr/bin/env node
// MATRES-VERDICT — master-table DERIVATION (advc-cycle-2 N2/N3/N4/B1).
// Reads ONLY the regenerated fate JSONs and prints, per turn, per verb, per arm,
// the EXACT engine[].instrumented_cause strings (plus the RANKING candidate
// counts the verdict-report master table cites). The report's "RE-DERIVED
// mechanically" claim means: every table cell is reproducible from this output.
// Usage (cwd = worktree root): node .hermes/plans/replay-verdict/scripts/derive-master-table.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FATES = '.hermes/plans/replay-verdict/fates';
const files = readdirSync(FATES).filter((f) => f.endsWith('.json') && f !== '_summary.json').sort();

const rankingCounts = (causes) => causes
  .filter((c) => c.startsWith('RANKING'))
  .map((c) => { const m = c.match(/; (\d+) candidates, (\d+) distinct labels/); return m ? `${m[1]}c/${m[2]}L` : c; });

for (const f of files) {
  const d = JSON.parse(readFileSync(join(FATES, f), 'utf8'));
  const arms = d.engine.filter((e) => Array.isArray(e.instrumented_cause));
  if (!arms.length) continue;
  console.log(`\n=== ${f}  (noun: ${d.noun})`);
  for (const e of arms) {
    const arm = String(e.engine_arm).split(' ')[0];           // armA | armB
    const rk = rankingCounts(e.instrumented_cause);
    console.log(`  ${arm} ${e.arm}: ${e.instrumented_cause.join(' | ') || 'clean'}`);
    if (rk.length) console.log(`      ranking_counts: ${rk.join(', ')}`);
  }
}
