import { describe, it, expect } from 'vitest';
import { forceMaterialClarifications } from './forceMaterialClarifications.js';
import { bindMaterialAnswersToEvents } from './materialBinding.js';

/**
 * Brad's report (2026-09-20, lfm-local): he selected A2:H2 and typed
 * "Add 100ul of 1mM clofibrate to the selected wells." and got a SEPARATE
 * clarification per well — one offering to mint a formulation for A2, others
 * finding saved formulations for B2…H2 — and answering bound only event[0].
 *
 * Root cause: the model drafts one event per well (a range expands to N events),
 * and every layer of the pipeline treated each event as its own question. A
 * range of wells receiving the SAME material is ONE lab act and must be ONE
 * question — and one answer must land on every well in it.
 */
function perWellEvent(well: string, extra: Record<string, unknown> = {}) {
  return {
    event_type: 'add_material',
    details: {
      labwareId: 'req:CL:96_well_plate:mu9azzva:if7jwo',
      wells: [well],
      note: 'Add 100ul of 1mM clofibrate',
      ...extra,
    },
  };
}

const range = ['A2', 'B2', 'C2', 'D2', 'E2', 'F2', 'G2', 'H2'];

describe('a range of wells is ONE question, not one per well', () => {
  it('asks once when every well names the same material (minted)', () => {
    const events = range.map((well) => perWellEvent(well, { material_ref: { mint: { label: 'clofibrate' } } }));
    const { clarificationRequests } = forceMaterialClarifications(events);
    expect(clarificationRequests).toHaveLength(1);
    // …and the question says it is about the whole range, not just A2.
    expect(clarificationRequests[0]!.prompt).toContain('A2');
    expect(clarificationRequests[0]!.prompt).toContain('H2');
  });

  it('asks once when the wells name no material at all (the note carries it)', () => {
    const events = range.map((well) => perWellEvent(well));
    const { clarificationRequests } = forceMaterialClarifications(events);
    expect(clarificationRequests).toHaveLength(1);
  });

  it('one answer binds to EVERY well in the range', () => {
    const events = range.map((well) => perWellEvent(well, { material_ref: { mint: { label: 'clofibrate' } } }));
    const { events: bound } = bindMaterialAnswersToEvents(events, [
      {
        requestId: 'material-1',
        label: '1 mM Clofibrate in DMSO',
        mentionToken: '[[material-spec:MSP-API-mu50x5z7|1 mM Clofibrate in DMSO]]',
        ref: {
          kind: 'record',
          id: 'MSP-API-mu50x5z7',
          type: 'material-spec',
          label: '1 mM Clofibrate in DMSO',
        },
      },
    ]);
    for (const [index, event] of bound.entries()) {
      const details = event.details as Record<string, unknown>;
      expect(details.material_spec_ref, `well ${range[index]}`).toMatchObject({ id: 'MSP-API-mu50x5z7' });
      expect(details.material_ref).toBeUndefined();
    }
    // and the whole range is now trusted — nothing left to ask
    const net = forceMaterialClarifications(bound as unknown as Record<string, unknown>[]);
    expect(net.clarificationRequests).toHaveLength(0);
    expect(net.events).toHaveLength(range.length);
  });

  it('still asks SEPARATELY when the wells name different materials', () => {
    const events = [
      perWellEvent('A2', { material_ref: { mint: { label: 'clofibrate' } } }),
      perWellEvent('B2', { material_ref: { mint: { label: 'rotenone' } } }),
    ];
    const { clarificationRequests } = forceMaterialClarifications(events);
    expect(clarificationRequests).toHaveLength(2);
  });
});

describe('a selected range is NOT automatically one addition (Brad, 2026-09-20)', () => {
  it('asks PER WELL when each well owes its own amount — a serial dilution', () => {
    // "do a serial dilution down this column": same material, different amount
    // in every well. Collapsing those into one question would decide the
    // biologist's dilution for them.
    const events = ['A2', 'B2', 'C2'].map((well) =>
      perWellEvent(well, {
        material_ref: { kind: 'record', id: 'MAT-clofibrate-wzj2', type: 'material', label: 'clofibrate' },
      }),
    );
    const { clarificationRequests } = forceMaterialClarifications(events);
    expect(clarificationRequests).toHaveLength(3);
    expect(clarificationRequests.map((r) => r.prompt).join(' ')).toContain('A2');
    expect(clarificationRequests.map((r) => r.prompt).join(' ')).toContain('C2');
  });

  it('does NOT fan an answer out on a note- or labware-only signal', () => {
    // No event names its material; they only share a plate. One pick must not be
    // written into wells whose material the draft never named.
    const events = ['A2', 'B2', 'C2'].map((well) => ({
      event_type: 'add_material',
      details: {
        labwareId: 'plate-1',
        wells: [well],
        material_ref: { mint: { label: 'clofibrate' } },
      },
    }));
    // strip the refs so only the labware fallback remains
    for (const e of events) delete (e.details as Record<string, unknown>).material_ref;
    const { events: bound, bound: bindings } = bindMaterialAnswersToEvents(events, [
      { requestId: 'material-1', ref: { kind: 'record', id: 'MSP-x', type: 'material-spec', label: 'x' } },
    ]);
    expect(bindings[0]!.eventIndexes).toEqual([0]);
    expect((bound[1]!.details as Record<string, unknown>).material_spec_ref).toBeUndefined();
    expect((bound[2]!.details as Record<string, unknown>).material_spec_ref).toBeUndefined();
  });

  it('still fans out when every well NAMES the same material', () => {
    const events = ['A2', 'B2', 'C2'].map((well) =>
      perWellEvent(well, { material_ref: { mint: { label: 'clofibrate' } } }),
    );
    const { bound } = bindMaterialAnswersToEvents(events, [
      { requestId: 'material-1', ref: { kind: 'record', id: 'MSP-x', type: 'material-spec', label: 'x' } },
    ]);
    expect(bound[0]!.eventIndexes).toEqual([0, 1, 2]);
  });
});
