/**
 * DeriveContextPass: invokes DerivationEngine for a configured derivation model.
 * 
 * Per spec-073, this pass family is the ONLY authorized entry point for
 * DerivationEngine. The pass:
 * - Reads inputs via an inputSelector from state.context
 * - Invokes the DerivationEngine with a configured model
 * - Writes the single output via an outputWriter
 * - Threads derivation_versions (Record<string, number>) through state.meta
 * - Appends provenance entries to state.meta.derivation_provenance
 */

import type { Pass, PassRunArgs, PassResult } from '../types.js';
import type { DerivationEngine, DerivationModel, WorkingValue } from '../../derive/DerivationEngine.js';

export interface DeriveContextPassArgs {
  passId: string;                                   // e.g. 'derive_corrected_fluorescence'
  model: DerivationModel;
  engine: DerivationEngine;
  inputSelector: (context: Record<string, unknown>) => Record<string, WorkingValue> | { ok: false; reason: string };
  outputWriter: (context: Record<string, unknown>, outputName: string, outputValue: WorkingValue) => Record<string, unknown>;
}

/**
 * Creates a derive_context pass that invokes the DerivationEngine.
 * 
 * @param args - Configuration for the pass
 * @returns A Pass with family 'derive_context'
 */
export function createDeriveContextPass(args: DeriveContextPassArgs): Pass {
  return {
    id: args.passId,
    family: 'derive_context',
    run: async (runArgs: PassRunArgs): Promise<PassResult> => {
      const { state } = runArgs;

      // 1. Call inputSelector to get inputs from context
      const inputResult = args.inputSelector(state.context);
      
      if (!inputResult || 'ok' in inputResult && inputResult.ok === false) {
        // Input selector failed
        const reason = 'ok' in inputResult ? inputResult.reason : 'unknown error';
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'derive_context_input_missing',
              message: `Input selector failed: ${reason}`,
              pass_id: args.passId,
            },
          ],
          outcome: 'needs-missing-fact',
        };
      }

      const inputs = inputResult as Record<string, WorkingValue>;

      // 2. Invoke the DerivationEngine
      const outcome = args.engine.run(args.model, inputs);

      if (!outcome.ok) {
        // Engine failed
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'derive_context_engine_failed',
              message: `DerivationEngine failed: ${outcome.reason}`,
              pass_id: args.passId,
              details: {
                step_index: outcome.step_index,
                model_id: args.model.id,
              },
            },
          ],
          outcome: 'execution-blocked',
        };
      }

      // 3. Success: write output to context
      const newContext = args.outputWriter(state.context, outcome.output_name, outcome.output);

      // 4. Merge derivation_versions into meta (last-write-wins on collision)
      const currentVersions = (state.meta.derivation_versions as Record<string, number>) || {};
      const newVersions: Record<string, number> = { ...currentVersions };
      
      // Ensure all versions are integers as per spec-009 / spec-068
      for (const [modelId, version] of Object.entries(outcome.derivation_versions)) {
        if (typeof version !== 'number' || !Number.isInteger(version)) {
          return {
            ok: false,
            diagnostics: [
              {
                severity: 'error',
                code: 'derive_context_invalid_version',
                message: `derivation_versions for ${modelId} must be an integer, got ${typeof version}: ${version}`,
                pass_id: args.passId,
              },
            ],
            outcome: 'execution-blocked',
          };
        }
        newVersions[modelId] = version;
      }

      // 5. Append provenance entries to meta
      const currentProvenance = (state.meta.derivation_provenance as Array<unknown>) || [];
      const newProvenance = [...currentProvenance, ...outcome.provenance];

      // 6. Return result with patched context and meta
      return {
        ok: true,
        output: {
          context: newContext,
          meta: {
            derivation_versions: newVersions,
            derivation_provenance: newProvenance,
          },
        },
      };
    },
  };
}
