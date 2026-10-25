/**
 * REVISE-GHOST-1 fix 3 (browser-gate Defect 1, attempt-9 receipts
 * 2026-10-24-attempt9: f2mjyr fold 'events=3' yet ghostTiles=0/slotPreview=0)
 * — the shorthand result mapper DROPS the compile's resolved placement offers.
 *
 * The live proof (server/tmp probe, replayed as this test): a shorthand whose
 * labware noun resolves against a REAL inventory record (the labware-requirement
 * card picked LAB-w211-sample-plate) makes the frozen pipeline emit
 * terminalArtifacts.resolvedLabwares = [{hint, recordId, title}] — but
 * shorthandResultFromCompile ships only {success, events, shorthand, notes},
 * so the client's buildPreviewFromDraft receives NO resolved offers,
 * previewPlacements stays [], and DeckSlot (which mounts the ghost LabwareTile
 * only when previewPlacement && previewLabware are both truthy) renders an
 * empty plate under a '3 events' preview bar. The events also keep the raw
 * noun LABEL as labwareId, so the ghost-well bucket (collectEventLabwareIds
 * keys off details.labwareId) never matches the placement the resolved offer
 * would create.
 *
 * The fix is data-driven: the mapper carries the compile's OWN resolved pairs
 * (terminalArtifacts.resolvedLabwares — the resolve_labware pass output,
 * already capped by config/drafting/deck-review.yaml) and extends the deck
 * binding with them, so an event whose labware label the compile bound to a
 * record id rides that record id (top-level AND details.labwareId — the key
 * the client's well index collects). Zero labware-name literals: every pair
 * comes from the compile output.
 */
import { describe, expect, it, vi } from 'vitest';
import { createResolveSpineFromContext } from '../resolve/index.js';
import { createLabwareLookup } from './compiler/labwareLookup.js';
import { compileShorthandDeterministically, shorthandResultFromCompile } from './shorthandChat.js';
import { parseScientistIntent } from '../compiler/scientistIntent/parseScientistIntent.js';

/** Test seeds ONLY (repo rip-out rule: no shorthand domain strings in src/). */
const SEED_RECORDS = [
  {
    recordId: 'LAB-rg1-plate-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
    payload: { kind: 'labware', name: 'Sample Plate', title: 'Sample Plate', synonyms: ['sample plate'] },
  },
  {
    recordId: 'MAT-rg1-reagent-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'Test Reagent', title: 'Test Reagent', synonyms: ['test reagent'] },
  },
];

function mockStore() {
  return {
    get: vi.fn(async () => null),
    getRecord: vi.fn(async (id: string) => SEED_RECORDS.find((r) => r.recordId === id) ?? null),
    list: vi.fn(async (filter?: { kind?: string }) =>
      SEED_RECORDS.filter((r) => !filter?.kind || r.payload.kind === filter.kind),
    ),
  };
}

const RESOLVED_DOC = [
  'intentId: rg1-resolved-ghosts',
  'actions:',
  '  - action: add_material',
  '    labware: Sample Plate',
  '    material: Test Reagent',
  '    volumeUl: 50',
  '    targetWells: [A1, A2, A3]',
].join('\n');

async function compileResolved() {
  const store = mockStore();
  const compiled = await compileShorthandDeterministically(parseScientistIntent(RESOLVED_DOC), {
    store: store as never,
    searchLabwareByHint: createLabwareLookup(store as never),
  });
  expect(compiled).not.toBeNull();
  return compiled!;
}

describe('REVISE-GHOST-1 fix3 — the shorthand result carries the compile resolved placement offers', () => {
  it('the compile resolves the labware noun to a real record (the premise the mapper must not drop)', async () => {
    const compiled = await compileResolved();
    expect(compiled.outcome).toBe('complete');
    const offers = compiled.terminalArtifacts.resolvedLabwares ?? [];
    expect(offers.map((o) => o.recordId)).toContain('LAB-rg1-plate-1');
  });

  it('the done result carries resolvedLabwares so the client can ghost a placement of the EXISTING record', async () => {
    const compiled = await compileResolved();
    const result = shorthandResultFromCompile(compiled, RESOLVED_DOC, 'rg1 probe', []);
    const carried = (result as Record<string, unknown>).resolvedLabwares as
      | Array<{ recordId?: string; title?: string }>
      | undefined;
    expect(carried, 'the mapper dropped terminalArtifacts.resolvedLabwares — the deck has nothing to place').toBeDefined();
    expect(carried!.map((o) => o.recordId)).toContain('LAB-rg1-plate-1');
    // The offer carries the record's REAL title (the ghost tile shows it).
    expect(carried!.find((o) => o.recordId === 'LAB-rg1-plate-1')!.title).toBe('Sample Plate');
  });

  it('events bound to a resolved record carry the RECORD ID (top-level AND details.labwareId — the key the client well index collects), never the raw noun label', async () => {
    const compiled = await compileResolved();
    const result = shorthandResultFromCompile(compiled, RESOLVED_DOC, 'rg1 probe', []);
    const events = (result.events ?? []) as unknown as Array<Record<string, unknown>>;
    expect(events.length).toBe(3);
    for (const ev of events) {
      expect(ev.labwareId, 'event labwareId must be the resolved record id').toBe('LAB-rg1-plate-1');
      const details = ev.details as Record<string, unknown>;
      expect(details.labwareId, 'details.labwareId is what collectEventLabwareIds buckets ghost wells by').toBe('LAB-rg1-plate-1');
    }
  });

  it('a deck-bound labware keeps the DECK id (the deck map wins the collision — the honesty-suite deck-match shape is unchanged)', async () => {
    const compiled = await compileResolved();
    const deck = [{ labwareId: 'lw-deck-plate', labwareType: 'plate', name: 'Sample Plate' }];
    const result = shorthandResultFromCompile(compiled, RESOLVED_DOC, 'rg1 probe', deck);
    const events = (result.events ?? []) as unknown as Array<Record<string, unknown>>;
    for (const ev of events) {
      expect(ev.labwareId).toBe('lw-deck-plate');
      expect((ev.details as Record<string, unknown>).labwareId).toBe('lw-deck-plate');
    }
  });

  it('conditional spread: a compile with NO resolved offers ships NO resolvedLabwares key (exactOptionalPropertyTypes, never undefined-valued)', async () => {
    const store = mockStore();
    const unresolvedDoc = [
      'intentId: rg1-no-resolved',
      'actions:',
      '  - action: add_material',
      '    labware: Unbound Plate',
      '    material: Test Reagent',
      '    volumeUl: 50',
      '    targetWells: [A1]',
    ].join('\n');
    const compiled = await compileShorthandDeterministically(parseScientistIntent(unresolvedDoc), {
      store: store as never,
      searchLabwareByHint: createLabwareLookup(store as never),
    });
    expect(compiled).not.toBeNull();
    expect((compiled!.terminalArtifacts.resolvedLabwares ?? []).length).toBe(0);
    const result = shorthandResultFromCompile(compiled!, unresolvedDoc, 'rg1 probe', []);
    expect(Object.prototype.hasOwnProperty.call(result, 'resolvedLabwares')).toBe(false);
  });
});
