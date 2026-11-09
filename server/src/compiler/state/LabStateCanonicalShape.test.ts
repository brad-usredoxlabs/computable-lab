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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

    // D4 (advc fix-run 1): the hint normalizes to the plates' SHARED declared
    // TYPE — normalizeTypeKey('96 well plate') === normalizeTypeKey('96-well-plate') —
    // so R1/R2 miss and R3 sees TWO matches: a TIE (the terminal never-guess
    // rule). (The previous hint 'plate' was a TOTAL MISS, not a tie — it
    // duplicated the unknown-hint leg below and asserted nothing about ties:
    // a tie-picks-first mutant stayed 7/7 green with it.)
    const events = addMaterialExpander.expand({
      verb: 'add_material',
      params: { labware: '96 well plate', well: 'A1', material: 'A', volume_uL: 100 },
    });
    let folded = both;
    for (const ev of events) folded = fold(folded, ev);

    // NO contents written anywhere (the hint ties at R3: two same-type
    // instances => tie => terminal unresolved => no-op), and NO second
    // labware minted.
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

  // -----------------------------------------------------------------------
  // D1 (advc fix-run 1, Mutant 4 class): a transfer the REAL expander emits
  // when the source labware is NOT named. The expander sets the TOP-LEVEL
  // labwareId to the TARGET (simpleVerbs.ts `targetLabware` fallback); the
  // source side must come from source_labware / from.labwareId ONLY. "Source
  // unknown" => labware_unresolved no-op + a pass diagnostic — NEVER a
  // self-transfer inside the destination plate (the pre-fix fold folded
  // A1->B1 INSIDE the destination because the srcHint fallback chain ended
  // in event.labwareId).
  // -----------------------------------------------------------------------
  it('transfer: the REAL transferExpander DESTINATION-ONLY shape (no source_labware) => NO write + labware_unresolved (never a self-transfer)', () => {
    // Populate the destination plate's A1 (the would-be "source" well) so the
    // pre-fix self-transfer would be observable (A1 100->60, B1 +40).
    let snapshot = labeledSnapshot('PlateOne', 'target');
    const id = Object.keys(snapshot.labware)[0]!;
    snapshot = applyEventToLabState(snapshot, {
      eventId: 'evt-add-seed-d1',
      event_type: 'add_material',
      details: {
        labwareInstanceId: id,
        well: 'A1',
        material: { materialId: 'mat-src', kind: 'src', volumeUl: 100 },
      },
    });

    // The REAL expander output with NO source_labware param (a reachable
    // output whenever params.source_labware is absent — the binder does not
    // always carry it). labware = the destination (the expander's target).
    const events = transferExpander.expand({
      verb: 'transfer',
      params: {
        labware: '96-well-plate',
        source_well: 'A1',
        well: 'B1',
        volume_uL: 40,
      },
    });
    const ev = firstEvent(events);
    const d = ev.details as Record<string, unknown>;
    // Pin the REAL emitted shape: destination_labware present, source_labware
    // ABSENT, top-level labwareId = the TARGET (simpleVerbs.ts:715).
    expect(d.destination_labware).toBe('96-well-plate');
    expect(d.source_labware).toBeUndefined();
    expect(ev.labwareId).toBe('96-well-plate');

    // The fold: source identity has NO declared carrier => labware_unresolved
    // no-op. NO write — the destination A1 keeps 100, B1 gets nothing, no
    // second labware is minted.
    const result = applyEventToLabState(snapshot, ev, RULES) as FoldResult;
    expect(result.outcome).toEqual({ changed: false, reason: 'labware_unresolved' });
    expect(result.snapshot.labware[id]!.wells['A1']).toEqual([
      { materialId: 'mat-src', kind: 'src', volumeUl: 100 },
    ]);
    expect(result.snapshot.labware[id]!.wells['B1']).toBeUndefined();
    expect(Object.keys(result.snapshot.labware)).toEqual([id]);
    // The input snapshot is untouched (immutability).
    expect(snapshot.labware[id]!.wells['A1']).toEqual([
      { materialId: 'mat-src', kind: 'src', volumeUl: 100 },
    ]);
  });

  // -----------------------------------------------------------------------
  // D2 (advc fix-run 1, spec §4.2(a) / §12 bait 5): RAW-PATH BYTE-STABILITY —
  // SNAPSHOT-EQUALITY goldens (base shape vs head shape), not within-build
  // rule comparisons. The expected shapes are the BASE applyTransfer (at
  // 9d020514) shapes: the raw from/to path must fold EXACTLY as before in the
  // three edge cases the pre-fix refactor drifted:
  //   (a) EMPTY source well: the base early-returned the UNTOUCHED clone —
  //       NO destination well materialization (the pre-fix fold created
  //       `dst: []`).
  //   (b) non-empty source, ZERO volume moved (volumeUl 0 or ABSENT): the
  //       base MATERIALIZED the (empty) destination well UNCONDITIONALLY and
  //       left the source stack intact — the pre-fix fold omitted the dest
  //       well.
  //   (c) the multi-well arm: the same per-pair shape (an empty pair writes
  //       nothing; a zero-move pair materializes the empty dest well).
  // -----------------------------------------------------------------------
  it('transfer RAW: empty source well => UNTOUCHED clone, NO destination materialization (base shape (a))', () => {
    const snapshot = labeledSnapshot('PlateOne', 'target');
    const id = Object.keys(snapshot.labware)[0]!;
    // Seed A2 only — A1 (the source) is EMPTY.
    const seeded = applyEventToLabState(snapshot, {
      eventId: 'evt-add-seed-d2a',
      event_type: 'add_material',
      details: {
        labwareInstanceId: id,
        well: 'A2',
        material: { materialId: 'mat-seed', kind: 'seed', volumeUl: 70 },
      },
    });
    const rawEv: PlateEventPrimitive = {
      eventId: 'evt-xfer-d2a',
      event_type: 'transfer',
      details: {
        from: { labwareInstanceId: id, well: 'A1' },
        to: { labwareInstanceId: id, well: 'B1' },
        volumeUl: 25,
      },
    };
    const result = applyEventToLabState(seeded, rawEv, RULES) as FoldResult;
    // Outcome: no-op with NO reason (both sides resolved; an empty source
    // well is a normal no-move, not a never-guess failure — no §7 diagnostic).
    expect(result.outcome).toEqual({ changed: false });
    // BASE shape: the clone is UNTOUCHED — A2 intact, NO A1 key, NO B1 key
    // (the base returned before touching the destination well).
    expect(result.snapshot.labware[id]!.wells).toEqual({
      A2: [{ materialId: 'mat-seed', kind: 'seed', volumeUl: 70 }],
    });
    // Input snapshot untouched (immutability).
    expect(seeded.labware[id]!.wells['A1']).toBeUndefined();
  });

  it('transfer RAW: non-empty source + volumeUl 0 => source intact + EMPTY destination well MATERIALIZED (base shape (b))', () => {
    const snapshot = labeledSnapshot('PlateOne', 'target');
    const id = Object.keys(snapshot.labware)[0]!;
    const seeded = applyEventToLabState(snapshot, {
      eventId: 'evt-add-seed-d2b',
      event_type: 'add_material',
      details: {
        labwareInstanceId: id,
        well: 'A1',
        material: { materialId: 'mat-raw', kind: 'raw', volumeUl: 100 },
      },
    });
    const rawEv: PlateEventPrimitive = {
      eventId: 'evt-xfer-d2b',
      event_type: 'transfer',
      details: {
        from: { labwareInstanceId: id, well: 'A1' },
        to: { labwareInstanceId: id, well: 'E1' },
        volumeUl: 0,
      },
    };
    const result = applyEventToLabState(seeded, rawEv, RULES) as FoldResult;
    // No volume moved => changed:false, but the BASE semantics materialize
    // the (empty) destination well UNCONDITIONALLY.
    expect(result.outcome).toEqual({ changed: false });
    expect(result.snapshot.labware[id]!.wells).toEqual({
      A1: [{ materialId: 'mat-raw', kind: 'raw', volumeUl: 100 }],
      E1: [],
    });
  });

  it('transfer RAW: non-empty source + ABSENT volumeUl => source intact + EMPTY destination well MATERIALIZED (base shape (b), volume absent)', () => {
    const snapshot = labeledSnapshot('PlateOne', 'target');
    const id = Object.keys(snapshot.labware)[0]!;
    const seeded = applyEventToLabState(snapshot, {
      eventId: 'evt-add-seed-d2c',
      event_type: 'add_material',
      details: {
        labwareInstanceId: id,
        well: 'A1',
        material: { materialId: 'mat-raw', kind: 'raw', volumeUl: 100 },
      },
    });
    const rawEv: PlateEventPrimitive = {
      eventId: 'evt-xfer-d2c',
      event_type: 'transfer',
      details: {
        from: { labwareInstanceId: id, well: 'A1' },
        to: { labwareInstanceId: id, well: 'F1' },
      },
    };
    const result = applyEventToLabState(seeded, rawEv, RULES) as FoldResult;
    expect(result.outcome).toEqual({ changed: false });
    expect(result.snapshot.labware[id]!.wells).toEqual({
      A1: [{ materialId: 'mat-raw', kind: 'raw', volumeUl: 100 }],
      F1: [],
    });
  });

  it('transfer RAW: deducted-to-zero => source well emptied + destination carries the full move (base shape, the happy golden)', () => {
    const snapshot = labeledSnapshot('PlateOne', 'target');
    const id = Object.keys(snapshot.labware)[0]!;
    const seeded = applyEventToLabState(snapshot, {
      eventId: 'evt-add-seed-d2d',
      event_type: 'add_material',
      details: {
        labwareInstanceId: id,
        well: 'A1',
        material: { materialId: 'mat-raw', kind: 'raw', volumeUl: 100 },
      },
    });
    const rawEv: PlateEventPrimitive = {
      eventId: 'evt-xfer-d2d',
      event_type: 'transfer',
      details: {
        from: { labwareInstanceId: id, well: 'A1' },
        to: { labwareInstanceId: id, well: 'G1' },
        volumeUl: 100,
      },
    };
    const result = applyEventToLabState(seeded, rawEv, RULES) as FoldResult;
    expect(result.outcome).toEqual({ changed: true });
    expect(result.snapshot.labware[id]!.wells).toEqual({
      A1: [],
      G1: [{ materialId: 'mat-raw', kind: 'raw', volumeUl: 100 }],
    });
  });

  it('transfer multi-well arm: per-pair base shapes (a zero-move pair materializes the empty dest; an empty pair writes nothing) (base shape (c))', () => {
    const snapshot = labeledSnapshot('PlateOne', 'target');
    const id = Object.keys(snapshot.labware)[0]!;
    const seeded = applyEventToLabState(snapshot, {
      eventId: 'evt-add-seed-d2e',
      event_type: 'add_material',
      details: {
        labwareInstanceId: id,
        well: 'A1',
        material: { materialId: 'mat-raw', kind: 'raw', volumeUl: 50 },
      },
    });
    // The shipped multi-well carrier shape (source_wells / wells, equal
    // length): A1 (50) -> B1 moves 20; C1 (EMPTY) -> D1 writes nothing.
    const ev: PlateEventPrimitive = {
      eventId: 'evt-xfer-d2e',
      event_type: 'transfer',
      labwareId: 'PlateOne',
      details: {
        source_labware: 'PlateOne',
        destination_labware: 'PlateOne',
        source_wells: ['A1', 'C1'],
        wells: ['B1', 'D1'],
        volumeUl: 20,
      },
    };
    const result = applyEventToLabState(seeded, ev, RULES) as FoldResult;
    expect(result.outcome).toEqual({ changed: true });
    expect(result.snapshot.labware[id]!.wells).toEqual({
      A1: [{ materialId: 'mat-raw', kind: 'raw', volumeUl: 30 }],
      B1: [{ materialId: 'mat-raw', kind: 'raw', volumeUl: 20 }],
    });
    // The empty C1 pair wrote NOTHING (no D1 materialization — the pre-fix
    // fold created `D1: []` here).
    expect(result.snapshot.labware[id]!.wells['D1']).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // D6 (advc fix-run 1, B3 / no-double-vocabulary): the content-bearing
  // EVENT-TYPE taxonomy is DATA (the vocabulary's
  // labStateContentBearingEventTypes list), not a TS literal list in the fold
  // module. Mutation-kill probe: scan the isContentBearing body of the SHIPPED
  // fold module — if a second literal classification of event types is
  // reintroduced (e.g. `event_type !== 'add_material' && event_type !==
  // 'transfer'`), this leg REDs. The event-type membership must come from the
  // `declaredEventTypes` parameter (threaded at the pass seam), never a TS
  // literal list.
  // -----------------------------------------------------------------------
  it('D6: isContentBearing carries NO hardcoded event-type list (the taxonomy is DATA — the fold-side twin of materialBearingEventTypes)', () => {
    const src = readFileSync(
      join(process.cwd(), 'src', 'compiler', 'state', 'LabState.ts'),
      'utf-8',
    );
    // The isContentBearing function body (from its export to the next
    // top-level declaration).
    const start = src.indexOf('export function isContentBearing');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('\nexport function ', start + 1);
    const body = src.slice(start, end === -1 ? undefined : end);
    // No event-type literal comparison against event.event_type (the
    // pre-fix D6 defect: `event.event_type !== 'add_material' && ...`).
    expect(body).not.toMatch(/event\.event_type\s*(!==?|===?)\s*['"]/);
    // The event-type membership rides the DATA parameter (threaded at the
    // pass seam from the vocabulary's labStateContentBearingEventTypes list).
    expect(body).toMatch(/declaredEventTypes/);
    expect(body).toMatch(/declaredEventTypes\.includes\(event\.event_type\)/);
  });
});

// ---------------------------------------------------------------------------
// L2-LABSTATE-CONTENTS-1 FIX RUN 3 — the repeat-create hazard (the live
// multi-turn drive's zero-well defect). The shorthand binder re-emits the
// placement create every turn the plate is referenced; a re-mint of an
// already-placed plate creates a second same-identity instance and the
// design-ref hint then TIES (rung R2 once both carry the same design token)
// => the never-guess no-op. These legs are byte-shaped on the SHIPPED receipt
// wire shapes (create WITHOUT a carrier + add_material with a design-ref
// hint) and prove the idempotent-create rung-mechanics fix.
// ---------------------------------------------------------------------------
describe('L2-LABSTATE-CONTENTS-1 fix3 — idempotent create (the repeat-create hazard)', () => {
  // The prior instance as the live drive commits it after turn A: a 96-well
  // plate whose identityTokens carry the DESIGN's resolved record id (the
  // pass's fix3 (a) emit-carrier — the create's details.labwareId). The
  // design-ref hint the add_material carries is that SAME record id.
  function priorWithDesignToken(): LabStateSnapshot {
    return {
      ...emptyLabState(),
      turnIndex: 1,
      mintCounter: 1,
      deck: [{ slot: 'target', labwareInstanceId: 'LWI-1' }],
      labware: {
        'LWI-1': {
          instanceId: 'LWI-1',
          labwareType: '96-well-plate',
          slot: 'target',
          orientation: 'landscape',
          wells: {},
          identityTokens: ['lbw-seed-plate-96-flat'],
        },
      },
    };
  }

  // The SHIPPED create shape (createContainerExpander) carries NO design
  // carrier (details = {slot, labwareType}); the pass's fix3 (a) emit-carrier
  // writes the resolved record id onto details.labwareId. Model the CARRIED
  // create (what the pass hands the fold) with that carrier.
  function carriedCreate(): PlateEventPrimitive {
    return {
      eventId: 'evt-create-carried',
      event_type: 'create_container',
      details: { slot: 'target', labwareType: '96-well-plate', labwareId: 'lbw-seed-plate-96-flat' },
    };
  }
  function designRefAdd(): PlateEventPrimitive {
    return {
      eventId: 'evt-add-designref',
      event_type: 'add_material',
      labwareId: 'lbw-seed-plate-96-flat',
      details: { well: 'A1', material: 'bench bead beater', labwareId: 'lbw-seed-plate-96-flat', wells: ['A1'] },
    };
  }

  // RED leg (the byte-exact live drive shape, turn=2): a PRIOR instance with
  // NO identityTokens (the pre-fix committed state — the create shipped no
  // carrier, so the mint left identityTokens ABSENT) + the SHIPPED no-carrier
  // create re-mints a SECOND instance + a design-ref add_material (hint = the
  // design's resolved record id). Every ladder rung misses (R1: record id ≠
  // LWI-1/LWI-2; R2: NO instance carries the token; R3: normalizeTypeKey(record
  // id) ≠ normalizeTypeKey('96-well-plate')) => never-guess UNRESOLVED => ZERO
  // wells written to ANY instance. The receipt's turn=2 arm-log:
  // prior {LWI-1:{}} after {LWI-1:{},LWI-2:{}} unresolved=[lab_state_
  // unresolved_labware_reference]. This leg documents the defect (zero wells)
  // on the shipped wire shapes.
  it('RED (live shape: no-token prior + no-carrier create + design-ref add) => ladder all-zero => unresolved, ZERO wells written', () => {
    // The pre-fix committed state: LWI-1 with NO identityTokens (the shipped
    // create carried no design carrier).
    const priorNoToken: LabStateSnapshot = {
      ...emptyLabState(),
      turnIndex: 1,
      mintCounter: 1,
      deck: [{ slot: 'target', labwareInstanceId: 'LWI-1' }],
      labware: {
        'LWI-1': { instanceId: 'LWI-1', labwareType: '96-well-plate', slot: 'target', orientation: 'landscape', wells: {} },
      },
    };
    // The SHIPPED create (no carrier) re-mints a SECOND instance.
    const createNoCarrier: PlateEventPrimitive = {
      eventId: 'evt-create-nocarrier',
      event_type: 'create_container',
      details: { slot: 'target', labwareType: '96-well-plate' },
    };
    const afterCreate = fold(priorNoToken, createNoCarrier);
    const keys = Object.keys(afterCreate.labware);
    expect(keys).toHaveLength(2); // the hazard: LWI-1 + LWI-2 (the receipt's after shape)
    // The design-ref add_material (record-id hint) resolves via NO rung (R1/R2/
    // R3 all zero) => unresolved => ZERO wells written to ANY instance.
    const result = applyEventToLabState(afterCreate, designRefAdd(), RULES) as FoldResult;
    expect(result.outcome.changed).toBe(false);
    expect(result.outcome.reason).toBe('labware_unresolved');
    for (const k of keys) {
      expect(Object.keys(result.snapshot.labware[k]!.wells)).toHaveLength(0);
    }
  });

  // GREEN (the fix): the CARRIED create (details.labwareId = the resolved
  // record id) resolves the SAME instance via the DATA-declared ladder (rung
  // R2 declaredIdentityTokens) and REUSES it — the re-emitted create is a
  // NO-OP (no re-mint), and the design-ref add_material lands on the SAME
  // instance. This is the rung-mechanics fix (fix3 (b)).
  it('GREEN (carried create + design-ref add): the create reuses the prior instance via R2 (no re-mint) and the add lands on the same instance', () => {
    const prior = priorWithDesignToken();
    const afterCreate = fold(prior, carriedCreate());
    // Idempotent reuse: NO second instance — the snapshot is byte-unchanged
    // (same instanceId set, same contents, same identityTokens).
    expect(Object.keys(afterCreate.labware)).toEqual(['LWI-1']);
    expect(afterCreate.labware['LWI-1']!.identityTokens).toEqual(['lbw-seed-plate-96-flat']);
    expect(Object.keys(afterCreate.labware['LWI-1']!.wells)).toHaveLength(0);
    // The design-ref add_material resolves via R2 (exact token match) to the
    // SAME instance and writes A1 (ONE match — no tie).
    const afterAdd = fold(afterCreate, designRefAdd());
    expect(Object.keys(afterAdd.labware)).toEqual(['LWI-1']);
    expect(Object.keys(afterAdd.labware['LWI-1']!.wells)).toEqual(['A1']);
    expect(afterAdd.labware['LWI-1']!.wells['A1']![0]!.materialId).toBe('bench bead beater');
  });

  // The idempotent reuse is RUNG-mechanics over the SAME declared ladder the
  // fold's add/transfer resolve through (resolveLabware) — not a second
  // hardcoded R1/R2 probe. The create's carrier resolves via rung R2
  // (declared identityTokens); the R1 (instanceId) and R3 (unique type) rungs
  // are the ladder's own, so a carrier that is the instanceId (R1) or a
  // unique type (R3) also reuses — generic over the declared order.
  it('reuse is rung-mechanics: a carrier matching the instanceId (R1) or a unique type (R3) also reuses (generic over the declared order)', () => {
    // R1 arm: the create's carrier = the prior instance's instanceId.
    const prior = priorWithDesignToken();
    const createR1: PlateEventPrimitive = {
      eventId: 'evt-create-r1',
      event_type: 'create_container',
      details: { slot: 'target', labwareType: '96-well-plate', labwareId: 'LWI-1' },
    };
    const afterR1 = fold(prior, createR1);
    expect(Object.keys(afterR1.labware)).toEqual(['LWI-1']); // reused (R1), no re-mint
    // R3 arm: the create carries a TYPE-only carrier (no design token, no
    // instanceId) and the prior is the UNIQUE instance of that type => the
    // ladder's R3 rung reuses it.
    const priorUntokened: LabStateSnapshot = { ...emptyLabState(), turnIndex: 1, mintCounter: 1, deck: [{ slot: 'target', labwareInstanceId: 'LWI-1' }], labware: { 'LWI-1': { instanceId: 'LWI-1', labwareType: '96-well-plate', slot: 'target', orientation: 'landscape', wells: {} } } };
    const createR3: PlateEventPrimitive = {
      eventId: 'evt-create-r3',
      event_type: 'create_container',
      details: { slot: 'target', labwareType: '96-well-plate', labwareId: '96-well plate' },
    };
    const afterR3 = fold(priorUntokened, createR3);
    expect(Object.keys(afterR3.labware)).toEqual(['LWI-1']); // reused (R3 unique-type), no re-mint
  });

  // never-guess control: a design-ref hint that matches NO instance
  // (identityTokens absent + non-unique type) => the add no-ops, NOTHING is
  // written to the seed plate instance, and the ladder's tie/zero is terminal
  // (no pick). The ghost-plate design must NOT resolve to the seed plate.
  it('never-guess control: a design-ref hint with no matching instance/tokens (non-unique type) => no-op, NO write to the seed plate', () => {
    const prior = priorWithDesignToken();
    // A second same-TYPE instance with a DIFFERENT token (the ghost plate was
    // placed) — so the ghost design-ref hint (a token neither instance carries)
    // and the type (two instances) both yield ZERO or a TIE => terminal.
    const ghostPrior: LabStateSnapshot = {
      ...prior,
      mintCounter: 2,
      deck: [...prior.deck, { slot: 'target2', labwareInstanceId: 'LWI-2' }],
      labware: {
        ...prior.labware,
        'LWI-2': { instanceId: 'LWI-2', labwareType: '96-well-plate', slot: 'target2', orientation: 'landscape', wells: {}, identityTokens: ['lbw-ghost-plate'] },
      },
    };
    const ghostAdd: PlateEventPrimitive = {
      eventId: 'evt-add-ghost',
      event_type: 'add_material',
      labwareId: 'lbw-ghost-plate',
      details: { well: 'C1', material: 'bench bead beater', labwareId: 'lbw-ghost-plate', wells: ['C1'] },
    };
    // The ghost hint EXACTLY matches LWI-2's token (R2, ONE match) — it must
    // NOT leak to the seed plate LWI-1. (The control's point: never-guess is
    // the exact match, and a hint matching NO token + non-unique type no-ops.)
    const after = fold(ghostPrior, ghostAdd);
    expect(Object.keys(after.labware['LWI-1']!.wells)).toHaveLength(0); // seed plate NEVER written
    expect(Object.keys(after.labware['LWI-2']!.wells)).toEqual(['C1']); // the ghost plate (exact R2) is the only one written
    // And the terminal no-op arm: a hint matching NO token and a non-unique
    // type (two same-type instances) => ZERO wells, NO new instance.
    const mysteryAdd: PlateEventPrimitive = {
      eventId: 'evt-add-mystery',
      event_type: 'add_material',
      labwareId: 'lbw-never-seen',
      details: { well: 'C1', material: 'x', labwareId: 'lbw-never-seen', wells: ['C1'] },
    };
    const afterMystery = fold(ghostPrior, mysteryAdd);
    expect(Object.keys(afterMystery.labware)).toEqual(['LWI-1', 'LWI-2']); // no third instance
    expect(Object.keys(afterMystery.labware['LWI-1']!.wells)).toHaveLength(0); // seed plate NEVER written
    expect(Object.keys(afterMystery.labware['LWI-2']!.wells)).toHaveLength(0); // fresh fold: the mystery no-op wrote nothing
  });
});
