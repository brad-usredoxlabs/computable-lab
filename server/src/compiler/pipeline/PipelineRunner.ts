/**
 * PipelineRunner: topological execution of passes with depends_on and when-conditions.
 *
 * This module provides the execution engine for compile pipelines,
 * running passes in dependency order while threading state and collecting diagnostics.
 */

import type { PassDiagnostic, PipelineState, PassResult, CompilerDiagnosticOutcome } from './types.js';
import { PassRegistry } from './PassRegistry.js';

/**
 * Specification for a single pass within a pipeline.
 */
export interface PipelinePassSpec {
  id: string;
  family: string;
  depends_on?: string[];
  when?: string;
  description?: string;
}

/**
 * Full pipeline specification including all passes and their dependencies.
 */
export interface PipelineSpec {
  pipelineId: string;
  entrypoint: string;
  passes: PipelinePassSpec[];
}

/**
 * Possible execution statuses for a pass.
 */
export type PassStatus = 'ok' | 'failed' | 'skipped' | 'not_run';

/**
 * Status entry for a single pass after pipeline execution.
 */
export interface PassStatusEntry {
  pass_id: string;
  status: PassStatus;
  reason?: string;
  outcome?: CompilerDiagnosticOutcome;  // per-pass outcome if set
}

/**
 * Result of running a complete pipeline.
 */
export interface PipelineRunResult {
  ok: boolean;
  outputs: Map<string, unknown>;
  diagnostics: PassDiagnostic[];
  pass_statuses: PassStatusEntry[];
  pass_outcomes: Map<string, CompilerDiagnosticOutcome>;  // pass_id → outcome (only for passes that set one)
}

/**
 * Function type for evaluating when-conditions on a pass.
 * Returns true if the pass should run, false if it should be skipped.
 */
export interface WhenEvaluator {
  (condition: string, state: PipelineState): boolean;
}

/**
 * Resolve a dotted path through a record.
 * Returns the value at the path, or undefined if any segment is missing.
 */
function resolveDottedPath(obj: unknown, parts: string[]): unknown {
  let v: unknown = obj;
  for (const p of parts) {
    if (v === undefined || v === null || typeof v !== 'object') return undefined;
    v = (v as Record<string, unknown>)[p];
  }
  return v;
}

/**
 * Evaluate a truthy/non-empty check on a value.
 * - undefined/null → false
 * - Array → truthy if length > 0
 * - Object → truthy if has own keys
 * - Boolean, number, string → Boolean(v)
 */
function isTruthy(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return Boolean(v);
}

/**
 * Default when evaluator: resolves dotted paths through state.outputs
 * and checks truthiness.
 *
 * Supports paths like:
 *   'outputs.ai_precompile.directives' → state.outputs.get('ai_precompile')?.directives
 *   'outputs.resolve_references.resolvedRefs' → state.outputs.get('resolve_references')?.resolvedRefs
 *   'input.labState' → state.input.labState
 */
export const DEFAULT_WHEN_EVALUATOR: WhenEvaluator = (condition: string, state: PipelineState): boolean => {
  const parts = condition.split('.');
  if (parts.length === 0) return true;

  let v: unknown;
  if (parts[0] === 'outputs' && parts.length >= 2) {
    // Resolve through state.outputs map
    const passId = parts[1];
    v = state.outputs.get(passId);
    for (let i = 2; i < parts.length; i++) {
      if (v === undefined || v === null || typeof v !== 'object') return false;
      v = (v as Record<string, unknown>)[parts[i]];
    }
  } else {
    // Walk state directly (e.g. 'input.labState')
    v = resolveDottedPath(state, parts);
  }

  return isTruthy(v);
};

/**
 * Shallow merge of two records. Last-write-wins for conflicting keys.
 */
function shallowMerge<T extends Record<string, unknown>>(base: T, patch: Partial<T>): T {
  return { ...base, ...patch };
}

/**
 * Merge meta patches onto state.meta.
 * Scalar values: last-write-wins.
 * Array values: concatenate (append-only provenance pattern, e.g., derivation_provenance).
 */
function mergeMeta(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const baseValue = base[key];
    // If both are arrays, concatenate (e.g., derivation_provenance)
    if (Array.isArray(value) && Array.isArray(baseValue)) {
      result[key] = [...baseValue, ...value];
    } else {
      // Otherwise, last-write-wins
      result[key] = value;
    }
  }
  return result;
}

/**
 * Run a pipeline of passes in topological order based on depends_on relationships.
 *
 * @param spec - The pipeline specification with pass definitions and dependencies
 * @param registry - The registry containing pass implementations
 * @param input - Initial input data for the pipeline
 * @param whenEvaluator - Optional evaluator for when-conditions (defaults to DEFAULT_WHEN_EVALUATOR)
 * @returns PipelineRunResult with outputs, diagnostics, and pass statuses
 */
export async function runPipeline(
  spec: PipelineSpec,
  registry: PassRegistry,
  input: Record<string, unknown>,
  whenEvaluator: WhenEvaluator = DEFAULT_WHEN_EVALUATOR,
): Promise<PipelineRunResult> {
  const outputs = new Map<string, unknown>();
  const diagnostics: PassDiagnostic[] = [];
  const pass_statuses: PassStatusEntry[] = [];
  const passStatusMap = new Map<string, PassStatus>();
  const passOutcomes = new Map<string, CompilerDiagnosticOutcome>();

  // Build initial state with empty context and meta
  let stateContext: Record<string, unknown> = {};
  let stateMeta: Record<string, unknown> = {};

  // Step 1: Validate that all passes in spec are registered
  const missingPasses: string[] = [];
  for (const passSpec of spec.passes) {
    if (!registry.has(passSpec.id)) {
      missingPasses.push(passSpec.id);
    }
  }

  if (missingPasses.length > 0) {
    for (const missingId of missingPasses) {
      diagnostics.push({
        severity: 'error',
        code: 'PIPELINE_MISSING_PASS',
        message: `Pass '${missingId}' referenced in pipeline but not registered`,
        pass_id: missingId,
      });
    }
    return {
      ok: false,
      outputs,
      diagnostics,
      pass_statuses,
      pass_outcomes: passOutcomes,
    };
  }

  // Step 2: Topological sort using Kahn's algorithm
  const topoOrder = topologicalSort(spec.passes);
  
  if (!topoOrder.ok) {
    // Cycle detected
    diagnostics.push({
      severity: 'error',
      code: 'PIPELINE_CYCLE',
      message: `cycle in pipeline: ${topoOrder.cycleIds.join(', ')}`,
      pass_id: spec.pipelineId,
    });
    return {
      ok: false,
      outputs,
      diagnostics,
      pass_statuses,
      pass_outcomes: passOutcomes,
    };
  }

  const sortedPasses = topoOrder.sortedIds;

  // Step 3: Execute passes in topological order
  for (const passId of sortedPasses) {
    const passSpec = spec.passes.find(p => p.id === passId)!;
    const pass = registry.get(passId)!;

    // Build current pipeline state (immutable snapshot for this pass)
    const state: PipelineState = {
      input: Object.freeze({ ...input }),
      context: Object.freeze({ ...stateContext }),
      meta: Object.freeze({ ...stateMeta }),
      outputs: Object.freeze(new Map(outputs)),
      diagnostics: [...diagnostics],
    };

    // Check when-condition
    if (passSpec.when !== undefined && passSpec.when !== null && passSpec.when.trim() !== '') {
      const runPass = whenEvaluator(passSpec.when, state);
      if (!runPass) {
        diagnostics.push({
          severity: 'info',
          code: 'pass_skipped_by_when',
          message: `Pass '${passId}' skipped: when condition '${passSpec.when}' evaluated to false`,
          pass_id: passId,
        });
        const statusEntry: PassStatusEntry = {
          pass_id: passId,
          status: 'skipped',
          reason: 'when=false',
        };
        pass_statuses.push(statusEntry);
        passStatusMap.set(passId, 'skipped');
        continue;
      }
    }

    // Check if any dependency failed or was skipped
    const deps = passSpec.depends_on || [];
    let skippedDueToDep: { depId: string; depStatus: PassStatus } | null = null;
    
    for (const depId of deps) {
      const depStatus = passStatusMap.get(depId);
      if (depStatus === 'failed' || depStatus === 'skipped') {
        skippedDueToDep = { depId, depStatus };
        break;
      }
    }

    if (skippedDueToDep) {
      const statusEntry: PassStatusEntry = {
        pass_id: passId,
        status: 'skipped',
        reason: `dependency ${skippedDueToDep!.depId} was ${skippedDueToDep!.depStatus}`,
      };
      pass_statuses.push(statusEntry);
      passStatusMap.set(passId, 'skipped');
      continue;
    }

    // Execute the pass
    let passResult: PassResult;
    try {
      passResult = await pass.run({ pass_id: passId, state });
    } catch (error) {
      // Treat uncaught exceptions as failed passes
      passResult = {
        ok: false,
        diagnostics: [
          {
            severity: 'error',
            code: 'PASS_EXCEPTION',
            message: error instanceof Error ? error.message : String(error),
            pass_id: passId,
          },
        ],
      };
    }

    // Record status and handle result
    // Accumulate diagnostics regardless of success/failure
    if (passResult.diagnostics) {
      diagnostics.push(...passResult.diagnostics);
    }

    // Track outcome if present
    if (passResult.outcome) {
      passOutcomes.set(passId, passResult.outcome);
    }

    if (passResult.ok) {
      const statusEntry: PassStatusEntry = { pass_id: passId, status: 'ok' };
      if (passResult.outcome) {
        statusEntry.outcome = passResult.outcome;
      }
      pass_statuses.push(statusEntry);
      passStatusMap.set(passId, 'ok');

      if (passResult.output !== undefined) {
        // Apply merge semantics for context and meta patches
        if (typeof passResult.output === 'object' && passResult.output !== null) {
          const outputObj = passResult.output as Record<string, unknown>;

          // Handle context patch: shallow-merge onto state.context
          if ('context' in outputObj) {
            const contextPatch = outputObj.context;
            if (contextPatch !== null && typeof contextPatch === 'object' && !Array.isArray(contextPatch)) {
              // Valid context patch: shallow merge
              stateContext = shallowMerge(stateContext, contextPatch as Record<string, unknown>);
            } else {
              // Invalid context patch: emit diagnostic but continue
              diagnostics.push({
                severity: 'warning',
                code: 'invalid_context_patch',
                message: `Pass '${passId}' returned non-object context patch, ignoring`,
                pass_id: passId,
                details: { context_patch_type: contextPatch === null ? 'null' : Array.isArray(contextPatch) ? 'array' : typeof contextPatch },
              });
            }
          }

          // Handle meta patch: shallow-merge with array concatenation
          if ('meta' in outputObj) {
            const metaPatch = outputObj.meta;
            if (metaPatch !== null && typeof metaPatch === 'object' && !Array.isArray(metaPatch)) {
              // Valid meta patch: merge with array concat rule
              stateMeta = mergeMeta(stateMeta, metaPatch as Record<string, unknown>);
            }
            // Non-object meta is ignored (no diagnostic needed for meta)
          }
        }

        // Store the full output object under state.outputs
        outputs.set(passId, passResult.output);
      }
    } else {
      const statusEntry: PassStatusEntry = { pass_id: passId, status: 'failed' };
      if (passResult.outcome) {
        statusEntry.outcome = passResult.outcome;
      }
      pass_statuses.push(statusEntry);
      passStatusMap.set(passId, 'failed');
    }
  }

  // Determine overall success: ok iff no failed passes and no error-severity diagnostics
  const hasFailedPass = pass_statuses.some(s => s.status === 'failed');
  const hasErrorDiagnostic = diagnostics.some(d => d.severity === 'error');
  const ok = !hasFailedPass && !hasErrorDiagnostic;

  return {
    ok,
    outputs,
    diagnostics,
    pass_statuses,
    pass_outcomes: passOutcomes,
  };
}

/**
 * Topological sort result with cycle detection.
 */
interface TopoSortResult {
  ok: true;
  sortedIds: string[];
}

interface CycleDetected {
  ok: false;
  cycleIds: string[];
}

type TopoResult = TopoSortResult | CycleDetected;

/**
 * Perform topological sort on pipeline passes using Kahn's algorithm.
 *
 * @param passes - Array of pass specifications with depends_on relationships
 * @returns Sorted pass ids, or cycle detection result if a cycle exists
 */
function topologicalSort(passes: PipelinePassSpec[]): TopoResult {
  // Build adjacency list and in-degree count
  const graph = new Map<string, string[]>();  // node -> list of nodes that depend on it
  const inDegree = new Map<string, number>();
  const allIds = new Set<string>();

  // Initialize all nodes
  for (const pass of passes) {
    allIds.add(pass.id);
    if (!graph.has(pass.id)) {
      graph.set(pass.id, []);
    }
    inDegree.set(pass.id, 0);
  }

  // Build edges: for each dependency, add edge from dep -> dependent
  for (const pass of passes) {
    const deps = pass.depends_on || [];
    for (const depId of deps) {
      if (allIds.has(depId)) {
        // Edge from depId to pass.id
        const dependents = graph.get(depId)!;
        dependents.push(pass.id);
        inDegree.set(pass.id, inDegree.get(pass.id)! + 1);
      }
    }
  }

  // Kahn's algorithm: start with nodes that have no dependencies
  const queue: string[] = [];
  for (const id of allIds) {
    if ((inDegree.get(id) || 0) === 0) {
      queue.push(id);
    }
  }

  const sorted: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    const dependents = graph.get(current) || [];
    for (const dependent of dependents) {
      const newDegree = inDegree.get(dependent)! - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) {
        queue.push(dependent);
      }
    }
  }

  // If not all nodes are in sorted list, there's a cycle
  if (sorted.length !== allIds.size) {
    // Find nodes involved in the cycle (those not in sorted list)
    const cycleIds = Array.from(allIds).filter(id => !sorted.includes(id));
    return { ok: false, cycleIds };
  }

  return { ok: true, sortedIds: sorted };
}
