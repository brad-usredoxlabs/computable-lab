import { describe, it, expect } from 'vitest';
import { forceMaterialClarifications } from './forceMaterialClarifications.js';

function addMaterial(details: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { event_type: 'add_material', details, ...extra };
}

describe('forceMaterialClarifications', () => {
  it('clarifies an add_material whose material survives only in a note (no material_ref)', () => {
    const events = [
      addMaterial({
        labwareId: 'lw-1',
        wells: ['A3'],
        volume: { value: 10, unit: 'uL' },
        note: 'Adding fenofibrate to A3 which already contains CHO-K1 cells.',
      }),
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events);
    expect(kept).toHaveLength(0);
    expect(clarificationRequests).toHaveLength(1);
    expect(clarificationRequests[0]).toMatchObject({
      kind: 'material',
      menuProvider: '/m',
      allowCreateLocal: true,
    });
    // No label to seed from; prompt falls back to the well.
    expect(clarificationRequests[0]!.prompt).toContain('A3');
    expect(clarificationRequests[0]!.query).toBeUndefined();
  });

  it('clarifies a mint/draft material_ref and seeds the menu with its label', () => {
    const events = [
      addMaterial({
        labwareId: 'lw-1',
        wells: ['A3'],
        material_ref: { kind: 'draft', id: 'mint:fenofibrate', label: 'fenofibrate' },
      }),
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events);
    expect(kept).toHaveLength(0);
    expect(clarificationRequests[0]).toMatchObject({
      kind: 'material',
      menuProvider: '/m',
      allowCreateLocal: true,
      query: 'fenofibrate',
    });
    expect(clarificationRequests[0]!.prompt).toContain('fenofibrate');
  });

  it('clarifies a memory-recalled ontology CURIE in draft mode (not in resolved_context)', () => {
    const events = [
      addMaterial({
        labwareId: 'lw-1',
        wells: ['A3'],
        material_ref: { kind: 'ontology', id: 'CHEBI:5001', namespace: 'CHEBI', label: 'fenofibrate' },
      }),
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events, {
      policeUnverifiedCuries: true,
    });
    expect(kept).toHaveLength(0);
    expect(clarificationRequests[0]).toMatchObject({ kind: 'material', menuProvider: '/m', query: 'fenofibrate' });
  });

  it('trusts an ontology CURIE the user explicitly resolved (in resolved_context)', () => {
    const events = [
      addMaterial({
        labwareId: 'lw-1',
        wells: ['A3'],
        material_ref: { kind: 'ontology', id: 'CHEBI:5001', label: 'fenofibrate' },
      }),
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events, {
      resolvedCuries: ['CHEBI:5001'],
      policeUnverifiedCuries: true,
    });
    expect(kept).toHaveLength(1);
    expect(clarificationRequests).toHaveLength(0);
  });

  it('trusts an ontology CURIE when not policing CURIEs (re-compile modes validate them)', () => {
    const events = [
      addMaterial({
        labwareId: 'lw-1',
        wells: ['A3'],
        material_ref: { kind: 'ontology', id: 'CHEBI:5001', label: 'fenofibrate' },
      }),
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events, {
      policeUnverifiedCuries: false,
    });
    expect(kept).toHaveLength(1);
    expect(clarificationRequests).toHaveLength(0);
  });

  it('trusts a record ref to an existing local material', () => {
    const events = [
      addMaterial({
        labwareId: 'lw-1',
        wells: ['A3'],
        material_ref: { kind: 'record', id: 'MAT-fenofibrate-3k9a', type: 'material', label: 'fenofibrate' },
      }),
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events);
    expect(kept).toHaveLength(1);
    expect(clarificationRequests).toHaveLength(0);
  });

  it('trusts an event grounded via a record-backed material_spec_ref / aliquot_ref', () => {
    const events = [
      addMaterial({ labwareId: 'lw-1', wells: ['A3'], material_spec_ref: { kind: 'record', id: 'MSP-001' } }),
      addMaterial({ labwareId: 'lw-1', wells: ['B3'], aliquot_ref: { kind: 'record', id: 'ALQ-002' } }),
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events);
    expect(kept).toHaveLength(2);
    expect(clarificationRequests).toHaveLength(0);
  });

  it('keeps grounded events and clarifies only the ungrounded one', () => {
    const events = [
      addMaterial({ labwareId: 'lw-1', wells: ['A1'], material_ref: { kind: 'record', id: 'MAT-known-0001', label: 'known' } }),
      addMaterial({ labwareId: 'lw-1', wells: ['A2'], material_ref: { kind: 'draft', id: 'mint:mystery', label: 'mystery' } }),
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events);
    expect(kept).toHaveLength(1);
    expect((kept[0]!.details as Record<string, unknown>).wells).toEqual(['A1']);
    expect(clarificationRequests).toHaveLength(1);
    expect(clarificationRequests[0]!.query).toBe('mystery');
  });

  it('leaves non-material events untouched', () => {
    const events = [
      { event_type: 'incubate', details: { labwareId: 'lw-1', durationMinutes: 30 } },
      { event_type: 'read', details: { labwareId: 'lw-1' } },
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events);
    expect(kept).toHaveLength(2);
    expect(clarificationRequests).toHaveLength(0);
  });

  it('treats a freetext (non-CURIE) string material_ref as ungrounded', () => {
    const events = [
      addMaterial({ labwareId: 'lw-1', wells: ['A3'], material_ref: 'fenofibrate' }),
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events);
    expect(kept).toHaveLength(0);
    expect(clarificationRequests[0]).toMatchObject({ query: 'fenofibrate', menuProvider: '/m' });
  });

  it('assigns stable per-event request ids', () => {
    const events = [
      addMaterial({ labwareId: 'lw-1', wells: ['A1'], material_ref: { kind: 'record', id: 'MAT-ok-0001' } }),
      addMaterial({ labwareId: 'lw-1', wells: ['A2'], material_ref: { kind: 'draft', id: 'mint:x', label: 'x' } }),
    ];
    const { clarificationRequests } = forceMaterialClarifications(events);
    expect(clarificationRequests[0]!.id).toBe('material-2');
  });
});
