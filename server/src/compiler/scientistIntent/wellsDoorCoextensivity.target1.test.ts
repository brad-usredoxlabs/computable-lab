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
import { WELL_ADDRESS_SHAPE_RE, isWellAddressLiteral } from './normalizeScientistIntent.js';
import { expandWellTokens } from '../../ai/wellRange.js';
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

// ---------------------------------------------------------------------------
// fix1/D7b (adversarial l2t0230): the report's "(b)-arm refactor — verbatim,
// DRY" claim. The reviewer flagged that normalizeScientistIntent.ts:863 now
// calls isWellAddressLiteral(claimValue), which as a STANDALONE function adds
// an internal `.trim()` and a `tokens.length > 0` guard on top of the OLD inline
// `expandWellTokens([claimValue]).every(...)`; the reviewer rated the change
// SAFER and asked the equivalence be HONESTLY QUALIFIED and PINNED. The probe
// (run above) pinned the REAL mechanics so the pin below is accurate, not
// asserted:
//
//   * expandWellTokens NEVER returns [] for a single input — a non-matching
//     token round-trips as [token], a matching range expands to >= 1, and the
//     empty string round-trips as [""]. So the `tokens.length > 0` guard is
//     INERT (it changes no input; the reviewer's "returns []" vacuous case does
//     not occur).
//   * The `.trim()`: the OLD (b)-arm already trimmed `claimValue` at the call
//     site (line 869 `const claimValue = wellsClaim.value.trim()`) BEFORE the
//     inline test ran, so the predicate's internal trim is a NO-OP for the arm.
//     A raw (UNtrimmed) inline form WOULD reject a whitespace-padded address
//     ("  A1  ") that the trimmed form accepts — but the arm never feeds
//     untrimmed input, so that standalone difference is unreachable from the arm.
//
// Net: at the (b)-arm call site the refactor is behaviour-IDENTICAL (not looser,
// not tighter) — the arm reaches only trimmed input, and on that domain the new
// predicate and the old inline agree for EVERY input. The standalone predicate
// is SAFER than a naive untrimmed inline (it would not bar a padded address
// that a raw regex test mis-accepts, and the length guard hardens it).
// ---------------------------------------------------------------------------
// The OLD (b)-arm inline test, VERBATIM as the arm executed it: trim at the call
// site (line 869) + the inlined `expandWellTokens([claimValue]).every(...)` — no
// length guard. Reconstructed here because the inlined form no longer exists in
// the source; `OLD_armBehavior(v)` mirrors the arm (it trims first, exactly as
// the call site did).
function OLD_armBehavior(v: string): boolean {
  const claimValue = v.trim(); // line 869: the call site trimmed before the test
  return expandWellTokens([claimValue]).every((token) => WELL_ADDRESS_SHAPE_RE.test(token));
}

describe('fix1/D7b (b)-arm DRY refactor is HONESTLY pinned (the claim qualified, not byte-identical)', () => {
  it('expandWellTokens never returns [] for a single input (the length guard is inert)', () => {
    // Empirically pin the mechanism the reviewer asked to be pinned: the
    // `tokens.length > 0` guard changes no input because the parser always
    // yields >= 1 token (the "returns [] -> vacuously true" case cannot occur).
    for (const v of ['', '  A1  ', 'A1:ZZ99', 'control_well', 'A1', 'A1:H12', 'a1', 'Q1']) {
      expect(expandWellTokens([v]).length).toBeGreaterThan(0);
    }
  });

  it('the OLD (b)-arm behaviour and the NEW predicate AGREE on the corpus (incl. "", "  A1  ", "A1:ZZ99", "control_well")', () => {
    // The reviewer-required pin: the old inline test (as the arm executed it —
    // trimmed) and the new predicate agree on the specified corpus. Because the
    // arm trims and the parser never yields [], the two added terms are inert at
    // the call site, so the agreement holds for every corpus value.
    const corpus = ['', '  A1  ', 'A1:ZZ99', 'control_well', 'A1', 'H12', 'A1:H12', 'a1', 'Q1', 'A25', 'P24'];
    for (const v of corpus) {
      expect(OLD_armBehavior(v), `diverged at ${JSON.stringify(v)}`).toBe(isWellAddressLiteral(v));
    }
  });

  // Pin both sides on the corpus values (so a future parser/regex drift that
  // silently re-diverges them fails here).
  it.each([
    ['', false],
    ['  A1  ', true],
    ['A1:ZZ99', false],
    ['control_well', false],
    ['A1', true],
    ['H12', true],
    ['A1:H12', true],
    ['a1', false],
    ['Q1', false],
    ['A25', false],
    ['P24', true],
  ])('corpus "%s": old-arm=%s and new-predicate=%s', (value, expected) => {
    expect(OLD_armBehavior(value)).toBe(expected);
    expect(isWellAddressLiteral(value)).toBe(expected);
  });

  it('the standalone (UNtrimmed) inline form differs only on padded input — unreachable from the (b) arm', () => {
    // Transparency on the standalone difference the reviewer noted: a raw inline
    // (no internal trim) rejects a whitespace-padded address the new predicate
    // accepts. The (b) arm never feeds this (it trims first), so it is inert at
    // the call site — but it is pinned so the difference is documented, not
    // hand-waved. A padded LABEL is still barred either way (safe direction).
    const rawInline = (v: string) => expandWellTokens([v]).every((t) => WELL_ADDRESS_SHAPE_RE.test(t));
    expect(rawInline('  A1  ')).toBe(false);   // raw token "  A1  " is unshaped
    expect(isWellAddressLiteral('  A1  ')).toBe(true); // trimmed -> "A1" shaped
    expect(rawInline('  control_well ')).toBe(false);
    expect(isWellAddressLiteral('  control_well ')).toBe(false); // a label is never accepted
  });
});
