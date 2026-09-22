/**
 * Server-side end-to-end for the reported defect (Brad, 2026-09-21): "Add 200 µL
 * of DMEM" ghosted as 200 *counts* of DMEM. The materials[] schema had a count
 * slot but no volume slot, so a volume-dosed material reached for `count` and
 * dropped the unit; recovery copied bare `count` verbatim. The reconcile pass
 * reads the unit the biologist actually spoke (the prompt + the event note) and
 * moves the amount to the `volume` field, so the draft ghosts a volume.
 *
 * This drives the real forced-tool orchestrator with a stubbed model emitting
 * the observed draft shape, so it proves the full draft pipeline (not just the
 * helper) converts the misfiled count to a volume.
 */
import { describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { AGENT_INTENT_TOOL_NAME } from './submitSuggestionTool.js';
import type { InferenceClient } from './types.js';
import * as runChatbotCompileModule from './runChatbotCompile.js';

describe('draft-friction: a volume the model misfiled as a count is healed (2026-09-21)', () => {
  it('converts "Add 200uL of DMEM" from a count to a volume in the final draft', async () => {
    vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
      events: [],
      labwareAdditions: [],
      unresolvedRefs: [],
      diagnostics: [{ severity: 'error', code: 'CONFIG_MISSING', message: 'no extractor', pass_id: 'extract_entities' }],
      terminalArtifacts: { events: [], directives: [], gaps: [] },
      outcome: 'error',
    });

    // The exact draft shape observed live: the dose lives in the invented
    // `materials[]` array as `count` (no volume slot existed), and the event
    // note preserves "Adding 200 µL of DMEM".
    const completeStream = vi.fn(async function* (_request: unknown) {
      yield {
        id: 'resp-dmem',
        choices: [{
          index: 0,
          delta: {
            role: 'assistant',
            tool_calls: [{
              index: 0,
              id: 'call-dmem',
              type: 'function',
              function: {
                name: AGENT_INTENT_TOOL_NAME,
                arguments: JSON.stringify({
                  intent: 'event_graph',
                  events: [{
                    event_type: 'add_material',
                    verb: 'add_material',
                    details: {
                      labwareId: 'req:CL:96_well_plate:mu9azzva:if7jwo',
                      wells: ['A2'],
                      material_ref: { kind: 'local', label: 'DMEM' },
                    },
                    materials: [
                      { slot: 'reagent', role: 'solvent', ref: { mint: { label: 'DMEM', domain: 'media' } }, count: 200 },
                    ],
                    notes: 'Adding 200 µL of DMEM to A2.',
                  }],
                }),
              },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      };
    });

    const inferenceClient: InferenceClient = { complete: vi.fn(), completeStream };
    // forced-tool (the event-editor surface) — the compiler preflight is skipped.
    const orchestrator = createAgentOrchestrator(
      inferenceClient,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2, draftFlowMode: 'forced-tool' },
    );

    const result = await orchestrator.run({
      prompt: 'Add 200uL of DMEM to well A2',
      forceDraftTool: true,
      context: {
        labwares: [],
        eventSummary: 'No events yet.',
        vocabPackId: 'liquid-handling/v1',
        availableVerbs: ['add_material'],
      },
    });

    expect(result.events).toHaveLength(1);
    const details = result.events![0]!.details as Record<string, unknown>;
    // The biologist said a volume; the draft must carry it as a volume, not a count.
    expect(details.volume).toEqual({ value: 200, unit: 'uL' });
    expect(details.count).toBeUndefined();
    // The minted DMEM is kept for the review dialogue (term panel), not resolved away.
    expect(details.material_ref).toMatchObject({ label: 'DMEM' });
    expect(result.notes?.join(' ')).toContain('volume');
  });

  it('keeps a genuine count (10,000 HepG2 cells) as a count', async () => {
    vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
      events: [],
      labwareAdditions: [],
      unresolvedRefs: [],
      diagnostics: [{ severity: 'error', code: 'CONFIG_MISSING', message: 'no extractor', pass_id: 'extract_entities' }],
      terminalArtifacts: { events: [], directives: [], gaps: [] },
      outcome: 'error',
    });

    const completeStream = vi.fn(async function* (_request: unknown) {
      yield {
        id: 'resp-cells',
        choices: [{
          index: 0,
          delta: {
            role: 'assistant',
            tool_calls: [{
              index: 0,
              id: 'call-cells',
              type: 'function',
              function: {
                name: AGENT_INTENT_TOOL_NAME,
                arguments: JSON.stringify({
                  intent: 'event_graph',
                  events: [{
                    event_type: 'add_material',
                    verb: 'add_material',
                    details: {
                      labwareId: 'req:CL:96_well_plate:mu9azzva:if7jwo',
                      wells: ['A2'],
                      material_ref: { kind: 'local', label: 'HepG2 cells' },
                    },
                    materials: [
                      { slot: 'target', role: 'cells', ref: { mint: { label: 'HepG2 cells', domain: 'cell_line' } }, count: 10000 },
                    ],
                    notes: 'Adding 10,000 HepG2 cells to A2.',
                  }],
                }),
              },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      };
    });

    const inferenceClient: InferenceClient = { complete: vi.fn(), completeStream };
    const orchestrator = createAgentOrchestrator(
      inferenceClient,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2, draftFlowMode: 'forced-tool' },
    );

    const result = await orchestrator.run({
      prompt: 'Add 10,000 HepG2 cells to well A2',
      forceDraftTool: true,
      context: {
        labwares: [],
        eventSummary: 'No events yet.',
        vocabPackId: 'liquid-handling/v1',
        availableVerbs: ['add_material'],
      },
    });

    expect(result.events).toHaveLength(1);
    const details = result.events![0]!.details as Record<string, unknown>;
    expect(details.count).toBe(10000);
    expect(details.volume).toBeUndefined();
  });

  it('carries equipment and labware requirements onto the termManifest (kind-tagged)', async () => {
    vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
      events: [],
      labwareAdditions: [],
      unresolvedRefs: [],
      diagnostics: [{ severity: 'error', code: 'CONFIG_MISSING', message: 'no extractor', pass_id: 'extract_entities' }],
      terminalArtifacts: { events: [], directives: [], gaps: [] },
      outcome: 'error',
    });

    const completeStream = vi.fn(async function* (_request: unknown) {
      yield {
        id: 'resp-eq',
        choices: [{
          index: 0,
          delta: {
            role: 'assistant',
            tool_calls: [{
              index: 0,
              id: 'call-eq',
              type: 'function',
              function: {
                name: AGENT_INTENT_TOOL_NAME,
                arguments: JSON.stringify({
                  intent: 'event_graph',
                  events: [],
                  equipmentRequirements: [
                    { recordId: 'EQP-water-bath-1', handle: 'bath 55' },
                    { classCurie: 'equipment:heater_shaker', handle: 'shaker' },
                  ],
                  labwareAdditions: [{ recordId: 'LBW-7X2Q' }],
                }),
              },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      };
    });

    const inferenceClient: InferenceClient = { complete: vi.fn(), completeStream };
    const orchestrator = createAgentOrchestrator(
      inferenceClient,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2, draftFlowMode: 'forced-tool' },
    );

    const result = await orchestrator.run({
      prompt: 'add a water bath (bath 55), a heater-shaker, and load labware LBW-7X2Q',
      forceDraftTool: true,
      context: {
        labwares: [],
        eventSummary: 'No events yet.',
        vocabPackId: 'liquid-handling/v1',
        availableVerbs: ['transfer'],
      },
    });

    // The draft places an owned water bath, a generic heater-shaker, and a labware
    // addition — all three must be visible to the term panel, kind-tagged.
    expect(result.termManifest).toBeDefined();
    const equipmentRows = result.termManifest!.filter((t) => t.kind === 'equipment');
    expect(equipmentRows.map((t) => t.id)).toEqual(
      expect.arrayContaining(['EQP-water-bath-1', 'equipment:heater_shaker']),
    );
    // Owned record → local-record; generic classCurie → ontology.
    const bath = equipmentRows.find((t) => t.id === 'EQP-water-bath-1')!;
    expect(bath.source).toBe('local-record');
    const shaker = equipmentRows.find((t) => t.id === 'equipment:heater_shaker')!;
    expect(shaker.source).toBe('ontology');
    // The labware addition is a labware-kind local-record.
    const lw = result.termManifest!.find((t) => t.id === 'LBW-7X2Q')!;
    expect(lw.kind).toBe('labware');
    expect(lw.source).toBe('local-record');
  });
});