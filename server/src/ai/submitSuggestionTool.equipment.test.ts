/**
 * Bench equipment through the agent's emission contract.
 * Plan: 2026-09-19_130430-deck-equipment-via-agent.md, Phase 4.
 *
 * The reported failure was a prose refusal — "I don't have a way to place
 * equipment on the canvas" — because the forced-draft tool had no field in which
 * the model could ASK for equipment. These pin the field, its parse, and the
 * rules the description must carry (equipment is not labware; `equipment:<kind>`
 * for a generic kind; never a deck slot).
 */
import { describe, expect, it } from 'vitest';
import {
  AGENT_INTENT_TOOL_DEF,
  parseSubmitSuggestionArgs,
  SUBMIT_SUGGESTION_TOOL_DEF,
} from './submitSuggestionTool.js';

const USAGE = { promptTokens: 10, completionTokens: 20 };

interface JsonSchemaish {
  properties: Record<string, { type?: string; description?: string; items?: JsonSchemaish }>;
}

function propsOf(def: { function: { parameters: unknown } }): Record<string, { type?: string; description?: string; items?: JsonSchemaish }> {
  return (def.function.parameters as JsonSchemaish).properties;
}

describe('equipment emission contract', () => {
  it('exposes equipmentRequirements on the forced-draft tool and the agent_intent menu', () => {
    expect(SUBMIT_SUGGESTION_TOOL_DEF.function.parameters).toHaveProperty('properties.equipmentRequirements');
    expect(propsOf(AGENT_INTENT_TOOL_DEF).equipmentRequirements).toBeDefined();
  });

  it('states the rules the model must follow for equipment', () => {
    const description = propsOf(SUBMIT_SUGGESTION_TOOL_DEF).equipmentRequirements?.description ?? '';
    // Bench equipment, not labware, and never a deck slot.
    expect(description).toMatch(/equipment/i);
    expect(description).toMatch(/not labware|never labware|is not labware/i);
    expect(description).toMatch(/slot/i);
    // The generic-kind spelling, and the records-first rule.
    expect(description).toContain('equipment:');
    expect(description).toMatch(/record/i);
    // Settings are keyed by the class settingsDefinition.
    expect(description).toMatch(/settings/i);
  });

  it('advertises NO seat relationship the editor cannot render yet', () => {
    // Task 4.2: until seating ships, the contract must not offer seatOn/placedIn.
    const item = propsOf(SUBMIT_SUGGESTION_TOOL_DEF).equipmentRequirements?.items as
      | { properties?: Record<string, unknown> }
      | undefined;
    expect(item?.properties).toBeDefined();
    expect(item?.properties).not.toHaveProperty('seatOn');
    expect(item?.properties).not.toHaveProperty('placedIn');
    expect(Object.keys(item?.properties ?? {})).not.toContain('seat');
  });

  it('parses equipmentRequirements onto AgentResult', () => {
    const r = parseSubmitSuggestionArgs(
      {
        equipmentRequirements: [
          { classCurie: 'equipment:water_bath', handle: 'bath 1', settings: { temperature_c: 55 } },
          { classCurie: 'equipment:water_bath', handle: 'bath 2', settings: { temperature_c: 70 } },
        ],
      },
      USAGE,
    );
    expect(r.equipmentRequirements).toEqual([
      { classCurie: 'equipment:water_bath', handle: 'bath 1', settings: { temperature_c: 55 } },
      { classCurie: 'equipment:water_bath', handle: 'bath 2', settings: { temperature_c: 70 } },
    ]);
    // Equipment is not mis-filed as labware.
    expect(r.labwareRequirements ?? []).toEqual([]);
  });

  it('parses a records-first equipment request (a lab-owned EQP- id)', () => {
    const r = parseSubmitSuggestionArgs(
      { equipmentRequirements: [{ recordId: 'EQP-WATER-BATH', handle: 'the lab bath', reason: 'exists in the lab' }] },
      USAGE,
    );
    expect(r.equipmentRequirements?.[0]?.recordId).toBe('EQP-WATER-BATH');
  });

  it('carries the attribution source when the model gives one', () => {
    const r = parseSubmitSuggestionArgs(
      {
        equipmentRequirements: [
          { classCurie: 'equipment:heater_shaker', source: 'user description' },
        ],
      },
      USAGE,
    );
    expect(r.equipmentRequirements?.[0]?.source).toBe('user description');
  });

  it('omits the field entirely when no equipment was requested', () => {
    const r = parseSubmitSuggestionArgs({ events: [] }, USAGE);
    expect(r.equipmentRequirements).toBeUndefined();
  });

  it('drops malformed entries instead of minting phantom equipment', () => {
    const r = parseSubmitSuggestionArgs(
      { equipmentRequirements: [{}, { handle: 'no class or record' } as never, 'water bath' as never] },
      USAGE,
    );
    expect(r.equipmentRequirements ?? []).toEqual([]);
  });

  it('keeps a misfiled equipment classCurie out of labwareRequirements', () => {
    // Guards the labwareRequirement.ts silent `tubeset_24` collapse: an
    // `equipment:` token arriving in labwareRequirements must not become labware.
    const r = parseSubmitSuggestionArgs(
      { labwareRequirements: [{ classCurie: 'equipment:water_bath' }] },
      USAGE,
    );
    expect(r.labwareRequirements ?? []).toEqual([]);
    expect(r.equipmentRequirements?.[0]?.classCurie).toBe('equipment:water_bath');
  });
});
