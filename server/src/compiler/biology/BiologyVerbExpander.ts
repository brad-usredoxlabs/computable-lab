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
  labwareId?: string;
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
import type { PlateEventPrimitive } from '../../biology/BiologyVerbExpander.js';

export function createLowerPlateMapPass(): Pass {
  return {
    name: 'lower_plate_map',
    run: async (args: PassRunArgs): Promise<PassResult> => {
      const { state } = args;
      const candidates = (state.candidates || state.extractedEntities || []) as Array<Record<string, unknown>>;
      const newEvents: PlateEventPrimitive[] = [];
      const diagnostics: PassDiagnostic[] = [];

      for (const candidate of candidates) {
        const content = (candidate.content || candidate.text || candidate.raw || '') as string;
        const type = (candidate.type || candidate.kind || '') as string;
        
        // Heuristic: detect plate-map-style candidates
        // Look for well positions (A1-H12) and compound names/catalog numbers
        const wellRegex = /[A-H][1-9][0-2]?/g;
        const wells = content.match(wellRegex) || [];
        const hasCatalog = /CAT\d{4,}/i.test(content) || /\d{4}-\d{2,4}/.test(content);
        
        if ((type === 'plate_map' || type === 'screening_library' || wells.length >= 4 || hasCatalog) && wells.length > 0) {
          const wellMap: Record<string, unknown> = {};
          const lines = content.split(/\r?\n/);
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2 && /[A-H][1-9][0-2]?/.test(parts[0])) {
              wellMap[parts[0]] = {
                compound: parts[1],
                catalog: parts[2] || undefined,
              };
            }
          }
          
          if (Object.keys(wellMap).length > 0) {
            newEvents.push({
              eventId: `evt-plate_map-${Math.random().toString(36).slice(2, 10)}`,
              event_type: 'load_plate',
              details: {
                plate_map: wellMap,
                source_candidate: candidate.id || candidate.label,
              },
            });
          }
        }
      }

      if (newEvents.length > 0) {
        state.events = [...(state.events || []), ...newEvents];
        diagnostics.push({
          level: 'info',
          message: `Lowered ${newEvents.length} plate map candidate(s) to load_plate events.`,
        });
      }

      return { state, diagnostics };
    },
  };
}
