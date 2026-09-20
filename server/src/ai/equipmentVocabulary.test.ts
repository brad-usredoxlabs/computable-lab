/**
 * The emitter's advertised equipment vocabulary must match the data.
 *
 * Failure this pins (2026-09-19): the forced-draft tool description offered
 * `equipment:heater_shaker, equipment:vortex, equipment:qpcr,
 * equipment:plate_reader` while the registry defined none of them — so the model
 * picked a kind with no settingsDefinition, no capability record and no glyph,
 * and the draft rendered as an unknown-type tile. A vocabulary the prompt offers
 * must be a vocabulary the system can answer for.
 */
import { describe, expect, it } from 'vitest';
import { AGENT_INTENT_TOOL_DEF, SUBMIT_SUGGESTION_TOOL_DEF } from './submitSuggestionTool.js';
import { getEquipmentKindRegistry } from '../registry/EquipmentKindRegistry.js';
import { FORCED_DRAFT_TOOL_INSTRUCTION } from './AgentOrchestrator.js';

/** Every `equipment:<token>` spelled anywhere in the emission contract. */
function advertisedKinds(text: string): string[] {
  const out = new Set<string>();
  for (const match of text.matchAll(/equipment:([a-z][a-z0-9_]*)/g)) {
    if (match[1]) out.add(match[1]);
  }
  return [...out].sort();
}

const contractText = [
  JSON.stringify(SUBMIT_SUGGESTION_TOOL_DEF.function.parameters),
  JSON.stringify(AGENT_INTENT_TOOL_DEF.function.parameters),
  FORCED_DRAFT_TOOL_INSTRUCTION,
].join('\n');

const advertised = advertisedKinds(contractText);

describe('advertised equipment vocabulary', () => {
  it('advertises at least the kinds the lab actually uses', () => {
    expect(advertised).toEqual(expect.arrayContaining([
      'water_bath',
      'heat_block',
      'heater_shaker',
      'orbital_shaker',
      'rocker',
      'vortex_mixer',
      'qpcr',
      'plate_reader',
    ]));
  });

  it('every advertised kind is a registry definition (CL: CURIE)', () => {
    const registry = getEquipmentKindRegistry();
    const missing = advertised.filter((kind) => !registry.get(`CL:${kind}`));
    expect(missing, `advertised but undefined: ${missing.join(', ')}`).toEqual([]);
  });

  it('every advertised kind carries the data a minted instance needs', () => {
    const registry = getEquipmentKindRegistry();
    for (const kind of advertised) {
      const def = registry.get(`CL:${kind}`);
      expect(def, kind).toBeDefined();
      // A glyph hint, or the deck cannot draw it (it drew a generic box before).
      expect(def?.instrumentKind, `${kind} has no render hint`).toBeTruthy();
      // Acceptance data must exist somewhere, or every placement resolves
      // `unknown` and the user is asked about an instrument we just claimed to know.
      expect(def?.name, kind).toBeTruthy();
    }
  });

  it('every advertised kind has a capability record (so acceptance is answerable)', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { dirname, join, resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const { parse } = await import('yaml');
    const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../records/seed/equipment-capability');
    const referenced = new Set<string>();
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.yaml')) continue;
      const payload = parse(readFileSync(join(dir, name), 'utf8')) as { equipmentClassRef?: { id?: string } };
      const id = payload.equipmentClassRef?.id;
      if (id?.startsWith('CL:')) referenced.add(id.slice(3));
      // A capability declared on an EQC- class that a kind DECLARES as its
      // realization also answers for that kind.
      for (const def of getEquipmentKindRegistry().list()) {
        if (def.classRealizations.includes(id ?? '')) referenced.add(def.id.slice(3));
      }
    }
    const uncovered = advertised.filter((kind) => !referenced.has(kind));
    expect(uncovered, `advertised but no capability record: ${uncovered.join(', ')}`).toEqual([]);
  });
});
