/**
 * SHORTHAND-CORPUS WS4 — corpusReplay round-trip acceptance tests.
 *
 * The replay kernel is PURE: JSONL line -> entry -> CorpusEntryInput-shaped
 * POST body. NO fs, NO network in the kernel (replayKernel precedent — the
 * CLI under scripts/ owns the file read and the POST).
 *
 * Invariants pinned here:
 *  - round-trip: buildShorthandCorpusEntry -> captureShorthandPairToLocal(tmp)
 *    -> read line -> parseCorpusJsonlLine -> entryToPostBody deep-equals the
 *    captured entry;
 *  - the intentShapeVersion/shorthand/shorthandVersion discriminator fields are
 *    PRESERVED as DATA in the replayed body (the moat reader selects on them);
 *  - old acceptedGraph-target lines (no discriminator) pass through UNCHANGED
 *    (no migration, no rejection);
 *  - malformed lines are reported WITH LINE NUMBERS, never silently dropped;
 *  - replaying the same file twice yields byte-identical bodies
 *    (dedup-friendly identity).
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { buildShorthandCorpusEntry, captureShorthandPairToLocal } from './shorthandCorpus.js';
import {
  entryToPostBody,
  parseCorpusJsonlLine,
  replayCorpusJsonl,
} from './corpusReplay.js';

const SHORTHAND = {
  intentId: 'dmem-feed',
  actions: [
    { action: 'add_material', material: 'DMEM', volumeUl: 100, sourceWells: ['A1'] },
  ],
  unresolved: [],
};

const CAPTURE_INPUT = {
  userPrompt: 'Add 100uL of DMEM to row A',
  shorthand: SHORTHAND,
  acceptedGraph: { events: [{ eventGraphId: 'EVG-0042', event_type: 'add_material' }] },
  confirmedAt: '2026-10-11T00:00:00Z',
};

function captureToTempFile(): { file: string; entry: Record<string, unknown> } {
  const dir = mkdtempSync(join(tmpdir(), 'corpus-replay-'));
  const file = join(dir, 'pairs.jsonl');
  const entry = buildShorthandCorpusEntry(CAPTURE_INPUT);
  const ok = captureShorthandPairToLocal(CAPTURE_INPUT, file);
  expect(ok).toBe(true);
  return { file, entry };
}

describe('parseCorpusJsonlLine', () => {
  it('parses a captured shorthand pair line into its entry', () => {
    const { file, entry } = captureToTempFile();
    const line = readFileSync(file, 'utf8').trim();
    const parsed = parseCorpusJsonlLine(line, 1);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.entry).toEqual(entry);
  });

  it('reports a JSON-parse failure WITH the line number (never silently dropped)', () => {
    const parsed = parseCorpusJsonlLine('{ not json', 7);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.lineNo).toBe(7);
    expect(parsed.error).toContain('7');
  });

  it('reports an entry-shape failure WITH the line number', () => {
    // Valid JSON, but not a corpus entry: no prompt / acceptedGraph / confirmedBy.
    const parsed = parseCorpusJsonlLine(JSON.stringify({ intentShapeVersion: '1' }), 3);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.lineNo).toBe(3);
    expect(parsed.error).toContain('3');
  });
});

describe('entryToPostBody', () => {
  it('round-trip: the replayed body deep-equals the captured entry', () => {
    const { file, entry } = captureToTempFile();
    const line = readFileSync(file, 'utf8').trim();
    const parsed = parseCorpusJsonlLine(line, 1);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(entryToPostBody(parsed.entry)).toEqual(entry);
  });

  it('preserves intentShapeVersion / shorthand / shorthandVersion as DATA', () => {
    const { file } = captureToTempFile();
    const line = readFileSync(file, 'utf8').trim();
    const parsed = parseCorpusJsonlLine(line, 1);
    if (!parsed.ok) throw new Error('expected parse ok');
    const body = entryToPostBody(parsed.entry);
    expect(body.intentShapeVersion).toBe('1');
    expect(body.shorthandVersion).toBe('0.1.0');
    expect((body.shorthand as Record<string, unknown>).intentId).toBe('dmem-feed');
    // The target stays the shorthand; the graph stays provenance in its own field.
    expect(body.acceptedGraph).toMatchObject({ events: [{ eventGraphId: 'EVG-###' }] });
  });

  it('an old acceptedGraph-target line (no discriminator) passes through UNCHANGED', () => {
    // The historical deck-accept shape: acceptedGraph IS the target, no
    // intentShapeVersion. Replay must neither reject it nor migrate it.
    const historical = {
      source: 'event-editor',
      sourceType: 'app',
      prompt: { user: 'run the plate' },
      acceptedGraph: { events: [{ eventId: 'e-old' }], labwares: [] },
      confirmedBy: 'accepted-EVG',
      corrections: [],
      modelMetadata: {},
    };
    const parsed = parseCorpusJsonlLine(JSON.stringify(historical), 1);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const body = entryToPostBody(parsed.entry);
    expect(body).toEqual(historical);
    expect(body.intentShapeVersion).toBeUndefined();
    expect(body.shorthand).toBeUndefined();
  });

  it('exactOptionalPropertyTypes: absent optionals stay ABSENT in the body', () => {
    const entry = buildShorthandCorpusEntry({ userPrompt: 'x', shorthand: SHORTHAND });
    const body = entryToPostBody(entry);
    expect('confirmedAt' in body).toBe(false);
    expect('goldModel' in body).toBe(false);
  });
});

describe('replayCorpusJsonl', () => {
  it('posts one body per valid line through the injected poster', async () => {
    const { file } = captureToTempFile();
    const content = readFileSync(file, 'utf8');
    const post = vi.fn(async (_body: Record<string, unknown>) => ({ ok: true, entryId: 'CRM-1' }));
    const result = await replayCorpusJsonl(content, post);
    expect(result.posted).toBe(1);
    expect(result.failures).toHaveLength(0);
    expect(post).toHaveBeenCalledTimes(1);
    const body = post.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.intentShapeVersion).toBe('1');
  });

  it('replaying the same file twice yields BYTE-IDENTICAL bodies (dedup-friendly identity)', async () => {
    const { file } = captureToTempFile();
    const content = readFileSync(file, 'utf8');
    const bodies1: string[] = [];
    await replayCorpusJsonl(content, async (b) => { bodies1.push(JSON.stringify(b)); return { ok: true }; });
    const bodies2: string[] = [];
    await replayCorpusJsonl(content, async (b) => { bodies2.push(JSON.stringify(b)); return { ok: true }; });
    expect(bodies1).toHaveLength(1);
    expect(bodies1).toEqual(bodies2);
  });

  it('malformed lines are reported with line numbers and never silently dropped', async () => {
    const { file } = captureToTempFile();
    const good = readFileSync(file, 'utf8').trim();
    const content = `${good}\n{ broken json\n${JSON.stringify({ nope: true })}\n`;
    const post = vi.fn(async (_body: Record<string, unknown>) => ({ ok: true }));
    const result = await replayCorpusJsonl(content, post);
    expect(result.posted).toBe(1);
    // Lines 2 (JSON parse) and 3 (entry shape) are BOTH reported.
    expect(result.failures).toHaveLength(2);
    expect(result.failures.map((f) => f.lineNo)).toEqual([2, 3]);
  });

  it('an empty file posts nothing and fails nothing', async () => {
    const post = vi.fn(async (_body: Record<string, unknown>) => ({ ok: true }));
    const result = await replayCorpusJsonl('', post);
    expect(result.posted).toBe(0);
    expect(result.failures).toHaveLength(0);
    expect(post).not.toHaveBeenCalled();
  });
});
