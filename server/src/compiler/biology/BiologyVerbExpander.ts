/**
 * BiologyVerbExpander - Interface and registry for biology verb expanders.
 * 
 * This module defines the contract for verb expanders that lower high-level
 * biology verbs (e.g., 'seed', 'stain', 'incubate') to primitive event types
 * that the ContextEngine already handles.
 */

/**
 * A primitive plate event emitted by a verb expander.
 * Allowed event_types: create_container, add_material, transfer, incubate, mix, read, centrifuge
 */
export interface PlateEventPrimitive {
  eventId: string;                    // unique per emitted event
  event_type: 'create_container' | 'add_material' | 'transfer' | 'incubate' | 'mix' | 'read' | 'centrifuge' | 'load_plate' | 'set_well_contents';
  details: Record<string, unknown>;
  labwareId?: string | undefined;
  t_offset?: string;                  // e.g. 'PT0M', 'PT4H'
}

/**
 * Input to a verb expander.
 */
export interface VerbInput {
  verb: string;
  params: Record<string, unknown>;   // free-form; each expander knows its own shape
}

/**
 * A verb expander lowers a high-level biology verb to primitive events.
 */
export interface BiologyVerbExpander {
  verb: string;
  expand(input: VerbInput): PlateEventPrimitive[];
}

const _registry = new Map<string, BiologyVerbExpander>();

/**
 * Register a verb expander. Throws if already registered.
 */
export function registerVerbExpander(expander: BiologyVerbExpander): void {
  if (_registry.has(expander.verb)) {
    throw new Error(`Verb expander for '${expander.verb}' already registered`);
  }
  _registry.set(expander.verb, expander);
}

/**
 * Get an expander by verb name.
 */
export function getExpander(verb: string): BiologyVerbExpander | undefined {
  return _registry.get(verb);
}

/**
 * Result of a verb-expander lookup — named error, never a silent drop;
 * the caller decides whether an unexpanded step is fatal.
 */
export type ExpanderLookupResult =
  | { ok: true; expander: BiologyVerbExpander }
  | { ok: false; code: 'NO_EXPANDER'; verb: string };

/**
 * Require an expander for the given verb. Returns a typed result:
 * a hit yields `{ ok, expander }`, a miss yields `{ ok: false, code: 'NO_EXPANDER', verb }`.
 */
export function requireExpander(verb: string): ExpanderLookupResult {
  const expander = _registry.get(verb);
  if (expander) {
    return { ok: true, expander };
  }
  return { ok: false, code: 'NO_EXPANDER', verb };
}

/**
 * List all registered verb names, sorted alphabetically.
 */
export function listVerbs(): string[] {
  return Array.from(_registry.keys()).sort();
}

/**
 * Test helper only — do NOT call from production.
 */
export function _resetRegistryForTest(): void {
  _registry.clear();
}

/**
 * Generate a unique event ID for a given verb.
 */
export function makeEventId(verb: string): string {
  return `evt-${verb}-${Math.random().toString(36).slice(2, 10)}`;
}
const plateMapExpander: BiologyVerbExpander = {
  verb: 'plate_map',
  expand(input: VerbInput): PlateEventPrimitive[] {
    const { params } = input;
    const wells = (params.wells || params.data || params.plate_map || []) as Array<Record<string, unknown>>;
    return [{
      eventId: makeEventId('plate_map'),
      event_type: 'load_plate',
      details: { wells: Array.isArray(wells) ? wells : params },
    }];
  },
};

registerVerbExpander(plateMapExpander);
/**
 * Expander for the 'analyze' verb.
 * Lowers 'analyze' to a 'read' event type for the final analysis/readout step.
 */
const analyzeExpander: BiologyVerbExpander = {
  verb: 'analyze',
  expand(input: VerbInput): PlateEventPrimitive[] {
    const { params } = input;
    const eventId = makeEventId('analyze');
    
    return [{
      eventId,
      event_type: 'read',
      details: {
        action: 'analyze',
        ...params,
      },
    }];
  },
};

registerVerbExpander(analyzeExpander);
