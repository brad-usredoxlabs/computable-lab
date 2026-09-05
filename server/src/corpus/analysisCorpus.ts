/**
 * analysisCorpus — corpus capture for the analysis surface.
 *
 * When an analysis run is accepted (succeeded), we record a
 * SurfaceContext(surface:'analysis') → accepted-manifest training pair, reusing
 * the existing local JSONL seam (opt-in via CLA_CORPUS_LOCAL_PATH). The
 * `acceptedGraph` here is the run's validated output manifest — the "next
 * surface/action" the model predicted. Pure + no networking; unit-testable.
 */
import {
  buildSurfaceContextCorpusEntry,
  captureSurfaceContextPairToLocal,
} from './surfaceContextCorpus.js';
import type { SurfaceContext } from '../surfaceContext/SurfaceContext.js';
import type { OutputManifest } from '../analysis/analysisRunner.js';

export interface AnalysisCorpusInput {
  /** The run's active object (revision/run). */
  runId: string;
  revisionId: string;
  label: string;
  /** The user's goal for the analysis (from the analysis prompt). */
  goal?: string;
  /** Validated output manifest of the accepted run. */
  manifest: OutputManifest;
  /** ISO as-of timestamp. */
  asOf: string;
}

/** Build the SurfaceContext for an analysis run. */
export function analysisSurfaceContext(input: AnalysisCorpusInput): SurfaceContext {
  const ctx: SurfaceContext = {
    surface: 'analysis',
    active: {
      objectType: 'analysis-run',
      objectId: input.runId,
      label: input.label,
    },
    selection: [
      { ref: { kind: 'record', id: input.revisionId, type: 'analysis-revision', label: input.label } },
    ],
    prompt: input.goal ?? `Analyze (run ${input.runId})`,
    ...(input.asOf ? { asOf: input.asOf } : {}),
  };
  return ctx;
}

/** Build the corpus entry for an accepted analysis run. */
export function buildAnalysisCorpusEntry(input: AnalysisCorpusInput): Record<string, unknown> {
  return buildSurfaceContextCorpusEntry({
    surfaceContext: analysisSurfaceContext(input),
    ...(input.goal ? { goal: input.goal } : {}),
    acceptedGraph: input.manifest as unknown as Record<string, unknown>,
    confirmedBy: 'accepted-EVG',
  });
}

/** Best-effort local capture of an accepted analysis pair (opt-in). */
export function captureAnalysisCorpusPair(input: AnalysisCorpusInput, pathOverride?: string): boolean {
  return captureSurfaceContextPairToLocal(
    {
      surfaceContext: analysisSurfaceContext(input),
      ...(input.goal ? { goal: input.goal } : {}),
      acceptedGraph: input.manifest as unknown as Record<string, unknown>,
      confirmedBy: 'accepted-EVG',
    },
    pathOverride,
  );
}