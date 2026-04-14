/**
 * Compile resolved intent to PlateEventDraft objects.
 *
 * This module provides a pure function to compile a parsed intent
 * into event drafts, bypassing the LLM when all slots are filled.
 */

import type { ParsedIntent } from './parseIntent.js';
import type { ResolvedMention } from '../resolveMentions.js';

/**
 * Minimal draft event shape matching the app's PlateEvent /
 * AddMaterialDetails contract. Defined inline because server/
 * does not import from app/.
 * 
 * This type is compatible with PlateEventProposal from types.ts
 * to allow direct assignment to AgentResult.events.
 */
export interface PlateEventDraft {
  eventId: string;                    // 'evt-compiler-' + short random
  event_type: 'add_material';
  verb: string;                       // 'add_material'
  vocabPackId: string;                // 'default' for compiler-bypassed events
  details: {
    labwareId?: string;
    wells: string[];
    material_spec_ref?: string;
    aliquot_ref?: string;
    material_instance_ref?: string;
    material_ref?: string;
    volume: { value: number; unit: string };
  };
  t_offset?: string;                  // default 'PT0M'
  provenance: {
    actor: 'ai-agent';
    timestamp: string;
    method: 'automated';
    actionGroupId: string;
  };
}

export interface CompileSuccess {
  bypass: true;
  events: PlateEventDraft[];
  notes: string[];
  labwareAdditions?: Array<{ recordId: string; reason?: string }>;
}

export interface CompileSkip {
  bypass: false;
  reason: string;
}

export interface CompileDeps {
  searchLabwareByHint?: (hint: string) => Promise<Array<{ recordId: string; title: string }>>;
}

/**
 * Compile a parsed intent to events.
 *
 * Returns {bypass: true, events, notes} if all required slots are filled
 * and labware is a concrete instance.
 * Returns {bypass: false, reason} if any slot is missing or labware is not an instance.
 */
export async function compileToEvents(
  intent: ParsedIntent,
  _resolvedMentions: ResolvedMention[],
  deps?: CompileDeps,
): Promise<CompileSuccess | CompileSkip> {
  // Check verb
  if (intent.verb !== 'add_material') {
    return { bypass: false, reason: 'verb not supported by compiler' };
  }

  // Check unresolved slots in priority order
  if (intent.unresolvedSlots.includes('volume')) {
    return { bypass: false, reason: 'missing volume' };
  }
  if (intent.unresolvedSlots.includes('wells')) {
    return { bypass: false, reason: 'missing wells' };
  }
  if (intent.unresolvedSlots.includes('material')) {
    return { bypass: false, reason: 'missing material' };
  }
  if (intent.unresolvedSlots.includes('labware')) {
    return { bypass: false, reason: 'missing labware' };
  }
  // Note: labwareInstance is no longer a blocker - we handle definition and text kinds below

  // Check labwareRef kind and handle accordingly
  if (!intent.labwareRef) {
    return { bypass: false, reason: 'missing labware' };
  }

  // Determine the labware recordId based on kind
  let labwareAdditions: Array<{ recordId: string; reason?: string }> | undefined;

  if (intent.labwareRef.kind === 'instance') {
    // Instance: no labwareAdditions needed
  } else if (intent.labwareRef.kind === 'definition') {
    // Definition: use the id directly as the recordId
    labwareAdditions = [{
      recordId: intent.labwareRef.id,
      reason: `compiler auto-create for definition ${intent.labwareRef.id}`,
    }];
  } else if (intent.labwareRef.kind === 'text') {
    // Text: need to look up the hint
    const searchFn = deps?.searchLabwareByHint;
    if (!searchFn) {
      return { bypass: false, reason: `no labware lookup available for hint: ${intent.labwareRef.hint}` };
    }
    const results = await searchFn(intent.labwareRef.hint);
    if (results.length === 0) {
      return { bypass: false, reason: `labware not found in record store: ${intent.labwareRef.hint}` };
    }
    const firstResult = results[0];
    if (!firstResult) {
      return { bypass: false, reason: `labware lookup returned empty result` };
    }
    labwareAdditions = [{
      recordId: firstResult.recordId,
      reason: `compiler auto-create for hint "${intent.labwareRef.hint}" -> ${firstResult.title}`,
    }];
  } else {
    return { bypass: false, reason: 'labware is not a concrete instance' };
  }

  // All checks passed - build the event
  const eventId = 'evt-compiler-' + Math.random().toString(36).slice(2, 10);
  const labwareId = 'lwi-compiler-' + Math.random().toString(36).slice(2, 10);
  
  // Determine which material ref field to use
  // Note: wells and volume are guaranteed to be defined at this point due to earlier checks
  const wells = intent.wells;
  const volume = intent.volume;
  if (!wells || !volume) {
    return { bypass: false, reason: 'internal error: wells or volume missing after validation' };
  }
  
  const details: PlateEventDraft['details'] = {
    labwareId: labwareId,
    wells,
    volume,
  };

  if (intent.materialRef) {
    switch (intent.materialRef.kind) {
      case 'material-spec':
        details.material_spec_ref = intent.materialRef.id;
        break;
      case 'aliquot':
        details.aliquot_ref = intent.materialRef.id;
        break;
      case 'material':
        details.material_ref = intent.materialRef.id;
        break;
    }
  }

  const notes: string[] = ['Compiled by deterministic intent parser (bypassed LLM)'];
  
  // Check for post-actions
  if (intent.postActions.includes('set_source_location')) {
    notes.push('Post-action requested: set_source_location (not yet implemented by compiler)');
  }

  const event: PlateEventDraft = {
    eventId,
    event_type: 'add_material',
    verb: 'add_material',
    vocabPackId: 'default',
    t_offset: 'PT0M',
    details,
    provenance: {
      actor: 'ai-agent',
      timestamp: new Date().toISOString(),
      method: 'automated',
      actionGroupId: 'compiler-bypass',
    },
  };

  const result: CompileSuccess = {
    bypass: true,
    events: [event],
    notes,
  };
  if (labwareAdditions && labwareAdditions.length > 0) {
    result.labwareAdditions = labwareAdditions;
  }
  return result;
}
