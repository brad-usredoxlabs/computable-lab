/**
 * WELLSET-RESOLVER-1 FIX RUN 2 (advc D13, orch ruling) — the AC2 seeded drive.
 *
 * The ruling (binding, recorded verbatim in the report): the production
 * contents-wiring (applyAddMaterial requiring labwareInstanceId/object
 * material vs the shorthand expander's symbolic per-well emission —
 * LabState.ts:161-208 + simpleVerbs.ts:522-640) is PRE-EXISTING and OUTSIDE
 * this item's declared file scope; the orchestrator routes it to the architect
 * as a scope-amendment candidate. Wiring it is NOT this item's work.
 *
 * What IS owed here (the ruling's second half): AC2 (Brad's worked-example
 * union) must be DEMONSTRATED with a NON-EMPTY computed_wells on a drive that
 * SEEDS priorLabState with the committed contents map — the resolver's
 * read-path contract is that it consumes LabStateSnapshot.labware[].wells, so
 * seeding the snapshot is legitimate proof of the READ PATH (prior layer +
 * pending layer -> the union on the mix event), driven through the REAL
 * compileScientistIntent pipeline. The cross-turn COMMIT leg (how the snapshot
 * gets populated from accepted events) is what the contents-wiring amendment
 * decision owns; this file proves everything downstream of it.
 *
 * The drive: seed the committed layer with material A on A1:H1 of labware
 * LWI-1 (typed 'plate' — the identity the document's symbolic hint folds
 * onto, the same declared-evidence fold leg 3 pins), then compile a real
 * scientist-intent doc that adds material B onto A2:H2 THIS turn and mixes
 * `wells: <token>`. The mix must ship the 16-well A1:H2 union with the LWI-1
 * record binding + volume 75 + cycles 3 — NON-vacuous by assertion.
 *
 * The console block below is the raw evidence excerpted into the report.
 */
import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { parseScientistIntent } from './parseScientistIntent.js';
import { compileScientistIntent } from './compileScientistIntent.js';
import { createResolveSpineFromContext } from '../../resolve/index.js';
import { createLabwareLookup } from '../../ai/compiler/labwareLookup.js';
import { emptyLabState, type LabStateSnapshot } from '../state/LabState.js';

const TOKEN = 'all-wells-containing-materials';
const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
const col = (n: number): string[] => ROWS.map((r) => `${r}${n}`);

/** Test seeds: the plate record carries recordId LWI-1 — the SAME identity
 *  space the seeded committed snapshot keys by, so the document's symbolic
 *  hint 'plate' resolves to the committed record through the declared slots. */
const SEED_RECORDS = [
  {
    recordId: 'LWI-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
    payload: { kind: 'labware', name: 'Plate', title: 'Plate', synonyms: ['plate'] },
  },
  {
    recordId: 'MAT-A',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'Material A', title: 'Material A', synonyms: ['material a'] },
  },
  {
    recordId: 'MAT-B',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'Material B', title: 'Material B', synonyms: ['material b'] },
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

/** The seeded committed layer: material on A1:H1 of the plate the document
 *  names 'plate' (labwareType is the DECLARED evidence the pending layer's
 *  symbolic hint folds onto — leg 3's D1 fold, no pin, no guess). */
function seededPrior(): LabStateSnapshot {
  return {
    ...emptyLabState(),
    labware: {
      'LWI-1': {
        instanceId: 'LWI-1',
        labwareType: 'plate',
        slot: '1',
        orientation: 'landscape',
        wells: Object.fromEntries(
          col(1).map((w) => [w, [{ materialId: 'MAT-A', volumeUl: 50 }]]),
        ),
      },
    },
  };
}

describe('WELLSET-RESOLVER-1 FIX2 D13 — seeded-priorState AC2 drive: NON-EMPTY union on the mix event', () => {
  it('prior-seeded A1:H1 + same-doc add A2:H2 + token mix => mix ships the 16-well union + LWI-1 binding (never []==[])', async () => {
    const doc = parseScientistIntent(`
intentId: d13-seeded-drive
actions:
  - action: add_material
    labware: plate
    material: Material B
    targetWells: [A2, B2, C2, D2, E2, F2, G2, H2]
    volumeUl: 50
  - action: mix
    labware: plate
    cycles: 3
    volume: 75
    wells: ${TOKEN}
`);
    const store = mockStore();
    const { outcome, clarifications, terminalArtifacts } = await compileScientistIntent(doc, {
      spine: createResolveSpineFromContext({ store: store as never }) as never,
      searchLabwareByHint: createLabwareLookup(store as never) as never,
      priorLabState: seededPrior(),
    });

    const mixes = terminalArtifacts.events.filter((e) => e.event_type === 'mix') as
      Array<{ details: Record<string, unknown> }>;
    const withWells = mixes.filter(
      (m) => Array.isArray(m.details.wells) && (m.details.wells as string[]).length > 0,
    );

    // RAW EVIDENCE (pasted into the report).
    console.log('[D13-SEEDED-DRIVE] outcome:', outcome);
    console.log('[D13-SEEDED-DRIVE] clarifications:', JSON.stringify(clarifications.map((c) => c.reason)));
    console.log('[D13-SEEDED-DRIVE] mix count:', mixes.length, 'with computed_wells:', withWells.length);
    console.log('[D13-SEEDED-DRIVE] computed_wells:', JSON.stringify(withWells[0]?.details['wells'] ?? []));
    console.log('[D13-SEEDED-DRIVE] details:', JSON.stringify({
      volume: withWells[0]?.details['volume'],
      cycles: withWells[0]?.details['cycles'],
      labwareId: withWells[0]?.details['labwareId'],
      wellColumns: withWells[0]?.details['wellColumns'],
      channels: withWells[0]?.details['channels'],
    }));

    expect(clarifications).toEqual([]);
    expect(outcome).toBe('complete');
    // AC2's core assertion: the union is NON-EMPTY — a VACUOUS [] here is an
    // acceptance failure, so the drive asserts the exact 16-well set.
    expect(withWells.length, 'exactly one mix carries the computed union').toBe(1);
    expect(withWells[0]!.details['wells']).toEqual([...col(1), ...col(2)].sort());
    expect((withWells[0]!.details['wells'] as string[]).length).toBe(16);
    // Volume 75, cycles 3, RESOLVED record binding (acceptance 2's shape).
    expect(withWells[0]!.details['volume']).toBe(75);
    expect(withWells[0]!.details['cycles']).toBe(3);
    expect(withWells[0]!.details['labwareId']).toBe('LWI-1');
    // The 8-channel column shape over the union (Q1 fold).
    expect(withWells[0]!.details['channels']).toBe(8);
    expect(withWells[0]!.details['wellColumns']).toEqual([col(1), col(2)]);
    // The pending layer CONTRIBUTED (vacuous-green guard): drop the prior and
    // the set shrinks to the same-doc add only; drop the doc's add and it is
    // the committed layer only. Both legs non-empty => neither layer alone
    // could produce this set.
    const committedOnly = (withWells[0]!.details['wells'] as string[]).filter((w) => w.endsWith('1'));
    expect(committedOnly).toEqual(col(1));
    expect((withWells[0]!.details['wells'] as string[]).filter((w) => w.endsWith('2'))).toEqual(col(2));
  });
});
