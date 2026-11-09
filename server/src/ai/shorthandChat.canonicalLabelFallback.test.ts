/**
 * L2-CANONICAL-LABEL-STAGE-A-FALLBACK — unit 1: name-keyed fallback for STAGE A.
 *
 * When the id-keyed lookup (localMaterialIdForLabel) misses because a record's
 * id suffix predates the D3 scheme, the fallback resolves by the mint handler's
 * own sanctioned case-insensitive exact-name lookup over store.list().
 *
 * Acceptance criteria tested:
 *   AC-1: Legacy-id record resolved by name-keyed fallback (the primary fix)
 *   AC-2: Graceful degradation — empty list, missing list, rejecting list
 *   AC-4: Read-only — create/update/delete never called
 *   AC-5: Case deduplication — two facts differing only in case → one map entry
 *   AC-6: Cost model — one list per call, zero when every id hits
 */
// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { canonicalLabelsForFacts, clarificationsFromUnresolvedFacts } from './shorthandChat.js';
import { canonicalLabelKey, localMaterialIdForLabel } from '../materials/termId.js';
import type { RecordStore, RecordEnvelope } from '../store/types.js';
import type { ScientistIntentUnresolvedFact } from '../compiler/scientistIntent/types.js';
import { MATERIAL_SCHEMA_ID } from '../materials/MaterialGrounding.js';

const LEGACY_ID = 'MAT-1-mm-clofibrate1-mm-clof-l84l';
const LABEL = '1 mM Clofibrate in DMSO';

function fact(label: string, reason: string = 'ambiguous-noun'): ScientistIntentUnresolvedFact {
  return { label, reason, actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' } };
}

function makeEnvelope(name: string, recordId: string = LEGACY_ID): RecordEnvelope {
  return {
    recordId,
    schemaId: MATERIAL_SCHEMA_ID,
    payload: { kind: 'material', id: recordId, name },
    meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  } as unknown as RecordEnvelope;
}

function makeFakeStore(
  getImpl: (id: string) => Promise<RecordEnvelope | null> = async () => null,
  listImpl: () => Promise<RecordEnvelope[]> = async () => [],
  createThrows = true,
  updateThrows = true,
  deleteThrows = true,
) {
  const getFn = vi.fn(getImpl);
  const listFn = vi.fn(listImpl);
  const createFn = vi.fn(async () => {
    if (createThrows) throw new Error('store.create not allowed in read-only seam');
  });
  const updateFn = vi.fn(async () => {
    if (updateThrows) throw new Error('store.update not allowed in read-only seam');
  });
  const deleteFn = vi.fn(async () => {
    if (deleteThrows) throw new Error('store.delete not allowed in read-only seam');
  });
  const store: RecordStore & {
    getFn: typeof getFn;
    listFn: typeof listFn;
    createFn: typeof createFn;
    updateFn: typeof updateFn;
    deleteFn: typeof deleteFn;
  } = {
    get: getFn,
    list: listFn,
    create: createFn,
    update: updateFn,
    delete: deleteFn,
    getFn,
    listFn,
    createFn,
    updateFn,
    deleteFn,
  } as any;
  return store;
}

describe('AC-1: Legacy-id name-keyed fallback resolves the record title', () => {
  it('id-keyed miss is structural; name-keyed fallback returns the stored title', async () => {
    // (a) Prove the id-keyed lookup misses structurally
    const newId = localMaterialIdForLabel(LABEL);
    expect(newId).toBe('MAT-1-mm-clofibrate-in-dmso-1cqj');
    expect(newId).not.toBe(LEGACY_ID);

    // (b) Store: get resolves null for every id; list returns exactly ONE envelope
    const envelope = makeEnvelope(LABEL, LEGACY_ID);
    const store = makeFakeStore(
      async () => null,
      async () => [envelope],
    );

    // Pre-fix: the map is empty (id GET misses, no fallback)
    // After fix: the fallback finds the name match and returns the title
    const map = await canonicalLabelsForFacts([fact(LABEL)], store);
    const key = canonicalLabelKey(LABEL);

    // The map contains the title from the store
    expect(map.get(key)).toBe(LABEL);
    expect(map.size).toBe(1);

    // Verify the title is the stored string, never a folded form
    expect(map.get(key)).toBe('1 mM Clofibrate in DMSO');

    // Provenance: the unresolved fact label stays raw
    const cards = clarificationsFromUnresolvedFacts([fact(LABEL)], map);
    expect(cards[0]?.unresolvedFact?.label).toBe(LABEL);
    // The card query carries the title (STAGE A)
    expect(cards[0]?.query).toBe(LABEL);
  });
});

describe('AC-2: Graceful degradation — fallback does not throw or explode', () => {
  it('list returns empty array ⇒ map is empty (size 0)', async () => {
    const store = makeFakeStore(async () => null, async () => []);
    const map = await canonicalLabelsForFacts([fact(LABEL)], store);
    expect(map.size).toBe(0);
  });

  it('store without list function ⇒ map is empty, no throw', async () => {
    const getFn = vi.fn(async () => null);
    const storeNoList = { get: getFn } as unknown as RecordStore;
    const map = await canonicalLabelsForFacts([fact(LABEL)], storeNoList);
    expect(map.size).toBe(0);
  });

  it('list rejects ⇒ map is empty, no throw', async () => {
    const rejection = new Error('store.list failed');
    const store = makeFakeStore(async () => null, async () => { throw rejection; });
    const map = await canonicalLabelsForFacts([fact(LABEL)], store);
    expect(map.size).toBe(0);
  });
});

describe('AC-4: Read-only — no write operations are ever called', () => {
  it('create/update/delete not called; get called exactly once', async () => {
    const envelope = makeEnvelope(LABEL, LEGACY_ID);
    const store = makeFakeStore(async () => null, async () => [envelope]);

    await canonicalLabelsForFacts([fact(LABEL)], store);

    expect(store.createFn).not.toHaveBeenCalled();
    expect(store.updateFn).not.toHaveBeenCalled();
    expect(store.deleteFn).not.toHaveBeenCalled();
    expect(store.getFn).toHaveBeenCalledTimes(1);
  });
});

describe('AC-5: Case deduplication — two facts differing only in case', () => {
  it('two facts same identity (different casing) ⇒ one map entry, get once, list once', async () => {
    const envelope = makeEnvelope(LABEL, LEGACY_ID);
    const store = makeFakeStore(async () => null, async () => [envelope]);

    const facts = [
      fact('1 mM clofibrate in DMSO'),
      fact('1 mM CLOFIBRATE IN DMSO'),
    ];
    const map = await canonicalLabelsForFacts(facts, store);
    expect(map.size).toBe(1);
    expect(store.getFn).toHaveBeenCalledTimes(1);
    expect(store.listFn).toHaveBeenCalledTimes(1);
  });
});

describe('AC-7: First-match — duplicate lowered names pick FIRST record', () => {
  it('two materials whose names lower to the same key ⇒ fallback resolves to FIRST listed', async () => {
    // Seed two records whose names differ only in case — they lower to the same key
    const firstEnv = makeEnvelope('Acetone', 'MAT-ACETONE-FIRST');
    const secondEnv = makeEnvelope('AcETOnE', 'MAT-ACETONE-SECOND');
    // Order matters: first listed first
    const store = makeFakeStore(async () => null, async () => [firstEnv, secondEnv]);

    const map = await canonicalLabelsForFacts([fact('Acetone')], store);
    const key = canonicalLabelKey('Acetone');

    // Must resolve to the FIRST listed record's verbatim name
    expect(map.get(key)).toBe('Acetone');
  });
});

describe('AC-6: Cost model — one list per call, zero when all ids hit', () => {
  it('N distinct id-missed identities ⇒ list called exactly once', async () => {
    const envs = [
      makeEnvelope('1 mM Clofibrate in DMSO', LEGACY_ID),
      makeEnvelope('Acetone', 'MAT-ACETONE-legacy'),
      makeEnvelope('Ethanol', 'MAT-ETHANOL-legacy'),
    ];
    const store = makeFakeStore(async () => null, async () => [...envs]);

    const facts = [
      fact('1 mM Clofibrate in DMSO'),
      fact('Acetone'),
      fact('Ethanol'),
    ];
    const map = await canonicalLabelsForFacts(facts, store);
    expect(store.listFn).toHaveBeenCalledTimes(1);
    expect(store.listFn).toHaveBeenCalledWith({ schemaId: MATERIAL_SCHEMA_ID, limit: 10000 });
  });

  it('batch where every id hits ⇒ list NOT called', async () => {
    // Facts whose ids resolve — no fallback needed
    const factLabel = 'DMSO';
    const dmsId = localMaterialIdForLabel(factLabel);
    const envelope = makeEnvelope(factLabel, dmsId);

    const store = makeFakeStore(
      async (id) => id === dmsId ? envelope : null,
      async () => [],
    );

    const map = await canonicalLabelsForFacts([fact(factLabel)], store);
    expect(store.listFn).not.toHaveBeenCalled();
  });
});

describe('AC-8: Needle parity — bare toLowerCase matches the mint, no trim', () => {
  it('padded fact label misses map key (no-label-match -> fallback keeps own key)', async () => {
    // The map is keyed with .trim().toLowerCase() of stored names (:1209).
    // The needle must be bare .toLowerCase() — mirroring MaterialGrounding.ts:213.
    // Stored name "acetone" -> map key "acetone" (trimmed).
    // Fact label " acetone " (padded) -> raw needle " acetone " (no trim).
    // Raw needle " acetone " !== map key "acetone" -> MISS -> no title.
    // If .trim() were reintroduced, needle becomes "acetone" -> MATCH -> RED.
    const envelope = makeEnvelope('acetone', 'MAT-ACETONE-legacy');
    const store = makeFakeStore(async () => null, async () => [envelope]);

    const map = await canonicalLabelsForFacts([fact(' acetone ')], store);

    // The padded label should NOT match — bare toLowerCase preserves the spaces.
    expect(map.size).toBe(0);
  });
});
