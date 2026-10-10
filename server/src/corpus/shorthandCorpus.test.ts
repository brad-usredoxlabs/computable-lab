/**
 * shorthandCorpus — pure builder + opt-in local JSONL capture of
 * prompt→accepted-shorthand pairs. No networking: build validates the macro
 * with the shipped schema (Ajv) and anonymizes via buildCorpusEntry; capture
 * writes to a temp JSONL file only when the toggle resolves.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  buildShorthandCorpusEntry,
  captureShorthandPairToLocal,
  INTENT_SHAPE_VERSION,
} from './shorthandCorpus.js';
import { ScientistIntentValidationError } from '../compiler/scientistIntent/parseScientistIntent.js';

// The wire shape the accept seam holds (the compile path already lifted +
// normalized): no envelope (kind/version are added BY the parser), camelCase
// slots per schema/workflow/scientist-intent.schema.yaml.
const SHORTHAND = {
  intentId: 'dmem-feed',
  actions: [
    { action: 'add_material', material: 'DMEM', volumeUl: 100, sourceWells: ['A1'] },
  ],
  unresolved: [],
};

describe('buildShorthandCorpusEntry', () => {
  it('carries the accepted shorthand as the target and the graph as provenance', () => {
    const entry = buildShorthandCorpusEntry({
      userPrompt: 'Add 100uL of DMEM to row A',
      shorthand: SHORTHAND,
      acceptedGraph: { events: [{ eventGraphId: 'EVG-0042', event_type: 'add_material' }] },
      confirmedAt: '2026-10-10T00:00:00Z',
    });
    expect(entry.intentShapeVersion).toBe(INTENT_SHAPE_VERSION);
    // The target is the shorthand document itself.
    const target = entry.shorthand as Record<string, unknown>;
    expect(target.kind).toBe('scientist-intent');
    expect((target.actions as unknown[]).length).toBe(1);
    expect(entry.shorthandVersion).toBe('0.1.0');
    // The graph is provenance only: it stays in the historical field, never in
    // place of the target.
    expect(entry.acceptedGraph).toMatchObject({ events: [{ eventGraphId: 'EVG-###' }] });
    // Internal ids are anonymized on the provenance graph too (EVG-0042 scrubbed).
    expect(JSON.stringify(entry)).not.toContain('EVG-0042');
    expect(entry.confirmedBy).toBe('user');
  });

  it('refuses a macro that is not a valid scientist-intent (schema-checked BEFORE write)', () => {
    expect(() =>
      buildShorthandCorpusEntry({
        userPrompt: 'whatever',
        // Missing kind/actions: not a scientist-intent document.
        shorthand: { intentId: 'oops', events: [{ anything: true }] },
      }),
    ).toThrow(ScientistIntentValidationError);
  });

  it('bridges a natural verb to the canonical vocabulary in the stored target', () => {
    const entry = buildShorthandCorpusEntry({
      userPrompt: 'add DMEM then spin it',
      shorthand: {
        ...SHORTHAND,
        actions: [{ action: 'aspirate', material: 'DMEM', volume_ul: 100, wells: ['A1'] }],
      },
    });
    const target = entry.shorthand as { actions: Array<{ action: string }> };
    // lift/normalize path: aspirate -> transfer, never the model's natural verb.
    expect(target.actions[0].action).toBe('transfer');
  });
});

describe('captureShorthandPairToLocal', () => {
  it('appends one JSONL pair when a path is given', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shorthand-corpus-'));
    const file = join(dir, 'pairs.jsonl');
    const ok = captureShorthandPairToLocal(
      { userPrompt: 'Add 100uL of DMEM', shorthand: SHORTHAND },
      file,
    );
    expect(ok).toBe(true);
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(parsed.intentShapeVersion).toBe(INTENT_SHAPE_VERSION);
    expect((parsed.shorthand as Record<string, unknown>).intentId).toBe('dmem-feed');
  });

  it('captures NOTHING when the toggle is unset (env-driven, no path override)', () => {
    const saved = process.env.CLA_CORPUS_LOCAL_PATH;
    delete process.env.CLA_CORPUS_LOCAL_PATH;
    try {
      const ok = captureShorthandPairToLocal({ userPrompt: 'x', shorthand: SHORTHAND });
      expect(ok).toBe(false);
    } finally {
      if (saved !== undefined) process.env.CLA_CORPUS_LOCAL_PATH = saved;
    }
  });

  it('writes nothing when the macro fails schema validation', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shorthand-corpus-'));
    const file = join(dir, 'pairs.jsonl');
    const ok = captureShorthandPairToLocal(
      { userPrompt: 'x', shorthand: { nope: true } },
      file,
    );
    expect(ok).toBe(false);
    let exists = true;
    try {
      readFileSync(file, 'utf8');
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });
});
