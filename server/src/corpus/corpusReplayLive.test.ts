/**
 * SHORTHAND-CORPUS cycle-1 DEFECT-1 — LIVE replay-path wiring acceptance tests.
 *
 * The adversarial review found that the CLI's live path routed the converted
 * body through postCorpusEntry, which re-derives via buildCorpusEntry's FIXED
 * field list and DROPS shorthand / intentShapeVersion / shorthandVersion — so a
 * replayed shorthand pair reached the wire indistinguishable from a historical
 * acceptedGraph entry (WS4 binding: the discriminator fields are preserved as
 * DATA in the replayed body). The kernel round-trip test injects its own
 * poster and cannot see this wiring; these tests exercise the CLI's live
 * poster (scripts/corpus-replay.ts) with a test-level fake fetch.
 *
 * Invariants pinned here:
 *  - the LIVE wire body for a shorthand-discriminated entry is BYTE-IDENTICAL
 *    to the captured entry: shorthand + intentShapeVersion + shorthandVersion
 *    survive to the wire;
 *  - a discriminator-free (historical acceptedGraph-target) entry's LIVE wire
 *    body is BYTE-IDENTICAL to what postCorpusEntry would have sent for it
 *    (no behavior change for old lines — captured entries are already
 *    buildCorpusEntry output, anonymized at capture time);
 *  - the poster keeps the postCorpusEntry response contract
 *    ({ok, entryId?, deduped?, error?}, corpus.disabled, http_NNN, never throws);
 *  - replayCorpusJsonl driven by the CLI poster reports per-entry failures
 *    with line numbers and posts the valid lines.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import {
  buildCorpusEntry,
  eventEditorCorpusEntry,
  postCorpusEntry,
  type CorpusConfig,
  type CorpusEntryInput,
} from './CorpusClient.js';
import { buildShorthandCorpusEntry, captureShorthandPairToLocal } from './shorthandCorpus.js';
import { replayCorpusJsonl } from './corpusReplay.js';
import { postReplayBodyVerbatim } from '../../scripts/corpus-replay.js';

const ENABLED: CorpusConfig = { enabled: true, serviceBaseUrl: 'http://corpus.test' };

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

/** A fake fetch that records the exact wire body and answers like the service. */
function recordingFetch(response: { ok: boolean; status?: number; json?: unknown } = { ok: true, json: { entryId: 'CRM-1' } }) {
  const seen: Array<{ url: string; body: string }> = [];
  const fetchFn = vi.fn(async (url: unknown, init?: RequestInit) => {
    seen.push({ url: String(url), body: String(init?.body ?? '') });
    return {
      ok: response.ok,
      status: response.status ?? 200,
      json: async () => response.json ?? {},
    } as Response;
  }) as unknown as typeof fetch;
  return { fetchFn, seen };
}

function capturedShorthandEntry(): { content: string; entry: Record<string, unknown> } {
  const dir = mkdtempSync(join(tmpdir(), 'corpus-replay-live-'));
  const file = join(dir, 'pairs.jsonl');
  const entry = buildShorthandCorpusEntry(CAPTURE_INPUT);
  expect(captureShorthandPairToLocal(CAPTURE_INPUT, file)).toBe(true);
  return { content: readFileSync(file, 'utf8'), entry };
}

describe('CLI live poster (DEFECT-1): the wire body is the captured entry VERBATIM', () => {
  it('a shorthand-discriminated entry reaches the wire with shorthand + intentShapeVersion + shorthandVersion', async () => {
    const { entry } = capturedShorthandEntry();
    const { fetchFn, seen } = recordingFetch();
    const result = await postReplayBodyVerbatim(entry, ENABLED, fetchFn);
    expect(result.ok).toBe(true);
    expect(result.entryId).toBe('CRM-1');
    expect(seen).toHaveLength(1);
    const wire = JSON.parse(seen[0]!.body) as Record<string, unknown>;
    // BYTE-IDENTICAL to the captured entry — the kernel body is POSTed as-is.
    expect(seen[0]!.body).toBe(JSON.stringify(entry));
    // The discriminator + training target survive to the wire (WS4 binding).
    expect(wire.intentShapeVersion).toBe('1');
    expect(wire.shorthandVersion).toBe('0.1.0');
    expect((wire.shorthand as Record<string, unknown>).intentId).toBe('dmem-feed');
    // Same URL + JSON headers the corpus service expects.
    expect(seen[0]!.url).toBe('http://corpus.test/corpus/entries');
  });

  it('a discriminator-free (historical acceptedGraph-target) entry posts BYTE-IDENTICAL to what postCorpusEntry would have sent', async () => {
    // Historical deck-accept shape: the entry as captured (already buildCorpusEntry
    // output, anonymized at capture time).
    const historical = buildCorpusEntry(
      eventEditorCorpusEntry({
        userPrompt: 'run the plate',
        acceptedGraph: { events: [{ eventId: 'e-old' }], labwares: [] },
        runId: 'run-1',
        model: 'm',
      }),
    );
    const legacy = recordingFetch();
    const legacyResult = await postReplayBodyVerbatim(historical, ENABLED, legacy.fetchFn);
    const viaClient = recordingFetch();
    const clientResult = await postCorpusEntry(
      historical as unknown as CorpusEntryInput,
      ENABLED,
      viaClient.fetchFn,
    );
    expect(legacyResult.ok).toBe(true);
    expect(clientResult.ok).toBe(true);
    // No behavior change for old lines: identical wire bytes, identical URL.
    expect(legacy.seen[0]!.body).toBe(viaClient.seen[0]!.body);
    expect(legacy.seen[0]!.url).toBe(viaClient.seen[0]!.url);
  });

  it('keeps the postCorpusEntry response contract: corpus.disabled, http_NNN, thrown fetch — never throws', async () => {
    const entry = buildCorpusEntry(eventEditorCorpusEntry({ userPrompt: 'x', acceptedGraph: {} }));

    const disabled = await postReplayBodyVerbatim(entry, { enabled: false, serviceBaseUrl: 'http://corpus.test' });
    expect(disabled).toEqual({ ok: false, error: 'corpus.disabled' });

    const http500 = recordingFetch({ ok: false, status: 500 });
    const fail = await postReplayBodyVerbatim(entry, ENABLED, http500.fetchFn);
    expect(fail.ok).toBe(false);
    expect(fail.error).toBe('http_500');

    const boom = vi.fn(async () => {
      throw new Error('connection refused');
    }) as unknown as typeof fetch;
    const thrown = await postReplayBodyVerbatim(entry, ENABLED, boom);
    expect(thrown.ok).toBe(false);
    expect(thrown.error).toContain('connection refused');

    const dedup = recordingFetch({ ok: true, json: { entryId: 'CRM-2', deduped: true } });
    const dup = await postReplayBodyVerbatim(entry, ENABLED, dedup.fetchFn);
    expect(dup.ok).toBe(true);
    expect(dup.entryId).toBe('CRM-2');
    expect(dup.deduped).toBe(true);
  });

  it('replayCorpusJsonl driven by the CLI poster: valid lines post verbatim, broken lines report with line numbers', async () => {
    const { content, entry } = capturedShorthandEntry();
    const historicalLine = JSON.stringify(
      buildCorpusEntry(eventEditorCorpusEntry({ userPrompt: 'old', acceptedGraph: { events: [] } })),
    );
    const mixed = `${content}${'not json at all\n'}${historicalLine}`;
    const { fetchFn, seen } = recordingFetch();
    const result = await replayCorpusJsonl(mixed, (body) => postReplayBodyVerbatim(body, ENABLED, fetchFn));
    expect(result.posted).toBe(2);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.lineNo).toBe(2);
    expect(result.failures[0]!.error).toContain('line 2');
    // Line 1's wire body carries the discriminator verbatim.
    const wire1 = JSON.parse(seen[0]!.body) as Record<string, unknown>;
    expect(seen[0]!.body).toBe(JSON.stringify(entry));
    expect(wire1.intentShapeVersion).toBe('1');
    // Line 3 (historical) posts unchanged.
    expect(seen[1]!.body).toBe(historicalLine);
  });
});
