// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  enrichDraftResultEvents,
  type MaterialLabeler,
  type EnrichAddMaterialRefsOptions,
} from './materialRefLabels.js';

const stubLabeler: MaterialLabeler = {
  lookup: async (curie) => {
    const labels: Record<string, string> = {
      'CHEBI:17790': 'methanol',
      'CHEBI:15377': 'water',
      'local:MSP-clofibrate-form': '1 mM Clofibrate in DMSO',
    };
    return labels[curie] ?? null;
  },
};

describe('enrichDraftResultEvents', () => {
  it('leaves a non-add_material event byte-identical', async () => {
    const result = {
      success: true as const,
      events: [
        {
          eventId: 'evt-wash',
          event_type: 'wash',
          verb: 'wash',
          details: { well: 'A1', solvent: 'water' },
        },
      ],
    };
    const out = await enrichDraftResultEvents(result, { labeler: stubLabeler });
    expect(out).toBe(result);
    expect(out.events).toEqual([
      {
        eventId: 'evt-wash',
        event_type: 'wash',
        verb: 'wash',
        details: { well: 'A1', solvent: 'water' },
      },
    ]);
  });

  it('returns a result with no events or empty events byte-identical', async () => {
    const noEvents: { success: boolean } = { success: true };
    const outNoEvents = await enrichDraftResultEvents(noEvents, { labeler: stubLabeler });
    expect(outNoEvents).toBe(noEvents);

    const emptyEvents = { success: true, events: [] };
    const outEmpty = await enrichDraftResultEvents(emptyEvents, { labeler: stubLabeler });
    expect(outEmpty).toBe(emptyEvents);
  });

  it('does NOT mint a draft ref for a plain material label (compile-path parity)', async () => {
    const result = {
      success: true as const,
      events: [
        {
          eventId: 'evt-1',
          event_type: 'add_material',
          verb: 'add_material',
          details: { well: 'A2', material: '1 mM Clofibrate in DMSO', volumeUl: 1 },
        },
      ],
    };
    const out = await enrichDraftResultEvents(result, { labeler: stubLabeler });
    // enrichDraftResultEvents must NOT fabricate a mint ref — the compiled graph
    // must stay byte-identical to the deterministic compiler's output.
    // The details are left untouched (no material_ref key).
    const details = (out.events?.[0] as Record<string, unknown>).details as Record<string, unknown>;
    expect(details.material_ref).toBeUndefined();
  });

  it('does not re-expand an existing composition_snapshot (idempotence)', async () => {
    const existingSnapshot = [{ component_ref: { kind: 'ontology', id: 'CHEBI:17790' }, role: 'component' as const }];
    const result = {
      success: true as const,
      events: [
        {
          eventId: 'evt-1',
          event_type: 'add_material',
          verb: 'add_material',
          details: {
            well: 'A2',
            material_ref: { kind: 'record', id: 'MSP-clofibrate-form' },
            material_spec_ref: { kind: 'record', id: 'MSP-clofibrate-form' },
            composition_snapshot: existingSnapshot,
          },
        },
      ],
    };
    const out = await enrichDraftResultEvents(result, { labeler: stubLabeler });
    const details = (out.events?.[0] as Record<string, unknown>).details as Record<string, unknown>;
    // Snapshot should be untouched — same length, same content
    expect(details.composition_snapshot).toEqual(existingSnapshot);
  });

  it('does NOT mint a draft ref for a plain material label (compile-path parity)', async () => {
    const result = {
      success: true as const,
      events: [
        {
          eventId: 'evt-1',
          event_type: 'add_material',
          verb: 'add_material',
          details: { well: 'B3', material: 'PBS', volumeUl: 100 },
        },
      ],
    };
    const out = await enrichDraftResultEvents(result, { labeler: stubLabeler });
    // enrichDraftResultEvents must NOT fabricate a mint ref — the compiled graph
    // must stay byte-identical to the deterministic compiler's output.
    const details = (out.events?.[0] as Record<string, unknown>).details as Record<string, unknown>;
    expect(details.material_ref).toBeUndefined();
  });

  // D2: a CURIE-shaped label must NOT be fabricated into a draft mint
  it('refuses to fabricate a draft ref for a CURIE-shaped label', async () => {
    const result = {
      success: true as const,
      events: [
        {
          eventId: 'evt-1',
          event_type: 'add_material',
          verb: 'add_material',
          details: { well: 'A2', material: 'CHEBI:17790' },
        },
      ],
    };
    const out = await enrichDraftResultEvents(result, { labeler: stubLabeler });
    // CHEBI:17790 is CURIE-shaped — the fallback must not fabricate mint:CHEBI:17790
    const details = (out.events?.[0] as Record<string, unknown>).details as Record<string, unknown>;
    expect(details.material_ref).toBeUndefined();
  });

  // D3: an event that already carries a sibling record ref must not gain a conflicting draft ref
  it('refuses to mint when a sibling record ref already exists', async () => {
    const result = {
      success: true as const,
      events: [
        {
          eventId: 'evt-1',
          event_type: 'add_material',
          verb: 'add_material',
          details: { well: 'A2', material: 'Clofibrate', material_spec_ref: { kind: 'record', id: 'MSP-X' } },
        },
      ],
    };
    const out = await enrichDraftResultEvents(result, { labeler: stubLabeler });
    // material_spec_ref already present — must not append a conflicting material_ref
    const details = (out.events?.[0] as Record<string, unknown>).details as Record<string, unknown>;
    expect(details.material_ref).toBeUndefined();
  });
});
