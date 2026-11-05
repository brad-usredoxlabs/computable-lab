import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  TUBE_EVENT_SCHEMA_IDS,
  gateTubeEventDetails,
  type TubeGateValidator,
} from './tubeEventDetailGate.js';

/**
 * Tests run against the REAL event contracts: one small Ajv instance loaded
 * with the actual schema/workflow/events YAML files (plus the shared ref
 * datatype they $ref), exactly the way AjvValidator.ts wires Ajv2020.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVENTS_DIR = resolve(__dirname, '../../../schema/workflow/events');
const SCHEMA_FILES = [
  resolve(EVENTS_DIR, 'plate-event.place-tube.schema.yaml'),
  resolve(EVENTS_DIR, 'plate-event.move-tube.schema.yaml'),
  resolve(EVENTS_DIR, 'plate-event.remove-tube.schema.yaml'),
  resolve(__dirname, '../../../schema/core/datatypes/ref.schema.yaml'),
];

const ajv = new Ajv2020({ strict: false });
for (const file of SCHEMA_FILES) {
  ajv.addSchema(parseYaml(readFileSync(file, 'utf8')) as object);
}

function makeRecordingValidator(): { calls: string[]; validate: TubeGateValidator } {
  const calls: string[] = [];
  const validate: TubeGateValidator = (data, schemaId) => {
    calls.push(schemaId);
    const fn = ajv.getSchema(schemaId);
    if (!fn) throw new Error(`schema not loaded: ${schemaId}`);
    const valid = Boolean(fn(data));
    return {
      valid,
      errors: (fn.errors ?? []).map((e) => ({
        path: e.instancePath,
        message: e.message,
      })),
    };
  };
  return { calls, validate };
}

interface Ev {
  eventId: string;
  event_type: string;
  verb: string;
  details: Record<string, unknown>;
}

const ev = (eventId: string, verb: string, details: Record<string, unknown>): Ev => ({
  eventId,
  event_type: verb,
  verb,
  details,
});

describe('tubeEventDetailGate — place_tube', () => {
  it('repairs the real observed payload: tubeVolumeClass enum leaks into details', async () => {
    const { validate } = makeRecordingValidator();
    const input = ev('ev-a', 'place_tube', {
      labwareId: 'lw-1',
      wells: ['A1', 'B1'],
      tubeVolumeClass: '1.5ml',
    });
    const result = await gateTubeEventDetails([input], validate);
    expect(result.dropped).toHaveLength(0);
    expect(result.events).toHaveLength(1);
    const out = result.events[0]!;
    expect(out.details.tube).toEqual({
      sizeLabel: '1.5 mL',
      maxVolume_uL: 1500,
      wellShape: 'round',
    });
    expect('tubeVolumeClass' in out.details).toBe(false);
  });

  it('passes a valid place_tube through untouched', async () => {
    const { validate } = makeRecordingValidator();
    const input = ev('ev-b', 'place_tube', {
      labwareId: 'lw-1',
      wells: ['A1'],
      tube: { sizeLabel: '15 mL', maxVolume_uL: 15000, wellShape: 'conical' },
    });
    const result = await gateTubeEventDetails([input], validate);
    expect(result.dropped).toHaveLength(0);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.details).toEqual(input.details);
  });

  it('drops place_tube whose tubeVolumeClass does not resolve', async () => {
    const { validate } = makeRecordingValidator();
    const input = ev('ev-c', 'place_tube', {
      labwareId: 'lw-1',
      wells: ['A1'],
      tubeVolumeClass: 'unicorn-class',
    });
    const result = await gateTubeEventDetails([input], validate);
    expect(result.events).toHaveLength(0);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0]!.eventId).toBe('ev-c');
    expect(typeof result.dropped[0]!.reason).toBe('string');
    expect(result.dropped[0]!.reason.length).toBeGreaterThan(0);
  });

  it('drops place_tube whose tube is missing maxVolume_uL', async () => {
    const { validate } = makeRecordingValidator();
    const input = ev('ev-d', 'place_tube', {
      wells: ['A1'],
      tube: { sizeLabel: '2 mL' },
    });
    const result = await gateTubeEventDetails([input], validate);
    expect(result.events).toHaveLength(0);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0]!.eventId).toBe('ev-d');
  });

  it('nests flat sizeLabel/maxVolume_uL into tube', async () => {
    const { validate } = makeRecordingValidator();
    const input = ev('ev-e', 'place_tube', {
      wells: ['A1'],
      sizeLabel: '2 mL',
      maxVolume_uL: 2000,
    });
    const result = await gateTubeEventDetails([input], validate);
    expect(result.dropped).toHaveLength(0);
    expect(result.events).toHaveLength(1);
    const out = result.events[0]!;
    expect(out.details.tube).toEqual({
      sizeLabel: '2 mL',
      maxVolume_uL: 2000,
      wellShape: 'round',
    });
    expect('sizeLabel' in out.details).toBe(false);
    expect('maxVolume_uL' in out.details).toBe(false);
  });

  it('prunes undeclared top-level keys (stray key + valid tube passes)', async () => {
    const { validate } = makeRecordingValidator();
    const input = ev('ev-f2', 'place_tube', {
      labwareId: 'lw-1',
      wells: ['A1'],
      tube: { sizeLabel: '2 mL', maxVolume_uL: 2000 },
      tubeVolumeClass: '2ml',
    });
    const result = await gateTubeEventDetails([input], validate);
    expect(result.dropped).toHaveLength(0);
    expect(result.events).toHaveLength(1);
    expect('tubeVolumeClass' in result.events[0]!.details).toBe(false);
    expect(result.events[0]!.details.tube).toEqual({
      sizeLabel: '2 mL',
      maxVolume_uL: 2000,
    });
  });
});

describe('tubeEventDetailGate — remove_tube', () => {
  it('passes a valid remove_tube untouched', async () => {
    const { validate } = makeRecordingValidator();
    const input = ev('ev-f', 'remove_tube', { labwareId: 'r', wells: ['A1'] });
    const result = await gateTubeEventDetails([input], validate);
    expect(result.dropped).toHaveLength(0);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.details).toEqual({ labwareId: 'r', wells: ['A1'] });
  });

  it('passes remove_tube with a stray tubeVolumeClass — pruned, not dropped', async () => {
    const { validate } = makeRecordingValidator();
    const input = ev('ev-f3', 'remove_tube', { wells: ['A1'], tubeVolumeClass: '1.5ml' });
    const result = await gateTubeEventDetails([input], validate);
    expect(result.dropped).toHaveLength(0);
    expect(result.events).toHaveLength(1);
    expect('tubeVolumeClass' in result.events[0]!.details).toBe(false);
    expect(result.events[0]!.details).toEqual({ wells: ['A1'] });
  });
});

describe('tubeEventDetailGate — move_tube', () => {
  it('passes a valid move_tube', async () => {
    const { validate } = makeRecordingValidator();
    const input = ev('ev-g', 'move_tube', {
      source: { well: 'A1' },
      target: { well: 'B1' },
    });
    const result = await gateTubeEventDetails([input], validate);
    expect(result.dropped).toHaveLength(0);
    expect(result.events).toHaveLength(1);
  });

  it('drops move_tube missing target', async () => {
    const { validate } = makeRecordingValidator();
    const input = ev('ev-g2', 'move_tube', { source: { well: 'A1' } });
    const result = await gateTubeEventDetails([input], validate);
    expect(result.events).toHaveLength(0);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0]!.eventId).toBe('ev-g2');
  });
});

describe('tubeEventDetailGate — non-tube verbs', () => {
  it('never validates or touches a non-tube verb', async () => {
    const { calls, validate } = makeRecordingValidator();
    const input = ev('ev-h', 'add_material', { nonsense: { deeply: ['broken'] } });
    const result = await gateTubeEventDetails([input], validate);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toBe(input);
    expect(result.dropped).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it('falls back to event_type when verb is empty', async () => {
    const { validate } = makeRecordingValidator();
    const input: Ev = {
      eventId: 'ev-i',
      event_type: 'remove_tube',
      verb: '',
      details: { wells: ['A1'] },
    };
    const result = await gateTubeEventDetails([input], validate);
    expect(result.events).toHaveLength(1);
    const input2: Ev = {
      eventId: 'ev-i2',
      event_type: 'remove_tube',
      verb: '',
      details: { nonsenseOnly: true },
    };
    const result2 = await gateTubeEventDetails([input2], validate);
    expect(result2.dropped).toHaveLength(1);
  });

  it('exposes the three schema $ids', () => {
    expect(TUBE_EVENT_SCHEMA_IDS.place_tube).toBe(
      'https://computable-lab.com/schema/computable-lab/workflow/events/plate-event.place-tube.schema.yaml',
    );
    expect(TUBE_EVENT_SCHEMA_IDS.move_tube).toBe(
      'https://computable-lab.com/schema/computable-lab/workflow/events/plate-event.move-tube.schema.yaml',
    );
    expect(TUBE_EVENT_SCHEMA_IDS.remove_tube).toBe(
      'https://computable-lab.com/schema/computable-lab/workflow/events/plate-event.remove-tube.schema.yaml',
    );
  });
});
