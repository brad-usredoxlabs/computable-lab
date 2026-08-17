/**
 * WellStateTrackingPass — minimal well-concentration diagnostics pass (T5).
 *
 * Per plan: keep it a thin wrapper (go/no + a diagnostics[] gloss) that runs
 * the deterministic well-state tracker over a compiled event list WITHOUT
 * changing the /compile output contract. Wired-later seam: the run-plan-compile
 * path (POST /runs/:id/compile, runRunPlanCompile.ts) materializes the ordered
 * event list post-pipeline via PlannedRunEventsEmitPass; once those events are
 * canonicalized to PlateEvent shape (event_type + details.wells[]), this pass
 * consumes them from context.wellStateEvents and emits a correctness gloss.
 */

import {
  trackRunningComposition,
  type PlateEventLike,
} from '../../math/eventReducers.js';
import type { Pass, PassRunArgs, PassResult } from '../types.js';

export interface WellStateAssessment {
  /** No well is dirty (no non-physical inputs, e.g. negative/overrun/unknown). */
  go: boolean;
  wellCount: number;
  /** Well ids whose composition is marked dirty. */
  dirtyWells: string[];
  /** Human-readable gloss of any well-state warnings. */
  diagnostics: string[];
}

/** Run the composition tracker over events and produce a go/no + diagnostics gloss. */
export function assessWellStates(events: PlateEventLike[]): WellStateAssessment {
  const wellStates = trackRunningComposition({ events });
  const dirtyWells: string[] = [];
  const diagnostics: string[] = [];
  let wellCount = 0;

  for (const [wellId, fin] of wellStates) {
    wellCount += 1;
    if (fin.dirty) {
      dirtyWells.push(wellId);
      for (const warning of fin.warnings) diagnostics.push(`well ${wellId}: ${warning}`);
    }
  }

  return { go: dirtyWells.length === 0, wellCount, dirtyWells, diagnostics };
}

/**
 * Pass factory. Reads the canonicalized event list from
 * `state.context.wellStateEvents` and emits a well-state gloss. Returns ok,
 * never blocks a compile (a dirty well is a warning, not a gate).
 */
export function createWellStateTrackingPass(): Pass {
  return {
    id: 'well_state_tracking',
    family: 'project',
    run(args: PassRunArgs): PassResult {
      const events = (args.state.context as Record<string, unknown>).wellStateEvents;
      if (!Array.isArray(events) || events.length === 0) {
        return { ok: true, output: { go: true, wellCount: 0, diagnostics: [] } };
      }
      const assessment = assessWellStates(events as PlateEventLike[]);
      return {
        ok: true,
        output: {
          go: assessment.go,
          wellCount: assessment.wellCount,
          dirtyWells: assessment.dirtyWells,
          diagnostics: assessment.diagnostics,
        },
        ...(assessment.diagnostics.length
          ? {
              diagnostics: assessment.diagnostics.map((message) => ({
                severity: 'warning' as const,
                code: 'well_state',
                message,
                pass_id: 'well_state_tracking',
              })),
            }
          : {}),
      };
    },
  };
}