import { describe, it, expect } from 'vitest';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { buildAnalysisCorpusEntry, captureAnalysisCorpusPair } from './analysisCorpus.js';

describe('analysisCorpus', () => {
  const manifest = {
    version: 1,
    artifacts: [{ name: 'peak_results', dataKind: 'table', value: [{ start: 0.0, end: 0.5, area: 10.0 }] }],
    views: [{ name: 'results', renderer: 'table', artifact: 'peak_results' }],
    metrics: [{ name: 'total_area', value: 10.0 }],
    logs: [],
  };

  it('builds an entry with surface=analysis and the accepted manifest', () => {
    const entry = buildAnalysisCorpusEntry({
      runId: 'ANR-1',
      revisionId: 'ANREV-1',
      label: 'GC area',
      goal: 'integrate the trace',
      manifest: manifest as never,
      asOf: '2026-09-05T12:00:00Z',
    });
    const prompt = entry.prompt as { surfaceContext?: { surface?: string } };
    expect(prompt.surfaceContext?.surface).toBe('analysis');
    expect(entry.acceptedGraph).toEqual(manifest);
  });

  it('captures a local JSONL entry at the given path', () => {
    const path = resolve(tmpdir(), 'cl-analysis-corpus-test.jsonl');
    rmSync(path, { force: true });
    const ok = captureAnalysisCorpusPair(
      {
        runId: 'ANR-2',
        revisionId: 'ANREV-2',
        label: 'GC area 2',
        manifest: manifest as never,
        asOf: '2026-09-05T12:05:00Z',
      },
      path,
    );
    expect(ok).toBe(true);
    expect(existsSync(path)).toBe(true);
    const line = readFileSync(path, 'utf8').trim();
    const parsed = JSON.parse(line) as { acceptedGraph?: unknown; prompt?: { surfaceContext?: { surface?: string } } };
    expect(parsed.acceptedGraph).toEqual(manifest);
    expect(parsed.prompt?.surfaceContext?.surface).toBe('analysis');
    rmSync(path, { force: true });
  });

  it('is a no-op when no path is configured', () => {
    const ok = captureAnalysisCorpusPair(
      { runId: 'ANR-3', revisionId: 'ANREV-3', label: 'x', manifest: manifest as never, asOf: '2026-09-05T12:06:00Z' },
      '',
    );
    expect(ok).toBe(false);
  });
});