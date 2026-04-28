/**
 * runRunPlanCompile — convenience function to run the run-plan-compile
 * pipeline, wiring together the YAML spec with pass implementations
 * from specs 031–033.
 *
 * Pipeline order (from run-plan-compile.yaml):
 *   1. parse_planned_run              (stub, family: parse)
 *   2. resolve_local_protocol         (family: normalize)
 *   3. resolve_policy_profile         (family: normalize)
 *   4. resolve_material_bindings      (family: disambiguate)
 *   5. resolve_labware_bindings       (family: disambiguate)
 *   6. capability_check               (family: validate)
 *   7. derive_per_step_context        (family: derive_context)
 *   8. ai_plan_quality_scoring        (family: derive_context, optional)
 *   9. project_result                 (family: project)
 *
 * Returns { runPlanCompileResult, eventGraphRef } matching the
 * POST /runs/:id/compile response shape.
 */

import { PassRegistry } from './PassRegistry.js';
import { runPipeline, type PipelineSpec } from './PipelineRunner.js';
import { loadPipeline } from './PipelineLoader.js';
import type { Pass } from './types.js';
import type { RecordStore } from '../../store/types.js';
import type { VerbDefinitionLite } from '../../protocol/SemanticKeyBuilder.js';
import { buildSemanticKey } from '../../protocol/SemanticKeyBuilder.js';
import { derivations } from '../../protocol/derivations/index.js';
import {
  createResolveLocalProtocolPass,
  createResolvePolicyProfilePass,
  createResolveMaterialBindingsPass,
  createResolveLabwareBindingsPass,
} from './passes/RunPlanBindingPasses.js';
import {
  createCapabilityCheckPass,
  createDerivePerStepContextPass,
  createProjectRunPlanResultPass,
  type RunPlanCompileResult,
} from './passes/RunPlanValidationPasses.js';
import { createPlannedRunEventsEmitPass } from './passes/PlannedRunEventsEmitPass.js';

// ---------------------------------------------------------------------------
// Stub parse pass — the YAML declares it but spec-031 doesn't implement it.
// ---------------------------------------------------------------------------

function createParsePlannedRunPass(): Pass {
  return {
    id: 'parse_planned_run',
    family: 'parse',
    run() {
      return { ok: true };
    },
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RunRunPlanCompileArgs {
  plannedRunRef: string;
  recordStore: RecordStore;
  policyProfileRef?: string;
  buildSemanticKey?: typeof buildSemanticKey;
  loadVerbDefinition?: (canonical: string) => Promise<VerbDefinitionLite | null>;
}

export interface RunRunPlanCompileResult {
  runPlanCompileResult: RunPlanCompileResult;
  eventGraphRef?: string;
}

// ---------------------------------------------------------------------------
// Pipeline runner
// ---------------------------------------------------------------------------

/**
 * Run the run-plan-compile pipeline and return the final result.
 */
export async function runRunPlanCompile(
  args: RunRunPlanCompileArgs,
): Promise<RunRunPlanCompileResult> {
  // Build registry and register passes
  const registry = new PassRegistry();

  const passes: Pass[] = [
    createParsePlannedRunPass(),
    createResolveLocalProtocolPass({ recordStore: args.recordStore }),
    createResolvePolicyProfilePass({ recordStore: args.recordStore }),
    createResolveMaterialBindingsPass({ recordStore: args.recordStore }),
    createResolveLabwareBindingsPass({ recordStore: args.recordStore }),
    createCapabilityCheckPass(),
    createDerivePerStepContextPass(),
    createProjectRunPlanResultPass(),
  ];

  for (const pass of passes) {
    registry.register(pass);
  }

  // Load pipeline spec from YAML
  const spec: PipelineSpec = loadPipeline(
    'schema/registry/compile-pipelines/run-plan-compile.yaml',
  );

  // Verify every pass id in the spec is registered
  // Skip passes with 'when' conditions (optional passes)
  const missingPasses: string[] = [];
  for (const passSpec of spec.passes) {
    if (passSpec.when) continue; // optional pass — skip validation
    if (!registry.has(passSpec.id)) {
      missingPasses.push(passSpec.id);
    }
  }

  if (missingPasses.length > 0) {
    throw new Error(`pass not registered: ${missingPasses.join(', ')}`);
  }

  // Build input
  const input: Record<string, unknown> = {
    plannedRunRef: args.plannedRunRef,
    ...(args.policyProfileRef ? { policyProfileRef: args.policyProfileRef } : {}),
  };

  // Run the pipeline
  const pipelineResult = await runPipeline(spec, registry, input);

  // Extract RunPlanCompileResult from project_result output
  const projectOutput = pipelineResult.outputs.get('project_result') as
    | { runPlanCompileResult?: RunPlanCompileResult }
    | undefined;

  const runPlanCompileResult = projectOutput?.runPlanCompileResult ?? {
    status: 'blocked',
    diagnostics: pipelineResult.diagnostics,
    perStepContexts: [],
    bindings: { materialResolutions: {}, labwareResolutions: {} },
  };

  // If planned_run_events_emit ran, extract eventGraphRef
  let eventGraphRef: string | undefined;
  const eventsEmitOutput = pipelineResult.outputs.get('planned_run_events_emit') as
    | { eventGraphRef?: string }
    | undefined;
  if (eventsEmitOutput?.eventGraphRef) {
    eventGraphRef = eventsEmitOutput.eventGraphRef;
  }

  return {
    runPlanCompileResult: runPlanCompileResult,
    eventGraphRef,
  };
}
