/**
 * Deterministic intent parser for add_material prompts.
 *
 * This module provides a pure function to parse user prompts and extract
 * structured intent data for add_material operations, without relying on LLMs.
 */

import type { ResolvedMention } from '../resolveMentions.js';

export type IntentVerb = 'add_material' | 'unknown';

export interface ParsedIntent {
  verb: IntentVerb;
  volume?: { value: number; unit: 'uL' | 'mL' | 'L' };
  wells?: string[];                          // e.g. ['A1']
  materialRef?: {
    kind: 'material-spec' | 'aliquot' | 'material';
    id: string;
    label: string;
  };
  labwareRef?:
    | { kind: 'instance'; id: string; label: string }
    | { kind: 'definition'; id: string; label: string }
    | { kind: 'text'; hint: string };        // free-text fallback (e.g. "12-well reservoir")
  postActions: Array<'set_source_location'>;
  unresolvedSlots: Array<'volume' | 'wells' | 'material' | 'labware' | 'labwareInstance'>;
  rawPrompt: string;
}

/**
 * Detects if the prompt contains a verb that indicates add_material intent.
 * Matches: add, dispense, pipette, or "transfer in" (but not plain "transfer").
 */
function detectVerb(prompt: string): IntentVerb {
  const verbRegex = /\b(add|dispense|pipette|transfer\s+in)\b/i;
  return verbRegex.test(prompt) ? 'add_material' : 'unknown';
}

/**
 * Extracts volume from the prompt.
 * Matches patterns like: 100uL, 50 mL, 10µL, 200ul, 1L, etc.
 * Returns the first match found, normalized to standard units.
 */
function extractVolume(prompt: string): { value: number; unit: 'uL' | 'mL' | 'L' } | undefined {
  // Regex to match number followed by unit (with optional whitespace)
  // Units: uL, ul, µL, mL, ml, L
  const volumeRegex = /(\d+(?:\.\d+)?)\s*(uL|ul|µL|µl|microliter|microliters|mL|ml|milliliter|milliliters|L|l|liter|liters)\b/i;
  
  const match = prompt.match(volumeRegex);
  if (!match) return undefined;

  const value = parseFloat(match[1] as string);
  const unitRaw = match[2] as string;
  if (!unitRaw) return undefined;

  const unitLower = unitRaw.toLowerCase();

  // Normalize units
  let unit: 'uL' | 'mL' | 'L';
  if (unitLower === 'ul' || unitLower === 'µl' || unitLower.indexOf('micro') === 0) {
    unit = 'uL';
  } else if (unitLower === 'ml' || unitLower.indexOf('milli') === 0) {
    unit = 'mL';
  } else {
    // L, l, liter, liters
    unit = 'L';
  }

  return { value, unit };
}

/**
 * Extracts well identifiers from the prompt.
 * Matches patterns like: A1, H12, well A1, etc.
 * Returns all matches, deduplicated, preserving first-seen order.
 */
function extractWells(prompt: string): string[] {
  // Match well identifiers: A-H (case insensitive) followed by 1-12
  const wellRegex = /\b([A-Ha-h])(1[0-2]|[1-9])\b/g;
  const matches: string[] = [];
  const seen = new Set<string>();

  let match;
  while ((match = wellRegex.exec(prompt)) !== null) {
    // Uppercase the letter
    const letter = match[1];
    const number = match[2];
    if (!letter || !number) continue;
    const well = letter.toUpperCase() + number;
    if (!seen.has(well)) {
      seen.add(well);
      matches.push(well);
    }
  }

  return matches;
}

/**
 * Extracts material reference from resolved mentions.
 * Takes the first mention with kind material-spec, aliquot, or material.
 */
function extractMaterialRef(resolvedMentions: ResolvedMention[]): {
  kind: 'material-spec' | 'aliquot' | 'material';
  id: string;
  label: string;
} | undefined {
  for (const mention of resolvedMentions) {
    if (mention.kind === 'material-spec' || mention.kind === 'aliquot' || mention.kind === 'material') {
      return {
        kind: mention.kind,
        id: mention.id,
        label: mention.label,
      };
    }
  }
  
  return undefined;
}

/**
 * Extracts labware reference using a three-tier approach:
 * 1. Resolved mention with kind 'labware'
 * 2. Text phrase matching pattern like "12-well reservoir"
 * 3. Neither -> undefined
 */
function extractLabwareRef(prompt: string, resolvedMentions: ResolvedMention[]): {
  kind: 'instance' | 'definition' | 'text';
  id?: string;
  label?: string;
  hint?: string;
} | undefined {
  // Tier 1: Check for resolved labware mention
  for (const mention of resolvedMentions) {
    if (mention.kind === 'labware') {
      if (mention.id.startsWith('def:')) {
        return {
          kind: 'definition',
          id: mention.id.slice(4), // Remove 'def:' prefix
          label: mention.label,
        };
      } else {
        return {
          kind: 'instance',
          id: mention.id,
          label: mention.label,
        };
      }
    }
  }

  // Tier 2: Check for text phrase pattern
  const labwareTextRegex = /(\d+)[- ]?well\s+(reservoir|plate)/i;
  const match = prompt.match(labwareTextRegex);
  if (match) {
    return {
      kind: 'text',
      hint: match[0].toLowerCase(),
    };
  }

  // Tier 3: No labware found
  return undefined;
}

/**
 * Checks if the prompt contains phrases indicating post-actions.
 * Currently only supports 'set_source_location'.
 */
function extractPostActions(prompt: string): Array<'set_source_location'> {
  const postActions: Array<'set_source_location'> = [];
  
  // Check for "add to the source" or "add it to the source location" or "set as source"
  const sourceLocationRegex = /add(\s+it)?\s+to\s+the\s+source(\s+location)?/i;
  const setSourceRegex = /set\s+(it\s+)?as\s+source/i;
  
  if (sourceLocationRegex.test(prompt) || setSourceRegex.test(prompt)) {
    postActions.push('set_source_location');
  }
  
  return postActions;
}

/**
 * Parses a user prompt to extract structured intent for add_material operations.
 *
 * @param prompt - The user's natural language prompt
 * @param resolvedMentions - Array of resolved mentions from the prompt
 * @returns A ParsedIntent object with extracted fields
 */
export function parseIntent(prompt: string, resolvedMentions: ResolvedMention[]): ParsedIntent {
  const unresolvedSlots: Array<'volume' | 'wells' | 'material' | 'labware' | 'labwareInstance'> = [];
  
  // Detect verb
  const verb = detectVerb(prompt);
  
  // Extract volume
  const volume = extractVolume(prompt);
  if (!volume) {
    unresolvedSlots.push('volume');
  }
  
  // Extract wells
  const wells = extractWells(prompt);
  if (wells.length === 0) {
    unresolvedSlots.push('wells');
  }
  
  // Extract material reference
  const materialRef = extractMaterialRef(resolvedMentions);
  if (!materialRef) {
    unresolvedSlots.push('material');
  }
  
  // Extract labware reference
  const labwareRefRaw = extractLabwareRef(prompt, resolvedMentions);
  let labwareRef: ParsedIntent['labwareRef'];
  
  if (labwareRefRaw) {
    if (labwareRefRaw.kind === 'definition') {
      labwareRef = {
        kind: 'definition',
        id: labwareRefRaw.id!,
        label: labwareRefRaw.label!,
      };
      unresolvedSlots.push('labwareInstance');
    } else if (labwareRefRaw.kind === 'instance') {
      labwareRef = {
        kind: 'instance',
        id: labwareRefRaw.id!,
        label: labwareRefRaw.label!,
      };
    } else if (labwareRefRaw.kind === 'text') {
      labwareRef = {
        kind: 'text',
        hint: labwareRefRaw.hint!,
      };
      unresolvedSlots.push('labwareInstance');
    }
  } else {
    unresolvedSlots.push('labware');
  }
  
  // Extract post actions
  const postActions = extractPostActions(prompt);
  
  // If verb is unknown, return minimal result with empty unresolvedSlots
  if (verb === 'unknown') {
    return {
      verb: 'unknown',
      postActions: [],
      unresolvedSlots: [],
      rawPrompt: prompt,
    };
  }
  
  // Build the result
  const result: ParsedIntent = {
    verb,
    postActions,
    unresolvedSlots,
    rawPrompt: prompt,
  };
  
  if (volume) result.volume = volume;
  if (wells.length > 0) result.wells = wells;
  if (materialRef) result.materialRef = materialRef;
  if (labwareRef) result.labwareRef = labwareRef;
  
  return result;
}
