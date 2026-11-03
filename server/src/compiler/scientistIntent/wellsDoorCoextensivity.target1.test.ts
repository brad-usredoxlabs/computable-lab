/**
 * L2-CLARIFY-TARGET-1 — WELLS DOOR CO-EXTENSIVITY pins (fix1/D1, adversarial
 * l2t0230). The ruling's shape-gated option (i) lets a kind:'wells' scalar that
 * IS an address literal (isWellAddressLiteral = expandWellTokens +
 * WELL_ADDRESS_SHAPE_RE) skip the doc-door's noun-resolution toll and ride to
 * the lowering. The ruling's premise — "the lowering expands it through the
 * ONE parser into per-well events" — held ONLY for add_material (whose expander
 * runs expandWellTokens on a scalar). For the OTHER candidate-path verbs that
 * declare a kind:'wells' argument (transfer, aliquot) the carried scalar was
 * a raw STRING the lowering could not consume:
 *
 *   transfer  details.wells = "A1:H12" (STRING) — the array-only downstream
 *             readers (AgentOrchestrator.ts:626/:4313, forceMaterialClarifi-
 *             cations.ts:165/:189, ProtocolIdeHandlers.ts:228) read it as
 *             EMPTY; verifyPlatingEvidence.ts:72 would .join() a string.
 *   aliquot   6 events whose source_well/destination_well are the CHARACTERS
 *             "A","1",":","H","1","2" (the expander iterates the string).
 *
 * That is silent data loss / corruption from a user's visible bar — the exact
 * ground the ruling rejected the bare (i) on and §4a's "no silent drops."
 *
 * The fix makes the carry CO-EXTENSIVE with the lowering's actual ability to
 * consume: the mappings-loop choke point (where the shape gate already fires)
 * now carries the address-literal EXPANDED through the ONE parser
 * (expandWellTokens) into a concrete address array — the SAME shape every
 * target-wells expander natively consumes (params.wells / p.wells as
 * string[]). No second parser, no verb-name table, no expander edit.
 *
 * These pins are the D1 acceptance: a scalar A1:H12 on transfer yields
 * correctly-ADDRESSED wells (a real address array, never a string passthrough,
 * never char-split); a scalar A1:H12 on aliquot yields per-well events with
 * REAL address parts (never single characters). The two add_material
 * reachability pins (CHARACTERIZATION :159, GHOST :369) stay UNEDITED and
 * green — they are the co-extensivity control.
 */
import { describe, expect, it, vi } from 'vitest';
import { parseScientistIntent } from './parseScientistIntent.js';
import { compileScientistIntent } from './compileScientistIntent.js';
import { WELL_ADDRESS_SHAPE_RE } from './normalizeScientistIntent.js';
import { createResolveSpineFromContext } from '../../resolve/index.js';
import { createLabwareLookup } from '../../ai/compiler/labwareLookup.js';

/** Test seeds ONLY (same idiom as declaredArgumentReachability.test.ts). */
const SEED_RECORDS = [
  {
    recordId: 'LBW-96-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
    payload: { kind: 'labware', name: 'Plate', title: 'Plate', synonyms: ['plate'] },
  },
  {
    recordId: 'MAT-dmem-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'DMEM', title: 'DMEM', synonyms: ['dmem'] },
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

async function compileReal(yaml: string) {
  const store = mockStore();
  return compileScientistIntent(parseScientistIntent(yaml), {
    spine: createResolveSpineFromContext({ store: store as never }) as never,
    searchLabwareByHint: createLabwareLookup(store as never) as never,
  });
}

/** The exact 96 addresses of the A1:H12 block (rows A–H × cols 1–12). */
function expectedA1H12(): string[] {
  const rows = 'ABCDEFGH';
  const out: string[] = [];
  for (const r of rows) for (let c = 1; c <= 12; c += 1) out.push(`${r}${c}`);
  return out;
}

describe('wells-door co-extensivity (fix1/D1): a scalar address range is consumable by EVERY target-wells lowering', () => {
  it('transfer targetWells: A1:H12 (scalar) -> correctly-ADDRESSED wells, never a string passthrough, never char-split', async () => {
    const compiled = await compileReal(`intentId: xfer-scalar-range
actions:
  - action: transfer
    source: Plate
    target: Plate
    targetWells: A1:H12
`);
    expect(compiled.outcome).toBe('complete');
    expect(compiled.clarifications).toEqual([]);
    const events = compiled.terminalArtifacts.events as Array<Record<string, unknown>>;
    expect(events.length).toBeGreaterThan(0);
    const details = events[0]!.details as Record<string, unknown>;
    const wells = details['wells'];
    // THE D1 defect: at base this is the STRING "A1:H12". It must be an ARRAY
    // of real addresses (the array-only downstream readers' native shape).
    expect(Array.isArray(wells)).toBe(true);
    expect((wells as unknown[]).some((w) => typeof w === 'string' && w.length > 1)).toBe(true);
    // No single-character (char-split) wells; every entry is a real address.
    for (const w of wells as string[]) {
      expect(typeof w).toBe('string');
      expect(w.length).toBeGreaterThan(1);
      expect(WELL_ADDRESS_SHAPE_RE.test(w)).toBe(true);
    }
    // The 96 addresses of A1:H12 are all present (correctly addressed).
    expect(new Set(wells as string[])).toEqual(new Set(expectedA1H12()));
  });

  it('aliquot targetWells: A1:H12 (scalar) -> per-well events with REAL address parts, never single characters', async () => {
    const compiled = await compileReal(`intentId: aliquot-scalar-range
actions:
  - action: aliquot
    source: Plate
    target: Plate
    targetWells: A1:H12
`);
    expect(compiled.outcome).toBe('complete');
    expect(compiled.clarifications).toEqual([]);
    const events = compiled.terminalArtifacts.events as Array<Record<string, unknown>>;
    // THE D1 defect: at base this is 6 events whose wells are the CHARACTERS
    // "A","1",":","H","1","2". One transfer event per target well => 96.
    expect(events.length).toBe(96);
    const destWells = events.map((e) => (e.details as Record<string, unknown>)['destination_well']);
    const srcWells = events.map((e) => (e.details as Record<string, unknown>)['source_well']);
    for (const w of [...destWells, ...srcWells]) {
      expect(typeof w).toBe('string');
      // Never a single character (char-split); always a real plate address.
      expect((w as string).length).toBeGreaterThan(1);
      expect(WELL_ADDRESS_SHAPE_RE.test(w as string)).toBe(true);
    }
    // Every target well of A1:H12 is addressed exactly once.
    expect(new Set(destWells as string[])).toEqual(new Set(expectedA1H12()));
  });

  it('transfer sourceWells scalar stays on the source-family bar (UNREALIZED_WELL_LABEL) — the D1 fix is target-side only', async () => {
    // A SCALAR on the SOURCE family has no role consumer (SPINE-7 fix1/D1
    // fallback (b)) and keeps its structured bar — the D1 fix must NOT widen
    // the carry to the source side.
    const compiled = await compileReal(`intentId: xfer-source-scalar
actions:
  - action: transfer
    source: Plate
    target: Plate
    sourceWells: A1:H12
    targetWells: [A1, A2]
`);
    // The source scalar bars (unrealized-well-label); it is NOT carried as an
    // address array into the event. The compile is atomic: needs-clarification.
    const all = [
      ...(compiled.clarifications ?? []),
    ] as Array<{ reason?: string; label?: string }>;
    expect(all.some((c) => c.reason === 'unrealized-well-label' && c.label === 'A1:H12')).toBe(true);
  });
});
