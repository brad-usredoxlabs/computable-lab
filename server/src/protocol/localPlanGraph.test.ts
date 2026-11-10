// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildLocalPlanGraph } from './localPlanGraph.js';

const labwareRef = { kind: 'record', id: 'LBW-1', type: 'labware-instance' };
const materialRef = { kind: 'record', id: 'MAT-1', type: 'material-instance' };
const instrumentRef = { kind: 'record', id: 'EQ-1', type: 'equipment' };

const twoStepProtocol = {
  roles: {
    labwareRoles: [{ roleId: 'plate' }],
    materialRoles: [{ roleId: 'reagent' }],
    instrumentRoles: [{ roleId: 'reader' }],
  },
  steps: [
    {
      stepId: 'add-compound', label: 'Add compound', ordinal: 1, kind: 'add_material',
      target: { labwareRole: 'plate' }, wells: 'A1',
      material: { materialRole: 'reagent' }, volume_uL: 50,
    },
    {
      stepId: 'read-plate', label: 'Read plate', ordinal: 2, kind: 'read',
      target: { labwareRole: 'plate' }, wells: 'A1', instrumentRole: 'reader',
    },
  ],
};

const fullBindings = {
  labware: [{ roleId: 'plate', labwareInstanceRef: labwareRef }],
  materials: [{ roleId: 'reagent', materialRef, lotNumber: 'L-9' }],
  instruments: [{ roleId: 'reader', instrumentRef }],
};

function stringValuesDeep(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringValuesDeep);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringValuesDeep);
  return [];
}

function keysDeep(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysDeep);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...keysDeep(child)]);
}

describe('buildLocalPlanGraph', () => {
  it('binds every step role reference to its concrete ref, in step order', () => {
    const result = buildLocalPlanGraph({ protocolId: 'PRT-1', protocol: twoStepProtocol, bindings: fullBindings });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`${result.code}: ${result.roleId}`);

    expect(result.events.map((e) => e.stepId)).toEqual(['add-compound', 'read-plate']);
    expect(result.events.map((e) => e.event_type)).toEqual(['add_material', 'read']);

    const [add, read] = result.events;
    expect(add.details).toMatchObject({
      target: { labwareRole: labwareRef }, material: { materialRole: materialRef }, volume_uL: 50,
    });
    expect(read.details).toMatchObject({ target: { labwareRole: labwareRef }, instrumentRole: instrumentRef });

    // No abstract role string survives anywhere in the emitted plan.
    const emittedStrings = stringValuesDeep(result.events);
    for (const roleId of ['plate', 'reagent', 'reader']) expect(emittedStrings).not.toContain(roleId);

    // D8.4: no measured value invented; only values the step already carried.
    const emittedKeys = keysDeep(result.events);
    for (const invented of ['cells', 'density', 'cellCount']) expect(emittedKeys).not.toContain(invented);
    expect(emittedStrings).not.toContain(String(50));
  });

  it('is deterministic: identical input yields byte-identical events', () => {
    const first = buildLocalPlanGraph({ protocolId: 'PRT-1', protocol: twoStepProtocol, bindings: fullBindings });
    const second = buildLocalPlanGraph({ protocolId: 'PRT-1', protocol: twoStepProtocol, bindings: fullBindings });
    expect(first).toEqual(second);
    expect(first.ok && first.events.map((e) => e.eventId)).toEqual(['0-add-compound', '1-read-plate']);
  });

  it('names the unbound role and returns no events (no partial graph)', () => {
    const result = buildLocalPlanGraph({
      protocolId: 'PRT-1',
      protocol: twoStepProtocol,
      bindings: { labware: fullBindings.labware, instruments: fullBindings.instruments },
    });
    expect(result).toEqual({ ok: false, code: 'UNBOUND_ROLE', roleId: 'reagent', stepId: 'add-compound' });
    expect(result).not.toHaveProperty('events');
  });

  it('names the role and step when the protocol declares no roles at all', () => {
    const result = buildLocalPlanGraph({
      protocolId: 'PRT-1',
      protocol: { steps: twoStepProtocol.steps },
      bindings: fullBindings,
    });
    expect(result).toEqual({ ok: false, code: 'UNDECLARED_ROLE', roleId: 'plate', stepId: 'add-compound' });
    expect(result).not.toHaveProperty('events');
  });

  it('rejects a role reference absent from the declared role set, even when bound', () => {
    const result = buildLocalPlanGraph({
      protocolId: 'PRT-1',
      protocol: {
        roles: { labwareRoles: [{ roleId: 'plate' }] },
        steps: [
          {
            stepId: 'add-compound', label: 'Add compound', ordinal: 1, kind: 'add_material',
            target: { labwareRole: 'vessel' }, wells: 'A1',
            material: { materialRole: 'reagent' }, volume_uL: 50,
          },
        ],
      },
      bindings: {
        labware: [
          { roleId: 'plate', labwareInstanceRef: labwareRef },
          { roleId: 'vessel', labwareInstanceRef: { kind: 'record', id: 'LBW-2', type: 'labware-instance' } },
        ],
        materials: [{ roleId: 'reagent', materialRef }],
      },
    });
    expect(result).toEqual({ ok: false, code: 'UNDECLARED_ROLE', roleId: 'vessel', stepId: 'add-compound' });
    expect(result).not.toHaveProperty('events');
  });
});
