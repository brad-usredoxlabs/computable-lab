/**
 * shorthandCorpus — build + locally capture prompt→accepted-SHORTHAND corpus
 * pairs (SHORTHAND-CORPUS capture seam, direct-coded 2026-10-10).
 *
 * The training target changed when intent extraction became the AI's whole
 * job: a compiled event graph is DETERMINISTIC compiler output, so a pair that
 * trains a small model on graphs teaches it a job it no longer has. A
 * shorthand pair is:
 *   { prompt (user turns + optional SurfaceContext) -> accepted shorthand }
 * where the accepted shorthand is a schema-validated scientist-intent
 * document. The compiled graph rides along as PROVENANCE ONLY, never target.
 *
 * Like surfaceContextCorpus, this module has NO networking: pure builder +
 * opt-in local JSONL capture (CLA_CORPUS_LOCAL_PATH), mirroring the existing
 * toggle so a capture works with no corpus-service reachable and never fires
 * when the toggle is unset. The scientist-intent document is validated with
 * parseScientistIntent (Ajv, the sole validation authority) BEFORE any write —
 * an invalid macro never reaches the file or the wire.
 *
 * Every emitted entry carries `intentShapeVersion` (DATA discriminator): the
 * corpus's historical acceptedGraph-as-target entries stay untouched; a reader
 * selects by this field.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildCorpusEntry, type CorpusEntryInput } from './CorpusClient.js';
import { resolveLocalCorpusPath } from './surfaceContextCorpus.js';
import { parseScientistIntent, ScientistIntentValidationError } from '../compiler/scientistIntent/parseScientistIntent.js';
import { liftScientistIntent } from '../compiler/scientistIntent/liftScientistIntent.js';
import { SCIENTIST_INTENT_VERSION } from '../compiler/scientistIntent/types.js';

/** Discriminator for the prompt→shorthand pair shape (as data, not a code fork). */
export const INTENT_SHAPE_VERSION = '1';

export interface ShorthandCorpusInput {
  /** The user request (+ folded corrections) that produced the accepted macro. */
  userPrompt: string;
  /** The FINAL accepted scientist-intent document (the training target). */
  shorthand: unknown;
  /** Compiled graph of the acceptance — PROVENANCE ONLY, never the target. */
  acceptedGraph?: Record<string, unknown>;
  confirmedBy?: CorpusEntryInput['confirmedBy'];
  confirmedAt?: string;
  goldModel?: string;
  surfaceContext?: Record<string, unknown>;
  source?: CorpusEntryInput['source'];
}

/**
 * Validate the macro as a scientist-intent document (schema-checked BEFORE
 * write) and build the anonymized corpus entry whose training target is the
 * shorthand, not the compiled graph.
 * @throws ScientistIntentValidationError when the macro is not a valid intent.
 */
export function buildShorthandCorpusEntry(input: ShorthandCorpusInput): Record<string, unknown> {
  // The same door the compile path uses: lift first (declarative alias table
  // bridges natural verbs to the canonical closed vocabulary — the stored
  // target is ALWAYS canonical; lift is idempotent on an already-canonical
  // macro), then Ajv as the sole validation authority (rule #3). JSON is a
  // YAML subset, so the same parse path validates the object the seam holds.
  const lifted = liftScientistIntent(input.shorthand);
  const validated = parseScientistIntent(JSON.stringify(lifted));
  const entry = buildCorpusEntry({
    source: input.source ?? 'protocol-loop',
    sourceType: 'app',
    prompt: {
      user: input.userPrompt,
      ...(input.surfaceContext !== undefined
        ? { surfaceContext: input.surfaceContext }
        : {}),
    },
    // The corpus body keeps acceptedGraph (provenance; the historical shape's
    // field) — the TARGET is the shorthand carried beside it.
    acceptedGraph: input.acceptedGraph ?? {},
    confirmedBy: input.confirmedBy ?? 'user',
    ...(input.confirmedAt ? { confirmedAt: input.confirmedAt } : {}),
    ...(input.goldModel ? { goldModel: input.goldModel } : {}),
  });
  return {
    ...entry,
    intentShapeVersion: INTENT_SHAPE_VERSION,
    // The training target: canonical normalized accepted shorthand (the
    // vocabulary-bridged canonical set, never the model's natural verbs).
    shorthand: validated,
    shorthandVersion: SCIENTIST_INTENT_VERSION,
  };
}

/**
 * Best-effort local JSONL capture of an accepted shorthand pair. No-op
 * (returns false) when the env toggle is unset OR the macro fails validation.
 * Returns true when a line was appended.
 */
export function captureShorthandPairToLocal(
  input: ShorthandCorpusInput,
  pathOverride?: string,
): boolean {
  const resolved = pathOverride ?? resolveLocalCorpusPath();
  if (!resolved) return false;
  let entry: Record<string, unknown>;
  try {
    entry = buildShorthandCorpusEntry(input);
  } catch (err) {
    // An invalid macro is a data problem, not a crash: nothing is written and
    // the caller keeps serving (best-effort, mirrors the corpus post contract).
    if (err instanceof ScientistIntentValidationError) return false;
    throw err;
  }
  try {
    const line = `${JSON.stringify(entry)}\n`;
    mkdirSync(dirname(resolved), { recursive: true });
    appendFileSync(resolved, line, 'utf8');
    return true;
  } catch {
    return false;
  }
}
