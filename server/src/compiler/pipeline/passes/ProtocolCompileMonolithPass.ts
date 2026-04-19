/**
 * ProtocolCompileMonolithPass: wraps the existing ProtocolCompiler as a single opaque pass.
 *
 * This pass provides a thin wrapper around ProtocolCompiler, allowing it to be
 * executed as part of a compile pipeline without refactoring the 643-line compiler.
 */

import type { Pass, PassResult, PassDiagnostic } from '../types.js';

/**
 * Input shape expected by the protocol compile monolith pass.
 */
export interface ProtocolCompileInput {
  protocolRecord: Record<string, unknown>;
  bindings?: Record<string, unknown> | undefined;
  context?: Record<string, unknown> | undefined;
}

/**
 * Options for creating the ProtocolCompileMonolithPass.
 * Either a runCompiler override (for testing) or a store (for production) must be provided.
 */
export interface ProtocolCompileMonolithPassOptions {
  /**
   * Optional override for the compiler function.
   * When provided, this function is called instead of instantiating ProtocolCompiler.
   * Primarily for unit testing.
   */
  runCompiler?: (input: ProtocolCompileInput) => unknown | Promise<unknown>;

  /**
   * Store instance for the default compiler implementation.
   * Required if runCompiler is not provided.
   */
  store?: unknown;
}

/**
 * Create a ProtocolCompileMonolithPass.
 *
 * @param options - Options for the pass (runCompiler override or store)
 * @returns A Pass with id 'protocol_compile_monolith' and family 'project'
 * @throws Error if neither runCompiler nor store is provided
 */
export function createProtocolCompileMonolithPass(options?: ProtocolCompileMonolithPassOptions): Pass {
  const { runCompiler, store } = options ?? {};

  if (!runCompiler && !store) {
    throw new Error('ProtocolCompileMonolithPass requires either runCompiler or store option');
  }

  // Default compiler function: uses ProtocolCompiler class
  const defaultCompiler = async (input: ProtocolCompileInput): Promise<unknown> => {
    if (!store) {
      throw new Error('Store not provided for default compiler');
    }
    // Dynamically import to avoid circular dependencies
    const { ProtocolCompiler } = await import('../../protocol/ProtocolCompiler.js');
    const compiler = new ProtocolCompiler(store as never);
    return compiler.lowerToLabProtocol({
      protocolEnvelope: input.protocolRecord as never,
      bindings: input.bindings as never,
      context: input.context as never,
    });
  };

  const executeCompiler = runCompiler ?? defaultCompiler;

  return {
    id: 'protocol_compile_monolith',
    family: 'project',
    async run({ state }): Promise<PassResult> {
      // Validate input
      const protocolRecord = state.input.protocol;
      if (!protocolRecord) {
        const diagnostic: PassDiagnostic = {
          severity: 'error',
          code: 'missing_input',
          message: 'state.input.protocol not provided',
          pass_id: 'protocol_compile_monolith',
        };
        return { ok: false, diagnostics: [diagnostic] };
      }

      // Build input for the compiler
      const input: ProtocolCompileInput = {
        protocolRecord: protocolRecord as Record<string, unknown>,
        bindings: state.input.bindings as Record<string, unknown> | undefined,
        context: state.input.context as Record<string, unknown> | undefined,
      };

      // Execute the compiler
      let compilerResult: unknown;
      try {
        compilerResult = await executeCompiler(input);
      } catch (error) {
        const diagnostic: PassDiagnostic = {
          severity: 'error',
          code: 'protocol_compile_failed',
          message: error instanceof Error ? error.message : String(error),
          pass_id: 'protocol_compile_monolith',
        };
        return { ok: false, diagnostics: [diagnostic] };
      }

      // Check for error status or error diagnostics in the result
      const result = compilerResult as { status?: string; diagnostics?: Array<{ severity: string }> };
      const hasErrorStatus = result.status === 'error';
      const hasErrorDiagnostic = Array.isArray(result.diagnostics) &&
        result.diagnostics.some((d: { severity?: string }) => d.severity === 'error');

      if (hasErrorStatus || hasErrorDiagnostic) {
        const diagnostic: PassDiagnostic = {
          severity: 'error',
          code: 'protocol_compile_failed',
          message: 'ProtocolCompiler returned error status',
          pass_id: 'protocol_compile_monolith',
        };
        return { ok: false, output: compilerResult, diagnostics: [diagnostic] };
      }

      // Success
      return { ok: true, output: compilerResult };
    },
  };
}
