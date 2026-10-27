/**
 * L2-SUITE-A — the thin NODE CLI over FREEFORM's committed honest-outcome
 * helper (OQ3 ruling (ii): option (ii) — a thin node CLI wrapping FREEFORM's
 * TS `assertHonestOutcome`; the python driver shells out to it; ONE
 * implementation, no drift surface).
 *
 * Run with node's native TS type-stripping (node >= 22.18 `--experimental-strip-types`,
 * default-on for .ts on node 26):  node lib/honest-cli.ts
 *
 * Stdin:  { "result": <AgentResult-ish>, "context": {"deckIds": [...], "resolvedIds": [...]} }
 *         (context omitted/absent ⇒ the helper's own contract: labwareIds not
 *         checkable, events count as bound — a plain unit probe.)
 * stdout: the verdict — "events-bound" | "cards" | "honest-failure" — or, on
 *         the silent shape / unbound-label shape: nothing on stdout and a
 *         NONZERO exit (the helper's throw contract; stderr carries the
 *         delivered-channel dump the helper emits).
 *
 * The driver NEVER re-implements the trichotomy here; this file is a 1:1
 * stdin/stdout bridge into server/src/ai/honestOutcome.ts. Sync I/O on
 * purpose: the repo root package.json is CJS (no "type":"module"), and the
 * CLI is a single-JSON-document stdin/stdout bridge — no async needed.
 */
import { readFileSync } from 'node:fs';
import { classifyHonestOutcome } from '../../../../../server/src/ai/honestOutcome.ts';

function main(): number {
  let raw = '';
  try {
    raw = readFileSync(0, 'utf-8');
  } catch (e) {
    process.stderr.write('honest-cli: no stdin JSON: ' + String(e) + '\n');
    return 2;
  }
  let doc: {
    result?: unknown;
    context?: { deckIds?: readonly string[]; resolvedIds?: readonly string[] };
  };
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    process.stderr.write('honest-cli: bad stdin JSON: ' + String(e) + '\n');
    return 2;
  }
  const result = (doc.result ?? {}) as Record<string, unknown>;
  const context = doc.context
    ? {
        ...(doc.context.deckIds ? { deckIds: doc.context.deckIds } : {}),
        ...(doc.context.resolvedIds ? { resolvedIds: doc.context.resolvedIds } : {}),
      }
    : undefined;
  try {
    const verdict = classifyHonestOutcome(result, context);
    if (verdict === null) {
      // classifyHonestOutcome returns null on the silent shape;
      // assertHonestOutcome (the committed gate) THROWS there with the
      // channel dump. The CLI mirrors the GATE contract: nonzero on null.
      process.stderr.write(
        'assertHonestOutcome: NOT an honest outcome — success with zero bound ' +
        'events, zero cards, no error (the silent success-with-zero-mountable).\n');
      return 1;
    }
    process.stdout.write(verdict + '\n');
    return 0;
  } catch (e) {
    // the helper's throw (unbound raw-label labwareId): pass the message
    // (with its delivered-channel dump) through, nonzero exit.
    process.stderr.write(e instanceof Error ? e.message : String(e) + '\n');
    return 1;
  }
}

process.exitCode = main();
