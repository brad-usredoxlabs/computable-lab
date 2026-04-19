/**
 * DerivationEngine: interprets derivation-model worksheets and executes steps.
 * 
 * Per spec-009 (derivation-model schema) and spec-068 requirements:
 * - Steps are dispatched to an injected OperatorRegistry by step.op
 * - Maintains a named-value working state
 * - Emits per-step provenance
 * - Produces the model's single output
 * 
 * Engine is pure: no IO, no timers, no random.
 */

import type { Unit } from './units.js';
export type { Unit } from './units.js';

export interface Quantity {
  value: number;
  unit: Unit;
}

export type WorkingValue = number | Quantity | unknown;

export interface DerivationStep {
  op: string;
  // additional op-specific fields (lhs, rhs, from, into, id, min, max, etc.)
  [k: string]: unknown;
}

export interface DerivationModel {
  kind: 'derivation-model';
  id: string;                                          // pattern: ^DM-[A-Za-z0-9_-]+$
  name: string;
  version: number;                                     // integer ≥ 1
  description?: string;
  assumptions?: ReadonlyArray<string>;
  inputs: ReadonlyArray<{
    name: string;
    type: string;                                      // lightweight tag: 'context' | 'volume' | 'concentration' | 'number' | 'quantity' | ...
    required?: boolean;
    description?: string;
  }>;
  output: { name: string; type: string; description?: string };
  steps: ReadonlyArray<DerivationStep>;
}

export interface WorkingState {
  get(name: string): WorkingValue | undefined;
  has(name: string): boolean;
  // Immutable snapshot of all bindings (for operators that need to scan).
  snapshot(): Readonly<Record<string, WorkingValue>>;
}

export interface OperatorResult {
  // Each entry is a write into the working state: updates[name] = value.
  updates: Readonly<Record<string, WorkingValue>>;
}

export interface OperatorRegistry {
  invoke(
    step: DerivationStep,
    state: WorkingState,
  ): { ok: true; result: OperatorResult } | { ok: false; reason: string };
}

export interface DerivationProvenanceEntry {
  step_index: number;
  op: string;
  reads: ReadonlyArray<string>;                        // names the operator read (best-effort)
  writes: ReadonlyArray<string>;                       // names the operator wrote
  step: Readonly<DerivationStep>;                      // the step record, echoed for audit
}

export type DerivationOutcome =
  | {
      ok: true;
      output: WorkingValue;
      output_name: string;
      provenance: ReadonlyArray<DerivationProvenanceEntry>;
      derivation_versions: Readonly<Record<string, number>>;  // {model.id: model.version}
    }
  | {
      ok: false;
      reason: string;
      step_index?: number;
    };

/**
 * Internal mutable implementation of WorkingState.
 */
class WorkingStateImpl implements WorkingState {
  private bindings: Map<string, WorkingValue>;

  constructor(initial?: Readonly<Record<string, WorkingValue>>) {
    this.bindings = new Map(Object.entries(initial ?? {}));
  }

  get(name: string): WorkingValue | undefined {
    return this.bindings.get(name);
  }

  has(name: string): boolean {
    return this.bindings.has(name);
  }

  snapshot(): Readonly<Record<string, WorkingValue>> {
    const result: Record<string, WorkingValue> = {};
    for (const [key, value] of this.bindings.entries()) {
      result[key] = value;
    }
    return result;
  }

  /**
   * Internal method to set a binding.
   */
  set(name: string, value: WorkingValue): void {
    this.bindings.set(name, value);
  }
}

/**
 * DerivationEngine executes derivation-model worksheets.
 * 
 * The engine:
 * 1. Validates required inputs
 * 2. Seeds working state from inputs
 * 3. Iterates through steps, dispatching each to the operator registry
 * 4. Collects the model's output from the final working state
 * 5. Returns outcome with provenance and derivation_versions
 */
export class DerivationEngine {
  private registry: OperatorRegistry;

  constructor(registry: OperatorRegistry) {
    this.registry = registry;
  }

  run(
    model: DerivationModel,
    inputs: Readonly<Record<string, WorkingValue>>,
  ): DerivationOutcome {
    // 1. Input validation: check required inputs
    for (const inputDef of model.inputs) {
      const isRequired = inputDef.required !== false; // default true
      if (isRequired && inputs[inputDef.name] === undefined) {
        return {
          ok: false,
          reason: `missing input: ${inputDef.name}`,
        };
      }
    }

    // 2. Seed working state from inputs
    const state = new WorkingStateImpl(inputs);

    // 3. Step loop
    const provenance: DerivationProvenanceEntry[] = [];

    for (let i = 0; i < model.steps.length; i++) {
      const step = model.steps[i]!;

      // Invoke the operator registry
      const result = this.registry.invoke(step, state);

      if (!result.ok) {
        return {
          ok: false,
          reason: `step ${i} (op=${step.op}) failed: ${result.reason}`,
          step_index: i,
        };
      }

      // Apply updates to working state (last-write-wins on key collision)
      const updates = result.result.updates;
      for (const [name, value] of Object.entries(updates)) {
        state.set(name, value);
      }

      // Compute best-effort reads: scan step's string-valued fields
      // (excluding 'op' and 'into') and include any whose value is a key currently bound in state.
      const reads: string[] = [];
      for (const [key, val] of Object.entries(step)) {
        if (key === 'op' || key === 'into') continue;
        if (typeof val === 'string' && state.has(val)) {
          reads.push(val);
        }
      }

      // Emit provenance entry
      const writes = Object.keys(updates);
      provenance.push({
        step_index: i,
        op: step.op,
        reads,
        writes,
        step,
      });
    }

    // 4. Collect output
    const outputName = model.output.name;
    const output = state.get(outputName);
    if (output === undefined) {
      return {
        ok: false,
        reason: `model output not produced: ${outputName}`,
      };
    }

    // 5. Return success with provenance and derivation_versions
    return {
      ok: true,
      output,
      output_name: outputName,
      provenance,
      derivation_versions: { [model.id]: model.version },
    };
  }
}
