/**
 * The forced-draft instruction must tell the model that bench equipment is
 * requested through `equipmentRequirements` — otherwise "add the water baths to
 * the deck" comes back as prose refusal (the reported failure, 2026-09-19).
 * Plan: 2026-09-19_130430-deck-equipment-via-agent.md, Phase 4.3.
 */
import { describe, expect, it } from 'vitest';
import { FORCED_DRAFT_TOOL_INSTRUCTION } from './AgentOrchestrator.js';

describe('forced-draft instruction — equipment', () => {
  it('names equipmentRequirements and forbids the labware/slot channel', () => {
    expect(FORCED_DRAFT_TOOL_INSTRUCTION).toContain('equipmentRequirements');
    expect(FORCED_DRAFT_TOOL_INSTRUCTION).toContain('equipment:<kind>');
    expect(FORCED_DRAFT_TOOL_INSTRUCTION).toMatch(/NEVER a deck slot|not a deck slot/);
    // Records-first, so the model stops inventing a second copy of the lab's bath.
    expect(FORCED_DRAFT_TOOL_INSTRUCTION).toMatch(/EQP-/);
    expect(FORCED_DRAFT_TOOL_INSTRUCTION).toMatch(/duplicate/i);
    // The "this is a placement, not a refusal" sentence the failure needed.
    expect(FORCED_DRAFT_TOOL_INSTRUCTION).toMatch(/not a refusal/);
  });

  it('keeps the equipment bullet from claiming acceptance', () => {
    expect(FORCED_DRAFT_TOOL_INSTRUCTION).toMatch(/never claim what a piece of equipment accepts/i);
  });
});
