/**
 * Compile-pipeline Pass types and related interfaces.
 *
 * This module defines the contract for passes that can be executed
 * as part of a compile pipeline, and the state they operate on.
 */

/**
 * Classification of what a pass does in the pipeline.
 */
export type PassFamily =
  | 'parse'
  | 'normalize'
  | 'disambiguate'
  | 'validate'
  | 'derive_context'
  | 'expand'
  | 'project'
  | 'emit';

/**
 * A diagnostic message emitted by a pass during execution.
 */
export interface PassDiagnostic {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  pass_id: string;
  details?: Record<string, unknown>;
}

/**
 * The state available to a pass during execution.
 * Contains the original input, derived context values, side-channel metadata,
 * outputs from previous passes, and any diagnostics collected so far.
 */
export interface PipelineState {
  readonly input: Readonly<Record<string, unknown>>;
  readonly context: Readonly<Record<string, unknown>>;     // derived context values (see 30-context.md)
  readonly meta: Readonly<Record<string, unknown>>;        // side-channel: derivation_versions, derivation_provenance, branch, etc.
  readonly outputs: ReadonlyMap<string, unknown>;          // pass_id → output (minus merged context/meta patches)
  readonly diagnostics: ReadonlyArray<PassDiagnostic>;
}

/**
 * Arguments passed to a pass when it is executed.
 */
export interface PassRunArgs {
  pass_id: string;
  state: PipelineState;
}

/**
 * Possible outcomes for a pass, matching compiler-specs/60-compiler.md §6.
 */
export type CompilerDiagnosticOutcome =
  | 'auto-resolved'
  | 'needs-confirmation'
  | 'needs-missing-fact'
  | 'policy-blocked'
  | 'execution-blocked';

/**
 * Result of running a pass.
 */
export interface PassResult {
  ok: boolean;
  output?: unknown;                                         // may include { context?, meta?, ... } patch keys
  diagnostics?: PassDiagnostic[];
  outcome?: CompilerDiagnosticOutcome;                      // optional per-pass outcome (see 60-compiler.md §6)
}

/**
 * A pass is a unit of work in a compile pipeline.
 * Each pass has an id, a family classification, and a run method.
 * The run method may be synchronous or asynchronous.
 */
export interface Pass {
  id: string;
  family: PassFamily;
  run(args: PassRunArgs): Promise<PassResult> | PassResult;
}
