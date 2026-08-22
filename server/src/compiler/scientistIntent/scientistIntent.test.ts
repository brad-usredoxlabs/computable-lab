import { describe, expect, it } from 'vitest';
import { parseScientistIntent, ScientistIntentValidationError } from './parseScientistIntent.js';
import { normalizeScientistIntent } from './normalizeScientistIntent.js';
import { compileScientistIntent } from './compileScientistIntent.js';
import { compileFromSmallLlm, stripYamlFence } from './intentCompile.js';

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