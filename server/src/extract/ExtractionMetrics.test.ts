import { describe, it, expect } from 'vitest';
import { ExtractionMetrics } from './ExtractionMetrics.js';

describe('ExtractionMetrics', () => {
  it('empty snapshot has averageDurationMs === 0 (no NaN)', () => {
    const metrics = new ExtractionMetrics();
    const snap = metrics.snapshot();
    expect(snap.totalRuns).toBe(0);
    expect(snap.averageDurationMs).toBe(0);
    expect(snap.totalCandidates).toBe(0);
    expect(snap.diagnosticHistogram).toEqual({});
  });

  it('recordRun accumulates totalRuns, duration, candidates, and histogram', () => {
    const metrics = new ExtractionMetrics();

    metrics.recordRun(100, 5, ['code_a']);
    metrics.recordRun(200, 3, ['code_a', 'code_b']);
    metrics.recordRun(300, 2, ['code_b']);

    const snap = metrics.snapshot();
    expect(snap.totalRuns).toBe(3);
    expect(snap.averageDurationMs).toBe((100 + 200 + 300) / 3);
    expect(snap.totalCandidates).toBe(10);
    expect(snap.diagnosticHistogram).toEqual({
      code_a: 2,
      code_b: 2,
    });
  });

  it('reset() zeroes all fields', () => {
    const metrics = new ExtractionMetrics();
    metrics.recordRun(100, 5, ['code_a']);
    metrics.recordRun(200, 3, ['code_b']);

    metrics.reset();

    const snap = metrics.snapshot();
    expect(snap.totalRuns).toBe(0);
    expect(snap.averageDurationMs).toBe(0);
    expect(snap.totalCandidates).toBe(0);
    expect(snap.diagnosticHistogram).toEqual({});
  });

  it('skips falsy diagnostic codes', () => {
    const metrics = new ExtractionMetrics();
    metrics.recordRun(100, 1, ['', 'code_a', '', 'code_b']);

    const snap = metrics.snapshot();
    expect(snap.diagnosticHistogram).toEqual({
      code_a: 1,
      code_b: 1,
    });
  });
});
