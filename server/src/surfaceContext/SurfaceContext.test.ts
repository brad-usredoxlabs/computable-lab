/**
 * SurfaceContext — serialize → parse round-trip keeps selection refs intact;
 * empty selection/prompt are absent (not undefined).
 */
import { describe, expect, it } from 'vitest';
import { toYaml, toJson, parseSurfaceContext } from './serialization.js';
import { parse } from 'yaml';

const WELL_CTX = {
  surface: 'find',
  active: { objectType: 'collection', objectId: 'selection:q_1', label: 'Find selection' },
  selection: [{ ref: { kind: 'record', id: 'well:1', type: 'well', label: 'A1' } }],
  prompt: 'Analyze these wells',
  asOf: '2026-09-05T00:00:00.000Z',
} as const;

describe('SurfaceContext serialization round-trip', () => {
  it('YAML round-trip keeps selection refs intact', () => {
    const yaml = toYaml(WELL_CTX);
    const back = parseSurfaceContext(yaml);
    expect(back.surface).toBe('find');
    expect(back.selection).toHaveLength(1);
    expect(back.selection[0].ref).toMatchObject({ kind: 'record', id: 'well:1', type: 'well' });
    expect(back.prompt).toBe('Analyze these wells');
  });

  it('YAML round-trip keeps resolved selection data intact', () => {
    const withData = {
      ...WELL_CTX,
      selection: [
        {
          ref: { kind: 'record', id: 'well:EVG-c:plate-1:A1', type: 'well', label: 'A1' },
          data: { treatment: 'clofibrate 1mM', materialRefs: ['MAT-CLO'] },
        },
      ],
    };
    const back = parseSurfaceContext(toYaml(withData as never));
    expect(back.selection[0].data).toMatchObject({
      treatment: 'clofibrate 1mM',
      materialRefs: ['MAT-CLO'],
    });
  });

  it('JSON round-trip keeps selection refs intact', () => {
    const back = parseSurfaceContext(toJson(WELL_CTX));
    expect(back.selection[0].ref).toMatchObject({ id: 'well:1', type: 'well' });
  });

  it('YAML emits a stable key order (selection serializes deterministically)', () => {
    const a = toYaml(WELL_CTX);
    const b = toYaml(WELL_CTX);
    expect(a).toBe(b);
  });

  it('empty selection and prompt are absent (not undefined)', () => {
    const yaml = toYaml({ surface: 'project', active: { objectType: 'project', objectId: 'STU-1', label: 'S1' }, selection: [], prompt: '' });
    const parsed = parse(yaml) as Record<string, unknown>;
    expect(parsed.selection).toBeUndefined();
    expect(parsed.prompt).toBeUndefined();
  });

  it('stable YAML key order is surface → active → selection → prompt → asOf', () => {
    const obj = parse(toYaml(WELL_CTX)) as Record<string, unknown>;
    expect(Object.keys(obj)).toEqual(['surface', 'active', 'selection', 'prompt', 'asOf']);
  });
});