import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import {
  followUpForLayer,
  outstandingRequirements,
  renderLayerQuestion,
  type LayerPolicy,
} from './materialFollowUp.js';
import { loadDefaultMaterialProfileRegistry } from '../materials/MaterialProfileRegistry.js';

const SCHEMA_DIR = resolve(__dirname, '../../..', 'schema');
const policy: LayerPolicy = loadDefaultMaterialProfileRegistry(SCHEMA_DIR).clarificationPolicy();

describe('what a pick still owes comes from the registry table', () => {
  it('a formulation owes a VOLUME only — its concentration is already fixed', () => {
    // The observed dead end: the gate asked for "a volume and a concentration"
    // for a material whose name IS a concentration. The layer says otherwise.
    expect(outstandingRequirements(policy, 'material-spec', {})).toEqual(['volume']);
  });

  it('an aliquot and an instance owe nothing', () => {
    expect(outstandingRequirements(policy, 'aliquot', {})).toEqual([]);
    expect(outstandingRequirements(policy, 'material-instance', {})).toEqual([]);
  });

  it('a bare concept owes a concentration and a volume', () => {
    expect(outstandingRequirements(policy, 'material', {})).toEqual(['concentration', 'volume']);
  });

  it('counts a value as present only when it is really there', () => {
    expect(outstandingRequirements(policy, 'material-spec', { volume: { value: 10, unit: 'uL' } })).toEqual([]);
    expect(outstandingRequirements(policy, 'material-spec', { volume: {} })).toEqual(['volume']);
    expect(outstandingRequirements(policy, 'material-spec', { volume: '  ' })).toEqual(['volume']);
    expect(outstandingRequirements(policy, 'material-spec', { volume: 0 })).toEqual([]);
  });

  it('returns null for a layer the registry does not declare (never invents)', () => {
    expect(outstandingRequirements(policy, 'nonsense' as never, {})).toBeNull();
    expect(outstandingRequirements(undefined, 'material-spec', {})).toBeNull();
  });

  it('asks a question the biologist can actually answer', () => {
    const request = followUpForLayer({
      policy,
      layer: 'material-spec',
      label: '1 mM Clofibrate in DMSO',
      well: 'A1',
      details: {},
      requestId: 'material-1',
    });
    expect(request).not.toBeNull();
    expect(request!.kind).toBe('parameter');
    expect(request!.menuProvider).toBe('choice');
    expect(request!.options).toEqual([]);
    expect(request!.materialLayer).toBe('material-spec');
    expect(request!.prompt).toContain('prepared solution');
    expect(request!.prompt).toContain('still need volume');
    // …and NOT a concentration, which is what made the old question unanswerable.
    expect(request!.prompt).not.toContain('concentration');
  });

  it('asks nothing when the pick is already well-formed', () => {
    expect(
      followUpForLayer({
        policy,
        layer: 'aliquot',
        label: 'clofibrate aliquot A1',
        details: {},
        requestId: 'material-1',
      }),
    ).toBeNull();
    expect(
      followUpForLayer({
        policy,
        layer: 'material-spec',
        label: '1 mM Clofibrate in DMSO',
        details: { volume: { value: 10, unit: 'uL' } },
        requestId: 'material-1',
      }),
    ).toBeNull();
  });

  it('renders the registry template rather than a hardcoded sentence', () => {
    expect(renderLayerQuestion('Which prepared solution of "{label}" should this use?', 'X')).toBe(
      'Which prepared solution of "X" should this use?',
    );
  });
});

describe('the follow-up obeys the TYPE, not the global default (regression)', () => {
  it('never asks a CELL line for a volume', () => {
    // Observed: "…I still need volume for HepG2 Cell (A2)." on a cell addition.
    const ask = followUpForLayer({
      policy,
      layer: 'material',
      label: 'HepG2 Cell',
      well: 'A2',
      details: { concentration: { value: 50, unit: 'cells/uL' } },
      requirements: ['count'],           // the cell_line override
      requestId: 'material-1',
    });
    expect(ask).not.toBeNull();
    expect(ask!.prompt).not.toContain('volume');
    expect(ask!.prompt).toContain('count');
  });

  it('asks nothing at all when the type owes only what is already there', () => {
    const ask = followUpForLayer({
      policy,
      layer: 'material',
      label: 'HepG2 Cell',
      details: { count: 10000 },
      requirements: ['count'],
      requestId: 'material-1',
    });
    expect(ask).toBeNull();
  });

  it('names the whole range the answer covered', () => {
    const ask = followUpForLayer({
      policy,
      layer: 'material',
      label: 'HepG2 Cell',
      wells: ['A2', 'B2', 'C2', 'D2'],
      details: {},
      requirements: ['count'],
      requestId: 'material-1',
    });
    expect(ask!.prompt).toContain('A2–D2 (4 wells)');
  });
});
