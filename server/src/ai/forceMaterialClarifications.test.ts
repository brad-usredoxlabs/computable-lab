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
    // No label on the ref, but the note snippet is used as the search seed
    // so the ClarificationPicker doesn't search with an empty query.
    expect(clarificationRequests[0]!.query).toContain('fenofibrate');
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

  // ===== instance-gap =====

  it('surfaces instance-gap for ontology concept without instance ref when tracked', () => {
    const events = [
      addMaterial({
        labwareId: 'lw-1',
        wells: ['A3'],
        material_ref: { kind: 'ontology', id: 'CHEBI:5001', label: 'fenofibrate' },
      }),
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events, {
      materialTrackingMode: 'tracked',
    });
    expect(kept).toHaveLength(0);
    expect(clarificationRequests).toHaveLength(1);
    expect(clarificationRequests[0]).toMatchObject({
      kind: 'material',
      menuProvider: '/m',
      query: 'fenofibrate',
    });
    expect(clarificationRequests[0]!.prompt).toContain('preparation or lot');
    expect(clarificationRequests[0]!.prompt).toContain('fenofibrate');
  });

  it('surfaces instance-gap for record concept without instance ref when tracked', () => {
    const events = [
      addMaterial({
        labwareId: 'lw-1',
        wells: ['A3'],
        material_ref: { kind: 'record', id: 'MAT-fenofibrate-3k9a', label: 'fenofibrate' },
      }),
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events, {
      materialTrackingMode: 'tracked',
    });
    expect(kept).toHaveLength(0);
    expect(clarificationRequests).toHaveLength(1);
    expect(clarificationRequests[0]).toMatchObject({
      kind: 'material',
      menuProvider: '/m',
      query: 'fenofibrate',
    });
  });

  it('does NOT surface instance-gap when materialTrackingMode is relaxed', () => {
    const events = [
      addMaterial({
        labwareId: 'lw-1',
        wells: ['A3'],
        material_ref: { kind: 'record', id: 'MAT-fenofibrate-3k9a', label: 'fenofibrate' },
      }),
    ];
    // Default mode is relaxed — should fall through to needs-quantity.
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events);
    expect(kept).toHaveLength(0);
    expect(clarificationRequests).toHaveLength(1);
    // needs-quantity, not instance-gap.
    expect(clarificationRequests[0]).toMatchObject({ kind: 'parameter', menuProvider: 'choice' });
    expect(clarificationRequests[0]!.prompt).toContain('volume and a concentration');
  });

  it('does NOT surface instance-gap when event already has material_instance_ref', () => {
    const events = [
      addMaterial({
        labwareId: 'lw-1',
        wells: ['A3'],
        material_ref: { kind: 'ontology', id: 'CHEBI:5001', label: 'fenofibrate' },
        material_instance_ref: { kind: 'record', id: 'MINST-001' },
      }),
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events, {
      materialTrackingMode: 'tracked',
    });
    // hasTrustedSpecOrAliquot catches material_instance_ref first → trusted.
    expect(kept).toHaveLength(1);
    expect(clarificationRequests).toHaveLength(0);
  });

  // ===== capability-gap =====

  it('surfaces capability-gap for mix with orbital_shaking >3000 rpm', () => {
    const events = [
      { event_type: 'mix', details: { labwareId: 'lw-1', mode: 'orbital_shaking', rpm: 5000 } },
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events);
    expect(kept).toHaveLength(0);
    expect(clarificationRequests).toHaveLength(1);
    expect(clarificationRequests[0]).toMatchObject({
      kind: 'general',
      menuProvider: 'choice',
    });
    expect(clarificationRequests[0]!.prompt).toContain('5000 rpm');
    expect(clarificationRequests[0]!.prompt).toContain('No available instrument');
  });

  it('does NOT surface capability-gap for mix with orbital_shaking <=3000 rpm', () => {
    const events = [
      { event_type: 'mix', details: { labwareId: 'lw-1', mode: 'orbital_shaking', rpm: 3000 } },
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events);
    // Not a material-bearing verb and not >3000 rpm → kept as-is.
    expect(kept).toHaveLength(1);
    expect(clarificationRequests).toHaveLength(0);
  });

  it('does NOT surface capability-gap for mix without orbital_shaking mode', () => {
    const events = [
      { event_type: 'mix', details: { labwareId: 'lw-1', mode: 'vortex', rpm: 5000 } },
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events);
    expect(kept).toHaveLength(1);
    expect(clarificationRequests).toHaveLength(0);
  });

  it('does NOT surface capability-gap for mix without rpm', () => {
    const events = [
      { event_type: 'mix', details: { labwareId: 'lw-1', mode: 'orbital_shaking' } },
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events);
    expect(kept).toHaveLength(1);
    expect(clarificationRequests).toHaveLength(0);
  });

  it('capability-gap keeps non-mix events untouched', () => {
    const events = [
      { event_type: 'incubate', details: { labwareId: 'lw-1', durationMinutes: 30 } },
      { event_type: 'mix', details: { labwareId: 'lw-1', mode: 'orbital_shaking', rpm: 5000 } },
      { event_type: 'read', details: { labwareId: 'lw-1' } },
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events);
    expect(kept).toHaveLength(2);
    expect(clarificationRequests).toHaveLength(1);
    expect(clarificationRequests[0]).toMatchObject({ kind: 'general', menuProvider: 'choice' });
  });
});

describe('a well-ready layer is trusted wherever it is carried (E1/E2)', () => {
  it('does NOT re-ask for a material-spec carried in material_ref', () => {
    // The observed loop: the repair wrote a grounded material-spec into
    // `material_ref`, and the gate — which only trusted `material_spec_ref` —
    // asked "I need a volume and a concentration for '1 mM Clofibrate in DMSO'."
    // A label that IS a concentration. It asked forever.
    const events = [
      addMaterial({
        labwareId: 'lw-1',
        wells: ['A1'],
        material_ref: {
          kind: 'record',
          id: 'MSP-API-mu50x5z7',
          type: 'material-spec',
          label: '1 mM Clofibrate in DMSO',
        },
      }),
    ];
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events);
    expect(clarificationRequests).toHaveLength(0);
    expect(kept).toHaveLength(1);
  });

  it('does NOT re-ask for an aliquot carried in material_ref', () => {
    const events = [
      addMaterial({
        labwareId: 'lw-1',
        wells: ['A1'],
        material_ref: { kind: 'record', id: 'ALQ-abc', type: 'aliquot', label: 'clofibrate aliquot' },
      }),
    ];
    const { clarificationRequests } = forceMaterialClarifications(events);
    expect(clarificationRequests).toHaveLength(0);
  });

  it('still asks for a quantity when the ref is only a bare CONCEPT', () => {
    // The hierarchy must not be collapsed: a concept is not a formulation.
    const events = [
      addMaterial({
        labwareId: 'lw-1',
        wells: ['A1'],
        material_ref: { kind: 'record', id: 'MAT-clofibrate', type: 'material', label: 'clofibrate' },
      }),
    ];
    const { clarificationRequests } = forceMaterialClarifications(events);
    expect(clarificationRequests).toHaveLength(1);
    expect(clarificationRequests[0]).toMatchObject({ kind: 'parameter' });
    expect(clarificationRequests[0]!.prompt).toContain('volume and a concentration');
  });

  it('does not trust a layer claim with no identity (no id grounds nothing)', () => {
    const events = [
      addMaterial({
        labwareId: 'lw-1',
        wells: ['A1'],
        material_ref: { kind: 'record', type: 'material-spec', label: '1 mM Clofibrate' },
      }),
    ];
    const { clarificationRequests } = forceMaterialClarifications(events);
    expect(clarificationRequests.length).toBeGreaterThan(0);
  });
});

describe('acceptUngrounded — a named-but-ungrounded material is ACCEPTED, not blocked (draft-friction, 2026-09-20)', () => {
  // Brad: "Add 200uL of DMEM" must ghost events onto the deck for review, with
  // the term confirmed in the accept/reject/redraft dialogue — never a blocking
  // pre-draft "which material?" card. The spine ran (resolveDraftMaterials),
  // DMEM had no LOCAL hit so it stayed a mint; the gate must keep it and let
  // the term panel confirm it, not re-interrogate the biologist.
  it('keeps a minted material in the draft and raises no question when acceptUngrounded', () => {
    const events = [
      addMaterial({
        labwareId: 'lw-1',
        wells: ['A2'],
        material_ref: { kind: 'draft', id: 'mint:DMEM', label: 'DMEM' },
      }),
    ]
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events, { acceptUngrounded: true })
    expect(clarificationRequests).toHaveLength(0)
    expect(kept).toHaveLength(1)
    // the mint survives so the term manifest can show it as unmatched/new
    expect((kept[0]!.details as Record<string, unknown>).material_ref).toMatchObject({ label: 'DMEM' })
  })

  it('keeps a free-text string material when acceptUngrounded (needs-quantity is deferred to accept)', () => {
    const events = [addMaterial({ labwareId: 'lw-1', wells: ['A2'], material_ref: 'DMEM' })]
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events, { acceptUngrounded: true })
    expect(clarificationRequests).toHaveLength(0)
    expect(kept).toHaveLength(1)
  })

  it('STILL asks when nothing names the material — even under acceptUngrounded', () => {
    const events = [addMaterial({ labwareId: 'lw-1', wells: ['A2'] })]
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events, { acceptUngrounded: true })
    expect(kept).toHaveLength(0)
    expect(clarificationRequests).toHaveLength(1)
    expect(clarificationRequests[0]!.prompt).toContain('A2')
  })

  it('does NOT change behaviour when acceptUngrounded is off (default stays strict)', () => {
    const events = [
      addMaterial({ labwareId: 'lw-1', wells: ['A2'], material_ref: { mint: { label: 'DMEM' } } }),
    ]
    const { events: kept, clarificationRequests } = forceMaterialClarifications(events)
    expect(kept).toHaveLength(0)
    expect(clarificationRequests).toHaveLength(1)
    expect(clarificationRequests[0]!).toMatchObject({ kind: 'material', menuProvider: '/m' })
  })

  it('capability gaps still ask regardless of acceptUngrounded', () => {
    const events = [{ event_type: 'mix', details: { labwareId: 'lw-1', mode: 'orbital_shaking', rpm: 5000 } }]
    const { clarificationRequests } = forceMaterialClarifications(events, { acceptUngrounded: true })
    expect(clarificationRequests).toHaveLength(1)
  })
});

describe('each question names the LAYER it is about (the picker scopes to it)', () => {
  it('a "which compound?" question is the concept layer', () => {
    const events = [
      addMaterial({ labwareId: 'lw-1', wells: ['A1'], material_ref: { mint: { label: 'unobtainium' } } }),
    ];
    const { clarificationRequests } = forceMaterialClarifications(events);
    expect(clarificationRequests[0]!.materialLayer).toBe('material');
  });

  it('a "how much?" question is about the formulation being built', () => {
    const events = [
      addMaterial({ labwareId: 'lw-1', wells: ['A1'], material_ref: { kind: 'record', id: 'MAT-x', type: 'material' } }),
    ];
    const { clarificationRequests } = forceMaterialClarifications(events);
    expect(clarificationRequests[0]!.materialLayer).toBe('material-spec');
  });

  it('an instance question (tracked mode) is the instance layer', () => {
    const events = [
      addMaterial({ labwareId: 'lw-1', wells: ['A1'], material_ref: { kind: 'record', id: 'MAT-x', type: 'material' }, concentration: { value: 1, unit: 'uM' } }),
    ];
    const { clarificationRequests } = forceMaterialClarifications(events, { materialTrackingMode: 'tracked' });
    expect(clarificationRequests[0]!.materialLayer).toBe('material-instance');
    expect(clarificationRequests[0]!.prompt).toContain('preparation or lot');
  });

  it('a capability question claims no material layer', () => {
    const events = [
      { event_type: 'mix', details: { wells: ['A1'], mode: 'orbital_shaking', rpm: 4000 } },
    ];
    const { clarificationRequests } = forceMaterialClarifications(events);
    expect(clarificationRequests[0]!.materialLayer).toBeUndefined();
  });
});

describe('what is owed depends on the TYPE (material rules per type)', () => {
  const cellLinePolicy = (layer: string, domain?: string) =>
    layer === 'material' && domain === 'cell_line'
      ? { requires: ['count'], question: 'How many "{label}" per well?' }
      : layer === 'material'
        ? { requires: ['concentration', 'volume'] }
        : null;

  it('a CELL LINE asks for a count — never a concentration', () => {
    // Brad's case: an adherent layer after the medium is aspirated is legitimately
    // zero-volume, so demanding a concentration asks a meaningless question.
    const events = [
      addMaterial({
        labwareId: 'lw-1',
        wells: ['A2', 'B2'],
        material_ref: { kind: 'record', id: 'MAT-MESH-D056945', type: 'material', label: 'HepG2 Cell', domain: 'cell_line' },
      }),
    ];
    const { clarificationRequests } = forceMaterialClarifications(events, { requirementsFor: cellLinePolicy });
    expect(clarificationRequests).toHaveLength(1);
    expect(clarificationRequests[0]!.prompt).toContain('count');
    expect(clarificationRequests[0]!.prompt).toContain('HepG2 Cell');
    expect(clarificationRequests[0]!.prompt).not.toContain('concentration');
    // the range is still named
    expect(clarificationRequests[0]!.prompt).toContain('A2');
  });

  it('a CHEMICAL still asks for a volume and a concentration', () => {
    const events = [
      addMaterial({
        labwareId: 'lw-1',
        wells: ['A2'],
        material_ref: { kind: 'record', id: 'MAT-x', type: 'material', label: 'clofibrate', domain: 'chemical' },
      }),
    ];
    const { clarificationRequests } = forceMaterialClarifications(events, { requirementsFor: cellLinePolicy });
    // the wording follows the registry's own order (concentration, volume)
    expect(clarificationRequests[0]!.prompt).toContain('a concentration and a volume');
  });

  it('a cell count is a complete addition — nothing is asked', () => {
    const events = [
      addMaterial({
        labwareId: 'lw-1',
        wells: ['A2'],
        material_ref: { kind: 'record', id: 'MAT-MESH-D056945', type: 'material', label: 'HepG2 Cell', domain: 'cell_line' },
        count: 10000,
      }),
    ];
    const { clarificationRequests } = forceMaterialClarifications(events, { requirementsFor: cellLinePolicy });
    expect(clarificationRequests).toHaveLength(0);
  });

  it('without a registry the gate keeps its own default wording', () => {
    const events = [
      addMaterial({ labwareId: 'lw-1', wells: ['A2'], material_ref: { kind: 'record', id: 'MAT-x', type: 'material' } }),
    ];
    const { clarificationRequests } = forceMaterialClarifications(events);
    expect(clarificationRequests[0]!.prompt).toContain('a volume and a concentration');
  });
});

describe('an adherent cell addition is complete as the biologist said it (Brad, 2026-09-20)', () => {
  // "We are trying to capture what happened in a way that is least encumbering.
  //  If they want to say 'add 10,000 HepG2 cells in 72 uL of DMEM' we should
  //  accept their volume. If they say 'this plate has 10,000 adhered HepG2 cells'
  //  then we allow THAT."
  const cellPolicy = (layer: string, domain?: string) =>
    layer === 'material' && domain === 'cell_line'
      ? { requires: ['count'], question: 'How many "{label}" per well?' }
      : layer === 'material'
        ? { requires: ['concentration', 'volume'] }
        : null;
  const cells = (extra: Record<string, unknown>) => [
    addMaterial({
      labwareId: 'lw-1',
      wells: ['A2'],
      material_ref: { kind: 'record', id: 'MAT-MESH-D056945', type: 'material', label: 'HepG2 Cell', domain: 'cell_line' },
      ...extra,
    }),
  ];

  it('ACCEPTS "add 10,000 HepG2 cells in 72 uL of DMEM" — the volume is taken as given', () => {
    const { events, clarificationRequests } = forceMaterialClarifications(
      cells({ count: 10000, volume: { value: 72, unit: 'uL' } }),
      { requirementsFor: cellPolicy },
    );
    expect(clarificationRequests).toHaveLength(0);
    const details = (events[0] as { details: Record<string, unknown> }).details;
    expect(details.count).toBe(10000);
    expect(details.volume).toEqual({ value: 72, unit: 'uL' });   // never rewritten
  });

  it('ACCEPTS "add 10,000 HepG2 cells" — an adhered layer has ZERO volume', () => {
    const { events, clarificationRequests } = forceMaterialClarifications(cells({ count: 10000 }), {
      requirementsFor: cellPolicy,
    });
    expect(clarificationRequests).toHaveLength(0);
    expect((events[0] as { details: Record<string, unknown> }).details.volume).toBeUndefined();
  });

  it('NEVER asks a cell addition for a volume', () => {
    const { clarificationRequests } = forceMaterialClarifications(cells({}), { requirementsFor: cellPolicy });
    expect(clarificationRequests).toHaveLength(1);
    expect(clarificationRequests[0]!.prompt).toContain('count');
    expect(clarificationRequests[0]!.prompt).not.toContain('volume');
    expect(clarificationRequests[0]!.prompt).not.toContain('concentration');
  });
});
