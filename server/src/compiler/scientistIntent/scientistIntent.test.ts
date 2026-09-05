import { describe, expect, it, vi } from 'vitest';
import { parseScientistIntent, ScientistIntentValidationError } from './parseScientistIntent.js';
import { normalizeScientistIntent } from './normalizeScientistIntent.js';
import { compileScientistIntent } from './compileScientistIntent.js';
import { compileFromSmallLlm, stripYamlFence, extractBranchQuestionsFromSmallLlm, composeIntentPrompt } from './intentCompile.js';
import { liftScientistIntent, canonicalActionName, coerceNumeric } from './liftScientistIntent.js';

const THREE_ACTION = `
intentId: example-001
actions:
  - action: serial_dilution
    source: standards
    target: fresh_plate
    factor: 2
    points: 8
    replicates: 2
  - action: incubate
    duration: 10 min
    temperatureC: 37
  - action: read
    mode: absorbance
    wavelength: 450 nm
`;

describe('parseScientistIntent', () => {
  it('parses the 3-action example (broad vocab)', () => {
    const doc = parseScientistIntent(THREE_ACTION);
    expect(doc.actions).toHaveLength(3);
    expect(doc.actions[0].action).toBe('serial_dilution');
    expect(doc.actions[0].source).toBe('standards');
    expect(doc.actions[0].factor).toBe(2);
    expect(doc.actions[0].points).toBe(8);
  });

  it('accepts the full closed vocabulary', () => {
    const doc = parseScientistIntent(`
intentId: broad
actions:
  - { action: seed, source: cells }
  - { action: incubate, duration: 30 min }
  - { action: wash, source: pbs, target: plate }
  - { action: harvest, target: destination }
  - { action: spin, rpm: 300, duration: "5 min" }
  - { action: pellet, rpm: 1000 }
  - { action: freeze, temperatureC: -80 }
  - { action: serial_dilution, factor: 2, points: 4 }
  - { action: media_swap_duplicate_columns, source: media }
`);
    expect(doc.actions.length).toBe(9);
  });

  it('rejects an unknown action via Ajv', () => {
    expect(() => parseScientistIntent(`
intentId: bad
actions:
  - action: evaporate
`)).toThrow(ScientistIntentValidationError);
  });

  it('rejects missing actions', () => {
    expect(() => parseScientistIntent(`name: bad`)).toThrow(ScientistIntentValidationError);
  });
});

describe('normalizeScientistIntent', () => {
  it('folds serial_dilution into a ProtocolPatternIntent with factor/points/replicates', () => {
    const doc = parseScientistIntent(THREE_ACTION);
    const out = normalizeScientistIntent(doc);
    expect(out.protocolIntent).toBeDefined();
    expect(out.protocolIntent!.patterns).toHaveLength(1);
    const pattern = out.protocolIntent!.patterns[0];
    expect(pattern.kind).toBe('serial_dilution');
    expect(pattern.params).toMatchObject({ factor: 2, points: 8, replicates: 2 });
  });

  it('folds non-pattern actions into candidateEvents (broad verb re-use)', () => {
    const doc = parseScientistIntent(`
intentId: broad
actions:
  - { action: seed, source: cells }
  - { action: wash, source: pbs, target: plate, cycles: 3 }
  - { action: spin, rpm: 300 }
`);
    const out = normalizeScientistIntent(doc);
    expect(out.candidateEvents).toHaveLength(3);
    expect(out.candidateEvents[0]).toMatchObject({ verb: 'seed', source_labware: 'cells' });
    expect(out.candidateEvents[1]).toMatchObject({ verb: 'wash', source_labware: 'pbs', cycles: 3 });
    expect(out.candidateEvents[2]).toMatchObject({ verb: 'spin', rpm: 300 });
  });
});

describe('intentCompile (small-LLM driver)', () => {
  it('stripYamlFence removes markdown fences and leading prose', () => {
    expect(stripYamlFence('```yaml\nintentId: x\nactions: []\n```')).toBe('intentId: x\nactions: []');
    expect(stripYamlFence('Here is your intent:\n\nintentId: x\nactions: []')).toBe('intentId: x\nactions: []');
  });

  it('drives the small model to emit intent YAML and compiles it deterministically', async () => {
    const llm = {
      complete: async () => ({
        choices: [{
          message: {
            content: `
Here is the scientist-intent YAML:

intentId: dilution-readout
actions:
  - action: serial_dilution
    source: standards
    target: fresh_plate
    factor: 2
    points: 4
    replicates: 1
  - action: incubate
    duration: 10 min
    temperatureC: 37
  - action: read
    mode: absorbance
    wavelength: 450 nm
`,
          },
        }],
      }),
    };

    const { intent, compile } = await compileFromSmallLlm({
      prompt: '2-fold serial dilution 4 points then incubate and read at 450nm',
      llmClient: llm as never,
      deps: { searchLabwareByHint: async (h) => [{ recordId: `LAB-${h}`, title: h }] },
    });

    expect(intent.actions).toHaveLength(3);
    expect(intent.actions[0].action).toBe('serial_dilution');
    const types = compile.terminalArtifacts.events.map((e) => e.event_type);
    expect(types).toContain('mix');
    expect(types).toContain('transfer');
  });

  it('parses tool-call arguments (the primary small-model path) and compiles them', async () => {
    // Mock a tool-call emission: `emit_scientist_intent` arguments as structured JSON.
    const llm = {
      complete: async () => ({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              function: {
                name: 'emit_scientist_intent',
                arguments: JSON.stringify({
                  intentId: 'dilution-tool',
                  actions: [
                    { action: 'serial_dilution', source: 'standards', target: 'fresh_plate', factor: 2, points: 4, replicates: 1 },
                    { action: 'incubate', duration: '10 min', temperatureC: 37 },
                    { action: 'read', mode: 'absorbance', wavelength: '450 nm' },
                  ],
                }),
              },
            }],
          },
        }],
      }),
    };

    const { intent, compile } = await compileFromSmallLlm({
      prompt: '2-fold serial dilution 4 points then incubate and read at 450nm',
      llmClient: llm as never,
      deps: { searchLabwareByHint: async (h) => [{ recordId: `LAB-${h}`, title: h }] },
    });

    expect(intent.actions).toHaveLength(3);
    expect(intent.actions[0]).toMatchObject({ action: 'serial_dilution', factor: 2, points: 4 });
    const types = compile.terminalArtifacts.events.map((e) => e.event_type);
    expect(types).toContain('mix');
    expect(types).toContain('transfer');
  });

  it('falls back to plain-text chat when the forced tool call yields a bare prompt echo', async () => {
    // The tiny model sometimes returns a literal echo of the prompt template
    // ("intentId: A short stable ID", "- actions: Array of action objects...")
    // instead of real YAML, OR returns empty content when forced into a tool
    // call. compileFromSmallLlm must retry as a plain-text completion (no
    // tools), which empirically produces valid YAML.
    const toolCallCalls: number[] = [];
    const llm = {
      complete: vi.fn(async (req: any) => {
        if (req.tools) {
          toolCallCalls.push(1);
          // First (tool) attempt emits the TEMPLATE ECHO as content, no tool_calls.
          return {
            choices: [{
              message: { content: 'intentId: A short stable ID\n- actions: Array of action objects with action, source, target, labware, etc.', tool_calls: undefined },
            }],
          };
        }
        // Second (plain-text) attempt emits real YAML (params nested under
        // `parameters` — OpenAI-style — which must be lifted+flattened).
        return {
          choices: [{
            message: { content: 'intentId: fallback-001\nactions:\n  - action: add_material\n    parameters:\n      source: lysis_solution\n      target: lysis_module\n      material: Lysis Solution\n      volumeUl: 550\n  - action: spin' },
          }],
        };
      }),
    };

    const { intent } = await compileFromSmallLlm({
      prompt: 'Add 550 ul of Lysis Solution to the lysis module, then spin',
      llmClient: llm as never,
    });

    expect(toolCallCalls).toHaveLength(1); // tool path tried once
    expect(intent.actions).toHaveLength(2);
    expect(intent.actions[0]).toMatchObject({ action: 'add_material', volumeUl: 550 });
    expect(intent.actions[1]).toMatchObject({ action: 'spin' });
  });
});

describe('composeIntentPrompt (lab inventory context)', () => {
  it('returns the prompt unchanged when no inventory is provided', () => {
    expect(composeIntentPrompt('dilute 1:2')).toBe('dilute 1:2');
  });

  it('injects a LAB INVENTORY block listing instruments/labware/materials', () => {
    const out = composeIntentPrompt('lyse the cells in the bead basher', {
      instruments: ['QuantStudio 5', 'Bead Basher'],
      labware: ['96-well plate', 'cryoking tube'],
      materials: ['ZymoBIOMICS Lysis Solution'],
    });
    expect(out).toContain('LAB INVENTORY');
    expect(out).toContain('INSTRUMENTS: QuantStudio 5, Bead Basher');
    expect(out).toContain('LABWARE: 96-well plate, cryoking tube');
    expect(out).toContain('MATERIALS: ZymoBIOMICS Lysis Solution');
    // The original prompt must still be present after the block
    expect(out.endsWith('lyse the cells in the bead basher')).toBe(true);
  });

  it('omits empty inventory sections', () => {
    const out = composeIntentPrompt('incubate', { instruments: ['QS5'] });
    expect(out).toContain('INSTRUMENTS: QS5');
    expect(out).not.toContain('LABWARE:');
    expect(out).not.toContain('MATERIALS:');
  });
});

describe('compileScientistIntent', () => {
  it('compiles the 3-action example into canonical events (gap: unresolved symbol)', async () => {
    const doc = parseScientistIntent(THREE_ACTION);
    const { terminalArtifacts, outcome } = await compileScientistIntent(doc, {
      searchLabwareByHint: async (hint) => {
        const h = hint.toLowerCase();
        if (h.includes('standards') || h === 'standards') {
          return [{ recordId: 'LAB-standard-plate', title: 'Standard Plate' }];
        }
        if (h.includes('fresh') || h === 'fresh_plate') {
          return [{ recordId: 'LAB-fresh-plate', title: 'Fresh 96-well plate' }];
        }
        return [];
      },
    });

    // serial dilution (source+target) should expand into mix + transfer ladders,
    // plus the standalone incubate + read verbs from candidateEvents.
    const eventTypes = terminalArtifacts.events.map((e) => e.event_type);
    expect(eventTypes).toContain('mix');
    expect(eventTypes).toContain('transfer');
  });
});

describe('liftScientistIntent (verb-synonym lift)', () => {
  it('maps natural ecosystem verbs to the canonical closed set', () => {
    expect(canonicalActionName('aspirate')).toBe('transfer');
    expect(canonicalActionName('dispense')).toBe('transfer');
    expect(canonicalActionName('centrifuge')).toBe('spin');
    expect(canonicalActionName('pellet')).toBe('spin');
    expect(canonicalActionName('dry')).toBe('incubate');
    expect(canonicalActionName('repeat_cycle')).toBe('mix');
    expect(canonicalActionName('incubate')).toBe('incubate');
    expect(canonicalActionName('read')).toBe('read');
  });

  it('coerces numeric strings and whitelists/drops noise params', () => {
    const lifted = liftScientistIntent({
      intentId: 'ex',
      actions: [
        { action: 'aspirate', volumeUl: '550', volume: '550', ratio: 'discard all', label: 'discard' },
        { action: 'centrifuge', rpm: '4000', timeMin: '5', ratio: '>=4000 xg' },
      ],
    });
    const acts = (lifted.actions as Array<Record<string, unknown>>);
    expect(acts[0]).toMatchObject({ action: 'transfer', volumeUl: 550, volume: 550 });
    expect(acts[0]).not.toHaveProperty('ratio');
    expect(acts[0]).not.toHaveProperty('label');
    expect(acts[1]).toMatchObject({ action: 'spin', rpm: 4000, duration: '5' });
    expect(coerceNumeric('550')).toBe(550);
    expect(coerceNumeric('10 min')).toBe('10 min');
  });

  it('lifts the key-as-action YAML shape a tiny model emits (verb as map key, snake params)', () => {
    // Live 2.6B output shape: `- add_material:\n    material: "ZymoBIOMICS™ Lysis
    // Solution"\n    volume_ul: "550"` — no `action:` field, snake-case volume.
    const lifted = liftScientistIntent({
      intentId: 'zymo',
      actions: [
        { add_material: { material: 'ZymoBIOMICS™ Lysis Solution', volume_ul: '550' } },
        { transfer: { source: 'block', target: 'magstand', volume_ul: '200' } },
        { centrifuge: { rpm_value: '4000', time_min: '5' } },
      ],
    });
    const acts = (lifted.actions as Array<Record<string, unknown>>);
    expect(acts[0]).toMatchObject({ action: 'add_material', material: 'ZymoBIOMICS™ Lysis Solution', volumeUl: 550 });
    expect(acts[1]).toMatchObject({ action: 'transfer', source: 'block', target: 'magstand', volumeUl: 200 });
    expect(acts[2]).toMatchObject({ action: 'spin', rpm: 4000, duration: '5' });
    // No unknown / no dropped action, no stray snake keys.
    expect(acts.every((a) => a.action !== 'unknown')).toBe(true);
    expect(acts[0]).not.toHaveProperty('volume_ul');
  });

  it('lifts the verb-keyed MAP actions shape a tiny model emits with the strengthened prompt', () => {
    // Live shape after prompt update: `actions` is a MAP keyed by verb, each
    // value a params object OR an array of params (one per emitted instance).
    const lifted = liftScientistIntent({
      intentId: 'bashing_bead_lysis',
      actions: {
        add_material: [
          { material: 'ZymoBIOMICS Lysis Solution', volumeUl: 550 },
          { material: 'ZymoBIOMICS Lysis Solution', volumeUl: 750 },
        ],
        transfer: { source: 'BashingBead Module', target: 'plate', volumeUl: 200 },
        spin: [ { rpm_value: '4000', time_min: '5' }, { rpm_value: '10000', time_min: '1' } ],
      },
    });
    const acts = (lifted.actions as Array<Record<string, unknown>>);
    expect(acts).toHaveLength(5);
    expect(acts[0]).toMatchObject({ action: 'add_material', material: 'ZymoBIOMICS Lysis Solution', volumeUl: 550 });
    expect(acts[1]).toMatchObject({ action: 'add_material', material: 'ZymoBIOMICS Lysis Solution', volumeUl: 750 });
    expect(acts[2]).toMatchObject({ action: 'transfer', source: 'BashingBead Module', target: 'plate', volumeUl: 200 });
    expect(acts[3]).toMatchObject({ action: 'spin', rpm: 4000, duration: '5' });
    expect(acts[4]).toMatchObject({ action: 'spin', rpm: 10000, duration: '1' });
    expect(acts.every((a) => a.action !== 'unknown')).toBe(true);
  });
});

describe('extractBranchQuestionsFromSmallLlm (localization preamble)', () => {
  it('parses branch-question tool-call output into a stable axes shape', async () => {
    const llm = {
      complete: async () => ({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              function: {
                name: 'emit_branch_questions',
                arguments: JSON.stringify({
                  axes: [
                    { axisId: 'sample_type', question: 'What sample?', choices: [{ value: 'bacterial', label: 'Bacteria' }, { value: 'mammalian', label: 'Mammalian' }] },
                    { axisId: 'bad', question: '', choices: 'oops' },
                  ],
                }),
              },
            }],
          },
        }],
      }),
    };

    const result = await extractBranchQuestionsFromSmallLlm({
      protocolText: 'vendor protocol text',
      llmClient: llm as never,
    });
    expect(result.axes).toHaveLength(1);
    expect(result.axes[0].axisId).toBe('sample_type');
    expect(result.axes[0].choices).toHaveLength(2);
  });

  it('returns empty axes when no tool call is made', async () => {
    const llm = { complete: async () => ({ choices: [{ message: { content: 'boring' } }] }) };
    const result = await extractBranchQuestionsFromSmallLlm({
      protocolText: 'x',
      llmClient: llm as never,
    });
    expect(result.axes).toEqual([]);
  });
});