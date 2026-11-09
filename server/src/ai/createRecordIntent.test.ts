/**
 * The third intent: `create_record` — authoring records the lab does not have yet.
 *
 * Why it exists (2026-09-20): "add the lab's MSE PRO 4 plate shaker incubator" had no
 * home in the emission contract. Authoring was a *field* inside `event_graph`, so the
 * model either minted a generic stand-in as if it were a placement, or borrowed
 * `place_tube` and pasted an instrument id into a tube event. Naming the act gives it
 * a verb, gives the review surface an honest shape, and covers all three kinds —
 * equipment, material, labware — through ONE pass.
 *
 * Contract rules under test: nothing is written on emission (the user accepts, then
 * the record is created), records-first (an existing match is reused with a warning),
 * every creation carries its attribution, a named product is never downgraded to a
 * generic kind, and `alsoPlace` is explicit because creating and placing are two
 * decisions.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_INTENT_TOOL_DEF,
  parseAlsoPlace,
  parseRecordCreations,
  parseSubmitSuggestionArgs,
  SUBMIT_SUGGESTION_TOOL_DEF,
} from './submitSuggestionTool.js';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import type { AgentEvent, CompletionRequest, InferenceClient } from './types.js';
import * as runChatbotCompileModule from './runChatbotCompile.js';

const USAGE = { promptTokens: 1, completionTokens: 1 };

function props(def: { function: { parameters: unknown } }) {
  return (def.function.parameters as { properties: Record<string, Record<string, unknown>> }).properties;
}

describe('the create_record intent', () => {
  it('is one of exactly three intents, on the single forced tool', () => {
    const intent = props(AGENT_INTENT_TOOL_DEF).intent as { enum: string[] };
    expect(intent.enum).toEqual(['event_graph', 'deck_layout', 'create_record']);
    // Still ONE tool: tool_choice forces it, so the model cannot choose a tool at all.
    expect(AGENT_INTENT_TOOL_DEF.function.name).toBe('agent_intent');
  });

  it('carries records + alsoPlace, and no longer a field on event_graph', () => {
    expect(props(AGENT_INTENT_TOOL_DEF).records).toBeDefined();
    expect(props(AGENT_INTENT_TOOL_DEF).alsoPlace).toBeDefined();
    expect(props(SUBMIT_SUGGESTION_TOOL_DEF).equipmentAdditions).toBeUndefined();
  });

  it('states the rules the model must follow', () => {
    const description = String(props(SUBMIT_SUGGESTION_TOOL_DEF).records?.description ?? '');
    expect(description).toMatch(/nothing is written/i);
    expect(description).toMatch(/warning instead of duplicating|warns instead of/i);
    expect(description).toMatch(/NEVER downgrade a named product/i);
    expect(description).toMatch(/ALWAYS set `source`/i);
    expect(description).toMatch(/"equipment".*"material".*"labware"/s);
    const alsoPlace = String(props(SUBMIT_SUGGESTION_TOOL_DEF).alsoPlace?.description ?? '');
    expect(alsoPlace).toMatch(/two decisions/i);
    expect(alsoPlace).toMatch(/never implied|NOT placed/i);
  });

  it('parses all three kinds with their kind-specific facts', () => {
    const creations = parseRecordCreations([
      {
        kind: 'equipment',
        name: 'Benchmark Incu-Mixer MP4',
        classKind: 'equipment:heater_shaker',
        settings: { rpm: 1200 },
        source: 'exa:https://benchmarkscientific.com/incu-mixer-mp4',
      },
      { kind: 'material', name: 'fenofibrate', domain: 'chemical', source: 'user-description' },
      {
        kind: 'labware',
        name: '96-well low-binding plate',
        labwareType: 'plate',
        format: { rows: 8, cols: 12, wellCount: 96 },
        source: 'user-description',
      },
    ]);
    expect(creations.map((c) => c.kind)).toEqual(['equipment', 'material', 'labware']);
    expect(creations[2]?.format).toEqual({ rows: 8, cols: 12, wellCount: 96 });
    expect(creations[1]?.domain).toBe('chemical');
  });

  it('tolerates the obvious spellings, and drops what cannot be authored', () => {
    expect(parseRecordCreations([{ kind: 'instrument', label: 'Mixer X', source: 'user-description' }]))
      .toEqual([{ kind: 'equipment', name: 'Mixer X', source: 'user-description' }]);
    // No kind, or no name: an unnamed/untyped record cannot be created honestly.
    expect(parseRecordCreations([{ name: 'no kind' }, { kind: 'equipment' }, 'a string'])).toEqual([]);
  });

  it('does not mistake a record kind for a class token', () => {
    expect(parseRecordCreations([{ kind: 'equipment', name: 'Mystery', class: 'equipment' }])[0]?.classKind)
      .toBeUndefined();
  });
});

describe('alsoPlace', () => {
  it('parses the explicit placement', () => {
    expect(parseAlsoPlace({ surface: 'lawn' })).toEqual({ surface: 'lawn' });
    expect(parseAlsoPlace({ surface: 'slot', slotId: 'B2' })).toEqual({ surface: 'slot', slotId: 'B2' });
    // A slot id alone implies a slot placement.
    expect(parseAlsoPlace({ slotId: 'B2' })).toEqual({ surface: 'slot', slotId: 'B2' });
  });

  it('is absent when nothing was asked for — placement is never implied', () => {
    expect(parseAlsoPlace(undefined)).toBeUndefined();
    expect(parseAlsoPlace({})).toBeUndefined();
    expect(parseAlsoPlace({ surface: 'somewhere' })).toBeUndefined();
  });
});

describe('the orchestrator hands creations to the client', () => {
  it('returns recordCreations + alsoPlace for a create_record turn', async () => {
    vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
      events: [],
      labwareAdditions: [],
      unresolvedRefs: [],
      diagnostics: [{ severity: 'error', code: 'CONFIG_MISSING', message: 'no extractor', pass_id: 'extract_entities' }],
      terminalArtifacts: { events: [], directives: [], gaps: [] },
      outcome: 'error',
    });

    const completeStream = vi.fn(async function* (_request: CompletionRequest) {
      yield {
        id: 'resp-create',
        choices: [{
          index: 0,
          delta: {
            role: 'assistant',
            tool_calls: [{
              index: 0,
              id: 'call-create',
              type: 'function',
              function: {
                name: 'agent_intent',
                arguments: JSON.stringify({
                  intent: 'create_record',
                  records: [
                    {
                      kind: 'equipment',
                      name: 'MSE PRO 4 plate shaker incubator',
                      classKind: 'equipment:heater_shaker',
                      source: 'user-description',
                    },
                  ],
                  alsoPlace: { surface: 'lawn' },
                  notes: ['Adding it as a new equipment record, as you chose.'],
                }),
              },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      };
    });

    const events: AgentEvent[] = [];
    const inferenceClient: InferenceClient = { complete: vi.fn(), completeStream };
    const orchestrator = createAgentOrchestrator(
      inferenceClient,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2, draftFlowMode: 'preflight-llm' },
    );

    const result = await orchestrator.run({
      prompt: '1) Add it as a new equipment record',
      forceDraftTool: true,
      onEvent: (event) => events.push(event),
      context: {
        labwares: [],
        eventSummary: 'No events yet.',
        vocabPackId: 'liquid-handling/v1',
        availableVerbs: ['transfer'],
      },
    });

    expect(result.recordCreations).toEqual([
      {
        kind: 'equipment',
        name: 'MSE PRO 4 plate shaker incubator',
        classKind: 'equipment:heater_shaker',
        source: 'user-description',
      },
    ]);
    expect(result.alsoPlace).toEqual({ surface: 'lawn' });
    // It is not smuggled in as a deck draft.
    expect(result.events ?? []).toEqual([]);
    expect(result.equipmentRequirements ?? []).toEqual([]);
  });

  it('refuses a create_record turn with nothing to create, and says why', async () => {
    vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
      events: [],
      labwareAdditions: [],
      unresolvedRefs: [],
      diagnostics: [{ severity: 'error', code: 'CONFIG_MISSING', message: 'no extractor', pass_id: 'extract_entities' }],
      terminalArtifacts: { events: [], directives: [], gaps: [] },
      outcome: 'error',
    });
    const completeStream = vi.fn(async function* (_request: CompletionRequest) {
      yield {
        id: 'resp-create-empty',
        choices: [{
          index: 0,
          delta: {
            role: 'assistant',
            tool_calls: [{
              index: 0,
              id: 'call-empty',
              type: 'function',
              function: { name: 'agent_intent', arguments: JSON.stringify({ intent: 'create_record' }) },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      };
    });
    const orchestrator = createAgentOrchestrator(
      { complete: vi.fn(), completeStream },
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2, draftFlowMode: 'preflight-llm' },
    );
    const result = await orchestrator.run({
      prompt: 'add something',
      forceDraftTool: true,
      context: { labwares: [], eventSummary: '', vocabPackId: 'liquid-handling/v1', availableVerbs: [] },
    });
    expect(result.success).toBe(false);
    expect(String(result.error)).toMatch(/requires at least one entry/i);
  });
});

describe('event_graph is unchanged by the new intent', () => {
  it('still parses events and placements', () => {
    const result = parseSubmitSuggestionArgs(
      {
        intent: 'event_graph',
        events: [{ verb: 'add_material', details: { labwareId: 'plate1', wells: ['A1'] } }],
        equipmentRequirements: [{ classCurie: 'equipment:water_bath' }],
      },
      USAGE,
      1,
      1,
    );
    expect(result.events).toHaveLength(1);
    expect(result.equipmentRequirements).toEqual([{ classCurie: 'equipment:water_bath' }]);
    expect(result.recordCreations ?? []).toEqual([]);
  });
});
