/**
 * L2-LABSTATE-CONTENTS-1 — the ONE-CANONICAL-SHAPE proof (spec §8).
 *
 * The fold's canonical wire vocabulary is the SHIPPED EXPANDER shape (the
 * ruling's D13-B). This suite drives the fold with REAL expander output —
 * `createContainerExpander` / `addMaterialExpander` / `transferExpander`
 * `.expand()` are called PROGRAMMATICALLY and their real returned events are
 * folded — never a hand-crafted "shipped shape". The assertion is that the
 * fold's contents ledger is POPULATED from that real output.
 *
 * The symbolic top-level `labwareId` the expander emits resolves to a snapshot
 * instance through the DATA-declared ladder (the vocabulary's
 * `labwareIdentityResolution` section; threaded here as `RULES` — the same
 * three-rung order the production createLabStatePass reads from the loaded
 * vocabulary). Absent rules => rung R1 only (raw labwareInstanceId path); the
 * symbolic legs below require the rules, so they are the never-guess surface
 * this item adds.
 *
 * RED-FIRST (spec §9): at the claim-time trunk (post-WELLSET-merge) the fold
 * IGNORES the expander's symbolic shape — these legs FAIL (the exact dead-write
 * the ruling names). They pass only after the fold consumes the shipped shape.
 *
 * Note: this test file is EXCLUDED from the server tsconfig (noUnusedParameters
 * / typecheck); it runs under vitest (esbuild strips the type-only import and
 * the 3rd fold argument is ignored by the 2-arg base fold, which is precisely
 * why the symbolic legs stay RED at base).
 */
import { describe, expect, it } from 'vitest';
import {
  applyEventToLabState,
  emptyLabState,
  type LabStateSnapshot,
  type PlateEventPrimitive,
} from './LabState.js';
import type { LabIdentityRules, FoldResult } from './LabState.js';
import {
  addMaterialExpander,
  createContainerExpander,
  transferExpander,
} from '../biology/verbs/simpleVerbs.js';

/** The DATA-declared ladder (the vocabulary's `labwareIdentityResolution`
 *  order/tokenFields, mirrored here for the unit seam — the production pass
 * reads it from the loaded vocabulary; see the vocabulary.test.ts per-load pin).
 *  R1 instanceIdentity (instanceId) -> R2 declaredIdentityTokens (identityTokens)
 *  -> R3 uniqueLabwareType (labwareType). */
const RULES: LabIdentityRules = {
  order: ['instanceIdentity', 'declaredIdentityTokens', 'uniqueLabwareType'],
  tokenFields: ['instanceId', 'identityTokens', 'labwareType'],
};

/** Build a label-carrying snapshot via the REAL create_container fold with a
 *  details.labwareId CARRIER (spec §6: identityTokens populate from the create
 *  event's declared string carriers — details.labwareId ?? event.labwareId ??
 *  details.title ?? details.label — whichever it happens to carry). This is the
 *  R2-rung unit seam. (The SHIPPED createContainerExpander emits NO label —
 *  OQ-3 ratifies the live single-plate drive resolves via R3 unique-type — so
 *  the separate leg below drives the REAL expander's unlabeled create.) */
function labeledSnapshot(label: string, slot: string): LabStateSnapshot {
  return applyEventToLabState(emptyLabState(), {
    eventId: 'evt-create-canonical',
    event_type: 'create_container',
    details: { slot, labwareType: '96-well-plate', labwareId: label },
  });
}

function firstEvent(events: PlateEventPrimitive[]): PlateEventPrimitive {
  if (events.length === 0) throw new Error('expander emitted no events');
  return events[0]!;
}

/** Fold one event with the DATA rules (the 3-arg overload returns the
 *  `{ snapshot, outcome }` record — unwrap the snapshot; the pass does the same). */
function fold(snapshot: LabStateSnapshot, event: PlateEventPrimitive): LabStateSnapshot {
  const result: FoldResult = applyEventToLabState(snapshot, event, RULES);
  return result.snapshot;
}

// ---------------------------------------------------------------------------
// add_material — REAL expander output folded (the canonical-shape proof)
// ---------------------------------------------------------------------------

describe('L2-LABSTATE-CONTENTS-1 — canonical shape (real expander output)', () => {
  it('add_material: the REAL addMaterialExpander string-material + symbolic labwareId lands contents (real createContainerExpander, R3 unique-type resolution, no invented id)', () => {
    // Drive the REAL createContainerExpander (the live path — it emits ONLY
    // slot + labwareType, NO label, so identityTokens is absent and R3 unique-
    // labwareType is the live resolution rung — the OQ-3 ratified winner).
    const createEv = firstEvent(createContainerExpander.expand({
      verb: 'create_container',
      params: { slot: 'target', labwareType: '96-well-plate' },
    }));
    const d0 = createEv.details as Record<string, unknown>;
    // The REAL shipped create shape: NO label carrier (no details.labwareId /
    // title / label) — identityTokens must be ABSENT (exactOptionalPropertyTypes).
    expect(d0.labwareId).toBeUndefined();
    expect(d0.title).toBeUndefined();
    expect(d0.label).toBeUndefined();
    const snapshot = applyEventToLabState(emptyLabState(), createEv);
    const instId = Object.keys(snapshot.labware)[0]!;
    expect(snapshot.labware[instId]!.identityTokens).toBeUndefined();

    // The shorthand candidate the binder hands the expander: a STRING material,
    // a range string wells, a symbolic labware label, a volume. (Spec §9 leg.)
    // The hint is the plate TYPE token ('96-well-plate') — what the model emits
    // for "Place a 96-well plate" (the labware name IS the type) — so the
    // resolution is rung R3 (unique declared labwareType), the OQ-3 live winner.
    const events = addMaterialExpander.expand({
      verb: 'add_material',
      params: {
        labware: '96-well-plate',
        wells: 'A1..H1',
        material: 'A',
        volume_uL: 100,
      },
    });

    // Sanity on the REAL emitted shape: 8 per-well events (the expander's
    // expandWellTokens pre-expands the range string to an array, so the
    // per-well legacy branch fires), each carrying a STRING material, a
    // per-well `well` address, a details-level volumeUl, and the SYMBOLIC
    // top-level labwareId (NO labwareInstanceId — the dead-write the ruling names).
    expect(events).toHaveLength(8);
    for (const ev of events) {
      expect(ev.labwareId).toBe('96-well-plate');
      const d = ev.details as Record<string, unknown>;
      expect(d.labwareInstanceId).toBeUndefined();
      expect(typeof d.material).toBe('string');
      expect(typeof d.well).toBe('string');
      expect(d.volumeUl).toBe(100);
    }

    // Fold the REAL output through the production fold (rules threaded).
    let folded: LabStateSnapshot = snapshot;
    for (const ev of events) {
      folded = fold(folded, ev);
    }

    // The contents ledger is POPULATED from the real expander shape: exactly
    // the A1..H1 wells carry material on the single resolved instance.
    const instanceIds = Object.keys(folded.labware);
    expect(instanceIds).toHaveLength(1);
    const instance = folded.labware[instanceIds[0]!];
    const populated = Object.keys(instance.wells)
      .filter((w) => instance.wells[w]!.length > 0);
    expect(populated).toHaveLength(8);
    expect(populated).toEqual(['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1']);

    // No invented id: the scientist's own word is the materialId VERBATIM (the
    // mint_materials namingPattern / ProtocolIntentLowering precedent) — not a
    // mint (MAT-N), not a hash, not lowercased. volumeUl rides the details-level
    // volume (the expander rides volumeUl/volume at details, not inside
    // material).
    const a1 = instance.wells['A1']!;
    expect(a1).toHaveLength(1);
    expect(a1[0]!.materialId).toBe('A');
    expect(a1[0]!.kind).toBe('A');
    expect(a1[0]!.volumeUl).toBe(100);
  });

  it('add_material: R2 declaredIdentityTokens resolution lands contents on the labeled instance', () => {
    const snapshot = labeledSnapshot('PlateOne', 'target');
    // The expander's labwareId matches the instance's declared identityTokens
    // EXACTLY (R2), not the labwareType (R3 would also match here — R2 is the
    // first hit, so the R2 rung is what resolves it).
    const events = addMaterialExpander.expand({
      verb: 'add_material',
      params: {
        labware: 'PlateOne',
        well: 'A1',
        material: 'B',
        volume_uL: 50,
      },
    });
    let folded = snapshot;
    for (const ev of events) folded = fold(folded, ev);
    const id = Object.keys(folded.labware)[0]!;
    expect(folded.labware[id]!.wells['A1']!.map((m) => m.materialId)).toEqual(['B']);
  });

  it('add_material: R1 raw labwareInstanceId path is byte-stable (no rules needed, resolved identity wins first)', () => {
    const snapshot = labeledSnapshot('PlateOne', 'target');
    const id = Object.keys(snapshot.labware)[0]!;
    // The RAW path: details.labwareInstanceId identifies the instance exactly.
    // This must fold identically whether or not the rules are threaded (R1 is
    // the resolved-identity rung, always present).
    const ev: PlateEventPrimitive = {
      eventId: 'evt-add-raw-raw',
      event_type: 'add_material',
      details: {
        labwareInstanceId: id,
        well: 'C1',
        material: { materialId: 'mat-raw', kind: 'raw', volumeUl: 10 },
      },
    };
    const withRules = (applyEventToLabState(snapshot, ev, RULES) as FoldResult).snapshot;
    const withoutRules = applyEventToLabState(snapshot, ev);
    expect(withRules.labware[id]!.wells['C1']).toEqual(
      withoutRules.labware[id]!.wells['C1'],
    );
    expect(withRules.labware[id]!.wells['C1']![0]!.materialId).toBe('mat-raw');
  });

  it('never-guess: TWO same-type plates => symbolic hint UNRESOLVED, contents NOT written, NO second labware (the D1 mirror on the write side)', () => {
    // Two plates of the same type (the OQ-3 ratified never-guess negative).
    const first = applyEventToLabState(emptyLabState(), {
      eventId: 'evt-create-neg-1',
      event_type: 'create_container',
      details: { slot: 'target', labwareType: '96-well-plate' },
    });
    const both = applyEventToLabState(first, {
      eventId: 'evt-create-neg-2',
      event_type: 'create_container',
      details: { slot: 'other', labwareType: '96-well-plate' },
    });
    expect(Object.keys(both.labware)).toHaveLength(2);

    const events = addMaterialExpander.expand({
      verb: 'add_material',
      params: { labware: 'plate', well: 'A1', material: 'A', volume_uL: 100 },
    });
    let folded = both;
    for (const ev of events) folded = fold(folded, ev);

    // NO contents written anywhere (the hint is ambiguous at R3: two same-type
    // instances => tie => unresolved => no-op), and NO second labware minted.
    expect(Object.keys(folded.labware)).toHaveLength(2);
    for (const id of Object.keys(folded.labware)) {
      const instance = folded.labware[id]!;
      for (const w of Object.keys(instance.wells)) {
        expect(instance.wells[w]!.length).toBe(0);
      }
    }
  });

  it('never-guess: unknown labware hint => NO contents, NO second labware (R1/R2/R3 all miss)', () => {
    const snapshot = labeledSnapshot('PlateOne', 'target');
    const events = addMaterialExpander.expand({
      verb: 'add_material',
      params: { labware: 'ghost-plate', well: 'A1', material: 'A', volume_uL: 100 },
    });
    let folded = snapshot;
    for (const ev of events) folded = fold(folded, ev);
    // The snapshot is unchanged: no contents on the one instance, still one
    // labware (the unmappable hint never silently creates a second labware).
    const id = Object.keys(folded.labware)[0]!;
    expect(Object.keys(folded.labware[id]!.wells)).toHaveLength(0);
    expect(Object.keys(folded.labware)).toHaveLength(1);
  });

  it('transfer: the REAL transferExpander symbolic source/destination resolves + moves volume (R3 both sides)', () => {
    // Build a populated source well (raw path) so the transfer has material to
    // move. Then fold the REAL expander output.
    let snapshot = labeledSnapshot('PlateOne', 'target');
    const id = Object.keys(snapshot.labware)[0]!;
    snapshot = applyEventToLabState(snapshot, {
      eventId: 'evt-add-seed',
      event_type: 'add_material',
      details: {
        labwareInstanceId: id,
        well: 'A1',
        material: { materialId: 'mat-src', kind: 'src', volumeUl: 100 },
      },
    });

    const events = transferExpander.expand({
      verb: 'transfer',
      params: {
        source_labware: '96-well-plate',
        destination_labware: '96-well-plate',
        source_well: 'A1',
        well: 'A2',
        volume_uL: 30,
      },
    });
    const ev = firstEvent(events);
    const d = ev.details as Record<string, unknown>;
    // The REAL emitted shape: symbolic source/destination labware (the plate
    // TYPE token — R3 resolution) + the volumeUl at the DETAILS level (not
    // inside from/to objects).
    expect(d.source_labware).toBe('96-well-plate');
    expect(d.destination_labware).toBe('96-well-plate');
    expect(d.volumeUl).toBe(30);
    expect(ev.labwareId).toBe('96-well-plate');

    const folded = fold(snapshot, ev);
    const src = folded.labware[id]!.wells['A1']!;
    const dst = folded.labware[id]!.wells['A2']!;
    // Top-of-stack deduction preserved: source 100 -> 70, destination gains 30
    // of the SAME material (verbatim id passthrough, no minting).
    expect(src).toHaveLength(1);
    expect(src[0]!.volumeUl).toBe(70);
    expect(dst).toHaveLength(1);
    expect(dst[0]!.materialId).toBe('mat-src');
    expect(dst[0]!.volumeUl).toBe(30);
  });

  it('transfer: the RAW from/to-object path is byte-stable (existing raw shape never reinterpreted)', () => {
    let snapshot = labeledSnapshot('PlateOne', 'target');
    const id = Object.keys(snapshot.labware)[0]!;
    snapshot = applyEventToLabState(snapshot, {
      eventId: 'evt-add-seed-raw',
      event_type: 'add_material',
      details: {
        labwareInstanceId: id,
        well: 'A1',
        material: { materialId: 'mat-raw', kind: 'raw', volumeUl: 100 },
      },
    });
    const rawEv: PlateEventPrimitive = {
      eventId: 'evt-xfer-raw',
      event_type: 'transfer',
      details: {
        from: { labwareInstanceId: id, well: 'A1' },
        to: { labwareInstanceId: id, well: 'A3' },
        volumeUl: 20,
      },
    };
    const folded = fold(snapshot, rawEv);
    expect(folded.labware[id]!.wells['A1']![0]!.volumeUl).toBe(80);
    expect(folded.labware[id]!.wells['A3']![0]!.materialId).toBe('mat-raw');
    expect(folded.labware[id]!.wells['A3']![0]!.volumeUl).toBe(20);
  });
});
