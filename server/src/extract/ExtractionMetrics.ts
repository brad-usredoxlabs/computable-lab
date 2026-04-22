/**
 * In-memory extraction metrics collector.
 *
 * Provides lightweight observability for the extraction pipeline:
 * - Total run count
 * - Average run duration (ms)
 * - Total candidates extracted
 * - Diagnostic code histogram
 *
 * All state is in-memory; a server restart resets all counters.
 */

export interface MetricsSnapshot {
  totalRuns: number;
  averageDurationMs: number;
  totalCandidates: number;
  diagnosticHistogram: Record<string, number>;
}

export class ExtractionMetrics {
  private totalRuns = 0;
  private totalDurationMs = 0;
  private totalCandidates = 0;
  private diagnosticHistogram = new Map<string, number>();

  /**
   * Record a completed extraction run.
   *
   * @param runDurationMs  Wall-clock duration of the run in milliseconds.
   * @param candidateCount Number of candidates in the resulting draft.
   * @param diagnosticCodes Diagnostic codes emitted during the run.
   */
  recordRun(runDurationMs: number, candidateCount: number, diagnosticCodes: string[]): void {
    this.totalRuns += 1;
    this.totalDurationMs += runDurationMs;
    this.totalCandidates += candidateCount;
    for (const code of diagnosticCodes) {
      if (code) {
        this.diagnosticHistogram.set(code, (this.diagnosticHistogram.get(code) ?? 0) + 1);
      }
    }
  }

  /**
   * Return a snapshot of the current metrics.
   */
  snapshot(): MetricsSnapshot {
    const hist: Record<string, number> = {};
    for (const [k, v] of this.diagnosticHistogram) hist[k] = v;
    return {
      totalRuns: this.totalRuns,
      averageDurationMs: this.totalRuns === 0 ? 0 : this.totalDurationMs / this.totalRuns,
      totalCandidates: this.totalCandidates,
      diagnosticHistogram: hist,
    };
  }

  /**
   * Reset all counters to zero.
   */
  reset(): void {
    this.totalRuns = 0;
    this.totalDurationMs = 0;
    this.totalCandidates = 0;
    this.diagnosticHistogram.clear();
  }
}
