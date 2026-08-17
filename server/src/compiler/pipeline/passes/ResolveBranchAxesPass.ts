/**
 * ResolveBranchAxesPass — branch resolution on the local-protocol-compile
 * pipeline (Task 5, condition-first localization).
 *
 * Sits after resolve_protocol_ref. Reads the canonical protocol's declared
 * branch_axes + the local protocol's already-resolved branch_resolution (the
 * per-axis branchIds recorded by localization, e.g. via lowerToLabProtocol in
 * Task 4) and emits the ACTIVE starting step ids for downstream pass
 * expansion to filter by. If the canonical protocol declares branch_axes but
 * the local protocol carries no branch_resolution, it BLOCKS (never silently
 * compiles the full unbranched step set).
 */

import type { Pass, PassRunArgs, PassResult } from '../types.js';
import {
  activeStepIdsForResolution,
  type BranchAxisLike,
  type BranchResolutionEntry,
} from '../../../protocol/BranchResolver.js';

export interface CreateResolveBranchAxesPassDeps {
  // Stateless — reads upstream outputs.
}

export function createResolveBranchAxesPass(
  _deps: CreateResolveBranchAxesPassDeps = {},
): Pass {
  return {
    id: 'resolve_branch_axes',
    family: 'disambiguate',
    run(args: PassRunArgs): PassResult {
      const outputs = args.state.outputs;
      const resolveOutput = outputs.get('resolve_protocol_ref') as
        | { localProtocol?: { payload?: Record<string, unknown> }; canonicalProtocol?: { payload?: Record<string, unknown> } }
        | undefined;

      if (!resolveOutput?.canonicalProtocol) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'missing_canonical_protocol',
              message: 'resolve_branch_axes requires outputs.resolve_protocol_ref.canonicalProtocol',
              pass_id: 'resolve_branch_axes',
            },
          ],
        };
      }

      const canonical = resolveOutput.canonicalProtocol.payload ?? {};
      const lpr = resolveOutput.localProtocol?.payload ?? {};
      const branchAxes = Array.isArray(canonical.branch_axes)
        ? (canonical.branch_axes as BranchAxisLike[])
        : [];

      // No branch axes on the canonical protocol → nothing to resolve (back-compat).
      if (branchAxes.length === 0) {
        return {
          ok: true,
          output: { branchActiveStepIds: undefined, branch_resolution: undefined },
        };
      }

      const branchResolution = Array.isArray(lpr.branch_resolution)
        ? (lpr.branch_resolution as BranchResolutionEntry[])
        : [];
      if (branchResolution.length === 0) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'BRANCH_RESOLUTION_MISSING',
              message:
                'The canonical protocol declares branch_axes, but this local protocol has no branch_resolution — localize it with branch choices first (condition-first localization), then compile.',
              pass_id: 'resolve_branch_axes',
            },
          ],
        };
      }

      const branchActiveStepIds = activeStepIdsForResolution(branchAxes, branchResolution);
      return {
        ok: true,
        output: { branchActiveStepIds, branch_resolution: branchResolution },
      };
    },
  };
}