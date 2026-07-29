/**
 * StepGraphCompiler - Transforms protocol step templates into executable event graphs.
 *
 * Each protocol step can be compiled into a sub-graph (an EventGraph with events and
 * labwares). The compiler supports variable substitution via {{variable}} placeholders
 * that are resolved from the provided bindings object.
 *
 * Usage:
 *   const compiler = new StepGraphCompiler();
 *   const graph = compiler.compileStepToGraph(step, bindings);
 *   const allGraphs = compiler.compileProtocolToStepGraphs(steps, bindings);
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A protocol step template that can contain {{variable}} placeholders. */
export interface StepTemplate {
  stepId: string;
  kind: string;
  label?: string;
  ordinal?: number;
  description?: string;
  notes?: string;
  phaseId?: string;
  settings?: Array<Record<string, unknown>>;
  /** Events that make up this step's sub-graph. */
  events?: Array<Record<string, unknown>>;
  /** Labware definitions for this step. */
  labwares?: Array<Record<string, unknown>>;
  /** Freeform properties that may contain {{variable}} placeholders. */
  [key: string]: unknown;
}

/** Bindings map variable names to their concrete values. */
export type Bindings = Record<string, unknown>;

/** The result of compiling a single step into an event graph. */
export interface CompiledStepGraph {
  /** The stepId this graph was compiled from. */
  stepId: string;
  /** The event graph produced from this step. */
  graph: EventGraph;
}

/** An event graph sub-graph for a single protocol step. */
export interface EventGraph {
  id: string;
  name?: string;
  description?: string;
  stepId?: string;
  phaseId?: string;
  events: Array<Record<string, unknown>>;
  labwares: Array<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Variable substitution
// ---------------------------------------------------------------------------

/**
 * Regex that matches {{variable}} placeholders.
 * Supports nested object access: {{foo.bar.baz}}
 */
const VARIABLE_PATTERN = /\{\{([\w.]+)\}\}/g;

/**
 * Recursively replaces {{variable}} placeholders in an object tree
 * using the provided bindings.
 *
 * - String values: searches for {{var}} patterns and replaces them
 * - Arrays: recurses into each element
 * - Objects: recurses into each property
 * - Numbers, booleans, null: returned as-is
 * - Missing variables are left as empty strings
 *
 * @param obj - The value to process (string, object, array, or primitive)
 * @param bindings - Variable name → value map
 * @returns A deep clone of the input with all variables substituted
 */
export function substituteVariables(
  obj: unknown,
  bindings: Bindings,
): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return substituteVariablesInString(obj, bindings);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => substituteVariables(item, bindings));
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteVariables(value, bindings);
    }
    return result;
  }

  // Numbers, booleans, etc. are returned as-is
  return obj;
}

/**
 * Replace all {{variable}} occurrences in a string.
 * Supports dotted paths like {{labware.id}} resolved from nested bindings.
 * Unresolved variables are replaced with an empty string.
 */
function substituteVariablesInString(
  str: string,
  bindings: Bindings,
): string {
  return str.replace(VARIABLE_PATTERN, (_match, variablePath) => {
    const value = resolveBinding(bindings, variablePath);
    if (value === undefined) {
      return '';
    }
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value);
    }
    return String(value);
  });
}

/**
 * Resolve a dotted variable path (e.g. "labware.id") against the bindings.
 */
function resolveBinding(bindings: Bindings, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = bindings;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    const record = current as Record<string, unknown>;
    current = record[part];
    if (current === undefined) {
      return undefined;
    }
  }
  return current;
}

// ---------------------------------------------------------------------------
// StepGraphCompiler
// ---------------------------------------------------------------------------

export class StepGraphCompiler {
  /**
   * Compile a single step template into an EventGraph.
   *
   * The step may contain {{variable}} placeholders in any string field.
   * These are substituted from the provided bindings before the graph is built.
   *
   * @param step - The step template to compile
   * @param bindings - Variable substitutions for {{variable}} placeholders
   * @returns An EventGraph with resolved variables
   */
  compileStepToGraph(step: StepTemplate, bindings: Bindings): CompiledStepGraph {
    // Substitute variables throughout the step template
    const resolved = substituteVariables(step, bindings) as StepTemplate;

    // Build the event graph from the resolved step
    const events = Array.isArray(resolved.events)
      ? resolved.events.map((evt) => this.buildEvent(evt, resolved.stepId))
      : [];

    const labwares = Array.isArray(resolved.labwares)
      ? resolved.labwares
      : [];

    const graph: EventGraph = {
      id: `SGR-${resolved.stepId}`,
      stepId: resolved.stepId,
      events,
      labwares,
    };
    const name = resolved.label ?? resolved.description;
    if (name) graph.name = name;
    if (resolved.description) graph.description = resolved.description;
    if (typeof resolved.phaseId === 'string') graph.phaseId = resolved.phaseId;

    return {
      stepId: resolved.stepId,
      graph,
    };
  }

  /**
   * Normalize a raw event object from a step template into a PlateEvent-like
   * structure with the originating stepId attached.
   */
  private buildEvent(evt: unknown, stepId: string): Record<string, unknown> {
    if (evt === null || typeof evt !== 'object') {
      return {};
    }

    const event = evt as Record<string, unknown>;
    return {
      ...event,
      stepId: event.stepId ?? stepId,
    };
  }

  /**
   * Compile all steps from a protocol into individual event graph sub-graphs.
   *
   * Each step is compiled independently with the same bindings.
   * Steps are processed in ordinal order (by the `ordinal` field, falling back
   * to array position).
   *
   * @param steps - Array of step templates from the protocol
   * @param bindings - Variable substitutions applied to all steps
   * @returns Array of CompiledStepGraph in ordinal order
   */
  compileProtocolToStepGraphs(
    steps: StepTemplate[],
    bindings: Bindings,
  ): CompiledStepGraph[] {
    if (!Array.isArray(steps)) {
      return [];
    }

    // Sort by ordinal (default 0), then by array index
    const sorted = steps
      .map((step, index) => ({ step, index, ordinal: step.ordinal ?? 0 }))
      .sort((a, b) => a.ordinal - b.ordinal || a.index - b.index);

    return sorted.map(({ step }) => this.compileStepToGraph(step, bindings));
  }
}
