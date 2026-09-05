/**
 * surfaceContextCorpus — pure builder + opt-in local JSONL capture of
 * SurfaceContext→accepted pairs (phase 5, Tasks 5.2 + 5.3). No networking:
 * buildSurfaceContextCorpusEntry is pure; capture writes to a temp JSONL file.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  buildSurfaceContextCorpusEntry,
  captureSurfaceContextPairToLocal,
  resolveLocalCorpusPath,
} from './surfaceContextCorpus.js';
import type { SurfaceContext } from '../surfaceContext/SurfaceContext.js';

const CTX: SurfaceContext = {
  surface: 'find',
  active: { objectType: 'collection', objectId: 'selection:q_1', label: 'Find selection' },
  selection: [{ ref: { kind: 'record', id: 'well:1', type: 'well', label: 'A1' } }],
  prompt: 'Analyze these wells',
};

const SMALL_GRAPH = { events: [{ eventGraphId: 'EVG-0002', label: 'Lyse' }] };

describe('resolveLocalCorpusPath', () => {
  it('is empty when the env toggle is unset (off by default)', () => {
    expect(resolveLocalCorpusPath({})).toBe('');
  });
});

describe('buildSurfaceContextCorpusEntry', () => {
  it('builds an anonymized Surface-context entry with prompt.surfaceContext present', () => {
    const entry = buildSurfaceContextCorpusEntry({ surfaceContext: CTX, acceptedGraph: SMALL_GRAPH });
    expect(entry.source).toBe('Surface-context');
    expect(entry.confirmedBy).toBe('accepted-EVG');
    const sc = (entry.prompt as { surfaceContext: { selection: Array<{ ref: { id: string } }> } }).surfaceContext;
    expect(sc.selection[0]!.ref.id).toBe('well:###'); // anonymized
    expect((entry.acceptedGraph as Record<string, unknown>).events).toBeDefined();
  });

  it('uses the goal when provided, else the context prompt', () => {
    const goal = buildSurfaceContextCorpusEntry({ surfaceContext: CTX, goal: 'compute mean', acceptedGraph: SMALL_GRAPH });
    expect((goal.prompt as { user: string }).user).toBe('compute mean');
    const fallback = buildSurfaceContextCorpusEntry({ surfaceContext: CTX, acceptedGraph: SMALL_GRAPH });
    expect((fallback.prompt as { user: string }).user).toBe('Analyze these wells');
  });
});

describe('captureSurfaceContextPairToLocal', () => {
  it('is a no-op (false) when no path is configured', () => {
    expect(captureSurfaceContextPairToLocal({ surfaceContext: CTX, acceptedGraph: SMALL_GRAPH }, '')).toBe(false);
  });

  it('writes a valid JSONL line with prompt.surfaceContext + acceptedGraph when a path is given', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cl-corpus-'));
    const path = join(dir, 'capture.jsonl');
    const wrote = captureSurfaceContextPairToLocal({ surfaceContext: CTX, acceptedGraph: SMALL_GRAPH }, path);
    expect(wrote).toBe(true);
    const lines = readFileSync(path, 'utf8').trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]!) as Record<string, unknown>;
    const sc = (entry.prompt as { surfaceContext: { selection: Array<{ ref: { id: string } }> } }).surfaceContext;
    expect(sc.selection[0]!.ref.id).toBe('well:###');
    expect(entry.acceptedGraph).toBeDefined();
  });
});