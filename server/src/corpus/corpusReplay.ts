/**
 * corpusReplay — PURE kernel turning captured corpus JSONL into corpus-service
 * POST bodies (SHORTHAND-CORPUS WS4).
 *
 * The local JSONL (CLA_CORPUS_LOCAL_PATH) is Brad's hand-seed store: every
 * accepted shorthand pair `captureShorthandPairToLocal` appended lives there.
 * This kernel replays it to the corpus service: line -> entry -> POST body.
 *
 * Purity contract (replayKernel precedent): NO fs and NO network here — the
 * CLI under `scripts/corpus-replay.ts` owns the file read and the POST. The
 * kernel only decodes, shape-checks, and re-serializes.
 *
 * Rules (binding):
 *  - `intentShapeVersion` / `shorthand` / `shorthandVersion` are PRESERVED as
 *    DATA in the replayed body — the moat reader selects on them; the version
 *    discriminator is data, not a code fork.
 *  - Old acceptedGraph-target lines (no discriminator) pass through UNCHANGED:
 *    no migration, no rejection, no deletion.
 *  - A line that fails JSON parse or the entry shape is REPORTED WITH ITS LINE
 *    NUMBER, never silently dropped.
 *  - Bodies are dedup-friendly: replaying the same file twice yields
 *    byte-identical bodies (the entry is re-serialized as captured — entries
 *    are already buildCorpusEntry output; replay adds file->body mechanics,
 *    NOT re-anonymization).
 */

/** A captured corpus entry: the JSON object one JSONL line holds. */
export type CorpusJsonlEntry = Record<string, unknown>;

export type ParseLineResult =
  | { ok: true; entry: CorpusJsonlEntry }
  | { ok: false; lineNo: number; error: string };

/** The minimal shape a corpus entry line must carry (structural only — Ajv
 *  remains the scientist-intent validation authority; this kernel never
 *  re-validates the shorthand target). */
const REQUIRED_ENTRY_FIELDS = ['prompt', 'acceptedGraph', 'confirmedBy'] as const;

/**
 * Decode one JSONL line into its entry. Failures carry the 1-based line number
 * so the caller can report them instead of silently dropping data.
 */
export function parseCorpusJsonlLine(line: string, lineNo: number): ParseLineResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (err) {
    return {
      ok: false,
      lineNo,
      error: `line ${lineNo}: JSON parse failed (${err instanceof Error ? err.message : String(err)})`,
    };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, lineNo, error: `line ${lineNo}: not a JSON object` };
  }
  const entry = parsed as CorpusJsonlEntry;
  for (const field of REQUIRED_ENTRY_FIELDS) {
    if (!(field in entry)) {
      return { ok: false, lineNo, error: `line ${lineNo}: missing corpus entry field "${field}"` };
    }
  }
  const { prompt, acceptedGraph, confirmedBy } = entry;
  if (typeof prompt !== 'object' || prompt === null || Array.isArray(prompt)) {
    return { ok: false, lineNo, error: `line ${lineNo}: "prompt" is not an object` };
  }
  if (typeof acceptedGraph !== 'object' || acceptedGraph === null || Array.isArray(acceptedGraph)) {
    return { ok: false, lineNo, error: `line ${lineNo}: "acceptedGraph" is not an object` };
  }
  if (typeof confirmedBy !== 'string') {
    return { ok: false, lineNo, error: `line ${lineNo}: "confirmedBy" is not a string` };
  }
  return { ok: true, entry };
}

/**
 * Turn a captured entry into the corpus-service POST body. The entry IS already
 * `buildCorpusEntry` output (plus the shorthand discriminator fields when it is
 * a prompt→shorthand pair), so the body is the entry as captured — preserved
 * field-for-field, discriminator included. No re-anonymization, no migration:
 * historical acceptedGraph-target entries replay byte-identically.
 */
export function entryToPostBody(entry: CorpusJsonlEntry): CorpusJsonlEntry {
  return { ...entry };
}

export interface ReplayFailure {
  lineNo: number;
  error: string;
}

export interface ReplayResult {
  posted: number;
  failures: ReplayFailure[];
}

/**
 * Replay a JSONL file's CONTENT (the CLI reads the file; the kernel never
 * touches fs) through an injected poster. Blank lines are skipped (a trailing
 * newline is not a malformed line); every other failing line is reported with
 * its 1-based number. The poster is injected so tests mock the corpus service
 * and the CLI supplies the real `postCorpusEntry`-backed one.
 */
export async function replayCorpusJsonl(
  content: string,
  post: (body: CorpusJsonlEntry) => Promise<{ ok: boolean; entryId?: string; error?: string }>,
): Promise<ReplayResult> {
  const lines = content.split('\n');
  const failures: ReplayFailure[] = [];
  let posted = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!line.trim()) continue;
    const parsed = parseCorpusJsonlLine(line, i + 1);
    if (!parsed.ok) {
      failures.push({ lineNo: parsed.lineNo, error: parsed.error });
      continue;
    }
    const result = await post(entryToPostBody(parsed.entry));
    if (result.ok) {
      posted++;
    } else {
      failures.push({ lineNo: i + 1, error: `line ${i + 1}: post failed (${result.error ?? 'unknown'})` });
    }
  }
  return { posted, failures };
}
