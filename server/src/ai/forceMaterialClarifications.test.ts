import { describe, it, expect } from 'vitest';
import { forceMaterialClarifications } from './forceMaterialClarifications.js';

function addMaterial(details: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { event_type: 'add_material', details, ...extra };
}

/** A concentration makes a named compound a formulation — accept-time mints the
 * material-spec, so the net should leave the event alone. */
const CONC = { value: 1, unit: 'uM' };

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
    // …but the note rides along as the snippet so the card still shows WHICH
    // material is being asked about (disambiguates a multi-material prompt).
    expect(clarificationRequests[0]!.snippet).toContain('fenofibrate');
  });

  it('asks for a quantity (not a picker) when a named concept carries no concentration', () => {
    const events = [
      addMaterial({
        labwareId: 'lw-1',
        wells: ['A3'],
        material_ref: { kind: 'draft', id: 'mint:fenofibrate', label: 'fenofibrate' },
      }),
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events);
    expect(kept).toHaveLength(0);
    // Plain "answer in chat" prompt — no /m material picker.
    expect(clarificationRequests[0]).toMatchObject({
      kind: 'parameter',
      menuProvider: 'choice',
    });
    expect(clarificationRequests[0]!.options).toHaveLength(0);
    expect(clarificationRequests[0]!.prompt).toContain('volume and a concentration');
    expect(clarificationRequests[0]!.prompt).toContain('fenofibrate');
  });

  it('asks for a quantity for a free-text (non-CURIE) string material_ref with no concentration', () => {
    const events = [
      addMaterial({ labwareId: 'lw-1', wells: ['A3'], material_ref: 'fenofibrate' }),
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events);
    expect(kept).toHaveLength(0);
    expect(clarificationRequests[0]).toMatchObject({ kind: 'parameter', menuProvider: 'choice' });
    expect(clarificationRequests[0]!.prompt).toContain('fenofibrate');
  });

  it('asks for a quantity for a known local concept record with no concentration', () => {
    const events = [
      addMaterial({
        labwareId: 'lw-1',
        wells: ['A3'],
        material_ref: { kind: 'record', id: 'MAT-fenofibrate-3k9a', type: 'material', label: 'fenofibrate' },
      }),
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events);
    expect(kept).toHaveLength(0);
    expect(clarificationRequests[0]).toMatchObject({ kind: 'parameter', menuProvider: 'choice' });
  });

  it('trusts a named concept that carries a concentration (a formulation — minted at accept)', () => {
    const events = [
      addMaterial({
        labwareId: 'lw-1',
        wells: ['A3'],
        material_ref: { kind: 'record', id: 'MAT-fenofibrate-3k9a', type: 'material', label: 'fenofibrate' },
        concentration: CONC,
      }),
      addMaterial({
        labwareId: 'lw-1',
        wells: ['B3'],
        material_ref: { kind: 'draft', id: 'mint:clofibrate', label: 'clofibrate' },
        concentration: CONC,
      }),
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events);
    expect(kept).toHaveLength(2);
    expect(clarificationRequests).toHaveLength(0);
  });

  it('trusts a named concept that carries a cell count (an instance — minted at accept)', () => {
    const events = [
      addMaterial({
        labwareId: 'lw-1',
        wells: ['A3'],
        material_ref: { kind: 'record', id: 'MAT-hepg2-0001', label: 'HepG2' },
        count: 100000,
      }),
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events);
    expect(kept).toHaveLength(1);
    expect(clarificationRequests).toHaveLength(0);
  });

  it('clarifies a memory-recalled ontology CURIE in draft mode (regardless of quantity)', () => {
    const events = [
      addMaterial({
        labwareId: 'lw-1',
        wells: ['A3'],
        material_ref: { kind: 'ontology', id: 'CHEBI:5001', namespace: 'CHEBI', label: 'fenofibrate' },
        concentration: CONC,
      }),
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events, {
      policeUnverifiedCuries: true,
    });
    expect(kept).toHaveLength(0);
    // An unconfirmed term is asked WHICH-material first, even with a concentration.
    expect(clarificationRequests[0]).toMatchObject({ kind: 'material', menuProvider: '/m', query: 'fenofibrate' });
  });

  it('trusts an ontology CURIE the user resolved when it carries a concentration', () => {
    const events = [
      addMaterial({
        labwareId: 'lw-1',
        wells: ['A3'],
        material_ref: { kind: 'ontology', id: 'CHEBI:5001', label: 'fenofibrate' },
        concentration: CONC,
      }),
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events, {
      resolvedCuries: ['CHEBI:5001'],
      policeUnverifiedCuries: true,
    });
    expect(kept).toHaveLength(1);
    expect(clarificationRequests).toHaveLength(0);
  });

  it('asks for a quantity for a resolved ontology CURIE with no concentration', () => {
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
    expect(kept).toHaveLength(0);
    expect(clarificationRequests[0]).toMatchObject({ kind: 'parameter', menuProvider: 'choice' });
  });

  it('trusts an ontology CURIE with concentration when not policing CURIEs (re-compile modes validate them)', () => {
    const events = [
      addMaterial({
        labwareId: 'lw-1',
        wells: ['A3'],
        material_ref: { kind: 'ontology', id: 'CHEBI:5001', label: 'fenofibrate' },
        concentration: CONC,
      }),
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events, {
      policeUnverifiedCuries: false,
    });
    expect(kept).toHaveLength(1);
    expect(clarificationRequests).toHaveLength(0);
  });

  it('trusts a ≥2-component composition snapshot (a mixture, minted at accept)', () => {
    const events = [
      addMaterial({
        labwareId: 'lw-1',
        wells: ['A3'],
        material_ref: { kind: 'draft', id: 'mint:media', label: 'growth media' },
        composition_snapshot: [{ component_ref: 'a' }, { component_ref: 'b' }],
      }),
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events);
    expect(kept).toHaveLength(1);
    expect(clarificationRequests).toHaveLength(0);
  });

  it('trusts events grounded via a well-ready material (spec / aliquot / instance / vendor)', () => {
    const events = [
      addMaterial({ labwareId: 'lw-1', wells: ['A3'], material_spec_ref: { kind: 'record', id: 'MSP-001' } }),
      addMaterial({ labwareId: 'lw-1', wells: ['B3'], aliquot_ref: { kind: 'record', id: 'ALQ-002' } }),
      addMaterial({ labwareId: 'lw-1', wells: ['C3'], material_instance_ref: { kind: 'record', id: 'MINST-003' } }),
      addMaterial({ labwareId: 'lw-1', wells: ['D3'], vendor_product_ref: { kind: 'record', id: 'VP-004' } }),
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events);
    expect(kept).toHaveLength(4);
    expect(clarificationRequests).toHaveLength(0);
  });

  it('keeps grounded events and clarifies only the ungrounded one', () => {
    const events = [
      addMaterial({ labwareId: 'lw-1', wells: ['A1'], material_ref: { kind: 'record', id: 'MAT-known-0001', label: 'known' }, concentration: CONC }),
      addMaterial({ labwareId: 'lw-1', wells: ['A2'], material_ref: { kind: 'draft', id: 'mint:mystery', label: 'mystery' } }),
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events);
    expect(kept).toHaveLength(1);
    expect((kept[0]!.details as Record<string, unknown>).wells).toEqual(['A1']);
    expect(clarificationRequests).toHaveLength(1);
    expect(clarificationRequests[0]!.prompt).toContain('mystery');
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

  it('assigns stable per-event request ids', () => {
    const events = [
      addMaterial({ labwareId: 'lw-1', wells: ['A1'], material_ref: { kind: 'record', id: 'MAT-ok-0001' }, concentration: CONC }),
      addMaterial({ labwareId: 'lw-1', wells: ['A2'], material_ref: { kind: 'draft', id: 'mint:x', label: 'x' } }),
    ];
    const { clarificationRequests } = forceMaterialClarifications(events);
    expect(clarificationRequests[0]!.id).toBe('material-2');
  });
});
