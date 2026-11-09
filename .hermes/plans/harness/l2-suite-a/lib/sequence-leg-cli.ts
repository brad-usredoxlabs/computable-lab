/**
 * L2-SUITE-B — the thin NODE CLI over the sequence-leg classifier
 * (lib/sequence-leg.ts — the ONE TS implementation home for the sequence
 * trichotomy; mirrors lib/honest-cli.ts's bridge shape, OQ3 (ii)).
 *
 * Run with node's native TS type-stripping (node >= 22.18; default-on for
 * .ts on node 26):  node lib/sequence-leg-cli.ts
 *
 * Stdin:  { "result": <AgentResult-ish done frame>,
 *           "frames": [<SSE frames>]? ,
 *           "context": { "recordIds": [...], "engineIds": [...] }? }
 *          (context omitted/absent ⇒ refs not checkable — a plain unit probe;
 *           frames omitted/absent ⇒ no navigation arm.)
 * stdout: the verdict — "proposal" | "cards" | "honest-failure" — or, on the
 *         forbidden shapes: nothing on stdout and a NONZERO exit (the
 *         classifier's throw contract; stderr carries the delivered-channel
 *         dump the classifier emits).
 *
 * Sync I/O on purpose: the repo root package.json is CJS (no "type":"module"),
 * and the CLI is a single-JSON-document stdin/stdout bridge — no async needed.
 */
import { readFileSync } from 'node:fs';
import { classifySequenceLegOutcome, SequenceLegOutcomeError } from './sequence-leg.ts';

function main(): number {
  let raw = '';
  try {
    raw = readFileSync(0, 'utf-8');
  } catch (e) {
    process.stderr.write('sequence-leg-cli: no stdin JSON: ' + String(e) + '\n');
    return 2;
  }
  let doc: {
    result?: unknown;
    frames?: unknown;
    context?: { recordIds?: readonly string[]; engineIds?: readonly string[] };
  };
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    process.stderr.write('sequence-leg-cli: bad stdin JSON: ' + String(e) + '\n');
    return 2;
  }
  const result = (doc.result ?? {}) as Record<string, unknown>;
  const frames = Array.isArray(doc.frames) ? (doc.frames as unknown[]) : undefined;
  const context = doc.context
    ? {
        ...(doc.context.recordIds ? { recordIds: doc.context.recordIds } : {}),
        ...(doc.context.engineIds ? { engineIds: doc.context.engineIds } : {}),
      }
    : undefined;
  try {
    const verdict = classifySequenceLegOutcome(result, frames, context);
    process.stdout.write(verdict + '\n');
    return 0;
  } catch (e) {
    // the classifier's throw (ungrounded ref / generic wall / silent shape):
    // pass the message (with its delivered-channel dump) through, nonzero.
    if (e instanceof SequenceLegOutcomeError) {
      process.stderr.write(e.message + '\n');
      return 1;
    }
    process.stderr.write(e instanceof Error ? e.message : String(e) + '\n');
    return 3;
  }
}

process.exitCode = main();
