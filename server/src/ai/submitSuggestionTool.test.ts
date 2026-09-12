import { describe, expect, it } from 'vitest';
import {
  COMPILE_EVENT_GRAPH_DRAFT_TOOL_DEF,
  COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME,
  parseSubmitSuggestionArgs,
  SUBMIT_SUGGESTION_TOOL_DEF,
  AGENT_INTENT_TOOL_NAME,
  AGENT_INTENT_TOOL_DEF,
  parseAgentIntentArgs,
} from './submitSuggestionTool.js';

const USAGE = { promptTokens: 10, completionTokens: 20 };

describe('parseSubmitSuggestionArgs', () => {
  it('parses events with a CURIE material into a grounded proposal', () => {
    const r = parseSubmitSuggestionArgs(
      {
        events: [
          {
            verb: 'add_material',
            details: { volume_uL: 10 },
            materials: [{ slot: 'reagent', ref: { curie: 'CHEBI:5001' } }],
          },
        ],
        notes: ['ok'],
      },
      USAGE,
      2,
      3,
    );
    expect(r.success).toBe(true);
    expect(r.events).toHaveLength(1);
    const ev = r.events![0]!;
    expect(ev.verb).toBe('add_material');
    expect(ev.materials).toEqual([{ slot: 'reagent', ref: { curie: 'CHEBI:5001' } }]);
    expect(ev.provenance.actor).toBe('ai-agent');
    expect(ev.eventId).toBeTruthy();
    expect(r.notes).toEqual(['ok']);
    expect(r.usage?.totalTokens).toBe(30);
    expect(r.usage?.turns).toBe(2);
  });

  it('parses the mint variant for an ungrounded material', () => {
    const r = parseSubmitSuggestionArgs(
      {
        events: [
          { verb: 'add_material', materials: [{ ref: { mint: { label: 'HepG2', domain: 'cell_line' } } }] },
        ],
      },
      USAGE,
      1,
      1,
    );
    expect(r.events![0]!.materials).toEqual([{ ref: { mint: { label: 'HepG2', domain: 'cell_line' } } }]);
  });

  it('preserves material roles, counts, and component concentrations', () => {
    const r = parseSubmitSuggestionArgs(
      {
        events: [
          {
            verb: 'add_material',
            materials: [
              { role: 'cells', count: 10000, ref: { curie: 'mesh:D056945' } },
              { role: 'buffer_component', ref: { curie: 'XCO:0000988' } },
              { role: 'additive', concentration: { value: 10, unit: '%', basis: 'volume_fraction' }, ref: { curie: 'MSIO:0000017' } },
            ],
          },
        ],
      },
      USAGE,
      1,
      1,
    );

    expect(r.events![0]!.materials).toEqual([
      { role: 'cells', count: 10000, ref: { curie: 'mesh:D056945' } },
      { role: 'buffer_component', ref: { curie: 'XCO:0000988' } },
      { role: 'additive', concentration: { value: 10, unit: '%', basis: 'volume_fraction' }, ref: { curie: 'MSIO:0000017' } },
    ]);
  });

  it('captures a clarification with no events', () => {
    const r = parseSubmitSuggestionArgs(
      {
        clarification: {
          prompt: 'Which fenofibrate form?',
          entityType: 'material',
          options: [{ id: 'a', label: 'acid' }, { id: 'b', label: 'ester', snippet: 'CHEBI:…' }],
        },
      },
      USAGE,
      1,
      0,
    );
    expect(r.success).toBe(true);
    expect(r.events).toEqual([]);
    expect(r.clarification?.options).toHaveLength(2);
    expect(r.clarification?.prompt).toContain('fenofibrate');
  });

  it('captures multiple typed clarification requests', () => {
    const r = parseSubmitSuggestionArgs(
      {
        clarificationRequests: [
          {
            id: 'cells',
            kind: 'material',
            prompt: 'Which HepG2 cells should be used?',
            menuProvider: '/m',
            query: 'HepG2',
            options: [
              { id: 'MAT-HEPG2', label: 'HepG2 working culture', source: 'local' },
              { id: 'CLO:0003704', label: 'Hep G2 cell', source: 'ontology' },
            ],
          },
          {
            id: 'plate',
            kind: 'labware',
            prompt: 'Which 96-well plate?',
            menuProvider: '/l',
            options: [{ id: 'plate-1', label: 'Assay plate' }],
          },
        ],
      },
      USAGE,
      1,
      0,
    );
    expect(r.clarificationRequests).toHaveLength(2);
    expect(r.clarificationRequests?.[0]).toMatchObject({ id: 'cells', kind: 'material', menuProvider: '/m' });
    expect(r.clarification?.prompt).toContain('HepG2');
  });

  it('parses labwareAdditions', () => {
    const r = parseSubmitSuggestionArgs(
      { labwareAdditions: [{ recordId: 'LW-1', reason: 'needed' }, { reason: 'no id' }] },
      USAGE,
      1,
      0,
    );
    expect(r.labwareAdditions).toEqual([{ recordId: 'LW-1', reason: 'needed' }]);
  });

  it('parses generic labwareRequirements', () => {
    const r = parseSubmitSuggestionArgs(
      {
        labwareRequirements: [
          {
            classCurie: 'CL:96_well_plate',
            handle: 'plate1',
            deckSlot: 'B2',
            specificity: 'generic',
            constraints: ['CL:black'],
          },
          { deckSlot: 'C2' },
        ],
      },
      USAGE,
      1,
      0,
    );
    expect(r.labwareRequirements).toEqual([
      {
        classCurie: 'CL:96_well_plate',
        handle: 'plate1',
        deckSlot: 'B2',
        specificity: 'generic',
        constraints: ['CL:black'],
      },
    ]);
  });

  it('coerces invented labware additions into generic requirements', () => {
    const r = parseSubmitSuggestionArgs(
      {
        labwareAdditions: [
          { recordId: 'LBW-96-black-low-binding-plate', reason: 'all black low-binding 96 well plate in slot B2' },
          { recordId: 'LW-1', reason: 'existing concrete labware' },
        ],
      },
      USAGE,
      1,
      0,
    );

    expect(r.labwareRequirements).toEqual([
      {
        classCurie: 'CL:96_well_plate',
        deckSlot: 'B2',
        reason: 'all black low-binding 96 well plate in slot B2',
        specificity: 'constrained',
        constraints: ['CL:black', 'CL:low_binding'],
      },
    ]);
    expect(r.labwareAdditions).toEqual([{ recordId: 'LW-1', reason: 'existing concrete labware' }]);
  });

  it('coerces over-specific labware clarifications into generic requirements when the class is inferable', () => {
    const r = parseSubmitSuggestionArgs(
      {
        notes: ['Proposing to add a 96-well plate to deck slot B2 as requested.'],
        clarification: {
          prompt: 'Which 96-well plate type should be placed in slot B2?',
          entityType: 'labware',
          options: [
            { id: 'a', label: 'Black clear-bottom 96-well plate', snippet: 'CL:96_well_plate, CL:black' },
            { id: 'b', label: 'Clear flat-bottom 96-well plate', snippet: 'CL:96_well_plate, CL:clear' },
          ],
        },
      },
      USAGE,
      1,
      0,
    );

    expect(r.clarification).toBeUndefined();
    expect(r.labwareRequirements).toEqual([
      {
        classCurie: 'CL:96_well_plate',
        deckSlot: 'B2',
        reason: 'Proposing to add a 96-well plate to deck slot B2 as requested.',
        specificity: 'generic',
      },
    ]);
  });

  it('degrades gracefully on malformed input', () => {
    const r = parseSubmitSuggestionArgs(
      { events: 'not-an-array', materials: 42, clarification: { prompt: 'x' } },
      USAGE,
      1,
      0,
    );
    expect(r.success).toBe(true);
    expect(r.events).toEqual([]);
    expect(r.clarification).toBeUndefined(); // missing options/entityType
  });

  it('skips events without a verb and ignores invalid material refs', () => {
    const r = parseSubmitSuggestionArgs(
      {
        events: [
          { details: {} }, // no verb → skipped
          { verb: 'transfer', materials: [{ ref: {} }, { ref: { curie: '' } }, { ref: { curie: 'CHEBI:1' } }] },
        ],
      },
      USAGE,
      1,
      0,
    );
    expect(r.events).toHaveLength(1);
    expect(r.events![0]!.materials).toEqual([{ ref: { curie: 'CHEBI:1' } }]);
  });

  it('exposes well-formed terminal tool definitions', () => {
    expect(SUBMIT_SUGGESTION_TOOL_DEF.type).toBe('function');
    expect(SUBMIT_SUGGESTION_TOOL_DEF.function.name).toBe('submit_suggestion');
    expect(SUBMIT_SUGGESTION_TOOL_DEF.function.parameters).toHaveProperty('properties.events');
    expect(SUBMIT_SUGGESTION_TOOL_DEF.function.parameters).toHaveProperty('properties.labwareRequirements');
    expect(COMPILE_EVENT_GRAPH_DRAFT_TOOL_DEF.type).toBe('function');
    expect(COMPILE_EVENT_GRAPH_DRAFT_TOOL_DEF.function.name).toBe(COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME);
    expect(COMPILE_EVENT_GRAPH_DRAFT_TOOL_DEF.function.parameters).toBe(SUBMIT_SUGGESTION_TOOL_DEF.function.parameters);
    expect(AGENT_INTENT_TOOL_DEF.function.name).toBe(AGENT_INTENT_TOOL_NAME);
  });
});

describe('agent_intent — the constrained emission menu', () => {
  it('exposes a single forced tool with an intent enum (event_graph | deck_layout)', () => {
    const params = AGENT_INTENT_TOOL_DEF.function.parameters;
    expect(params).toHaveProperty('required', ['intent']);
    const props = (params as { properties: Record<string, { type?: string; enum?: string[] }> }).properties;
    expect(props.intent?.type).toBe('string');
    expect(props.intent?.enum).toEqual(['event_graph', 'deck_layout']);
    // deck_layout args
    expect(props.variantId?.type).toBe('string');
    // event_graph args carried over from the draft tool
    expect(props.events).toBeDefined();
    expect(props.labwareRequirements).toBeDefined();
    expect(props.labwareAdditions).toBeDefined();
  });

  it('parses an event_graph intent', () => {
    expect(parseAgentIntentArgs({ intent: 'event_graph', events: [] })).toEqual({ intent: 'event_graph' });
  });

  it('parses a deck_layout intent with platform + variant', () => {
    expect(parseAgentIntentArgs({ intent: 'deck_layout', platformId: 'manual', variantId: 'manual_freeform' }))
      .toEqual({ intent: 'deck_layout', platformId: 'manual', variantId: 'manual_freeform' });
  });

  it('trims the deck args and ignores stray whitespace', () => {
    expect(parseAgentIntentArgs({ intent: 'deck_layout', variantId: '  manual_freeform  ' }))
      .toEqual({ intent: 'deck_layout', variantId: 'manual_freeform' });
  });

  it('reports unknown intent and rejects non-string platform/variant', () => {
    expect(parseAgentIntentArgs({ intent: 'explode_the_lab', variantId: 7 })).toEqual({ intent: 'unknown' });
  });
});
