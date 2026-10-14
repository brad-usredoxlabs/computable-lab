# SPEC — EDITOR-9-EMPTY-OPTIONAL-SAVE (lane 1)
# Composed by orchestrator tick 20261010T1540 from rulings/L1-qms-field-defects-ruling-20261010.md
# (Defect L1-B, APPROVED by Brad 2026-10-10) + orchestrator-screened cl-scout recon
# (scout-logs/editor9-s1.log; load-bearing claims re-verified first-hand by the orchestrator —
# marked [VERIFIED] below). Trunk base: cl/integration-1 @ 14637f6d.

## Item
id: EDITOR-9-EMPTY-OPTIONAL-SAVE
Record save emits empty values for untouched optional fields — validation fails on save with
required-only input. Priority HIGH: blocks ALL QMS record authoring on lane-1 surfaces.

## Symptom (Brad, live :5192, sandbox mode)
Save a person with ONLY required fields ->
"Validation failed: /organizationId: Expected type: string; /contact/phone: Expected type: string".
person.schema.yaml is CORRECT (organizationId, contact.phone optional type:string) and STAYS.

## Root cause [VERIFIED by orchestrator at recordSerializer.ts:49-84]
`extractFieldRows` (app/src/editor/taptab/recordSerializer.ts) walks the TipTap doc and, for every
fieldRow, unconditionally `setValueAtPath(result, cleanPath, value)` — writing `''` (and empty-ish
values) for non-ref widgets. Only ref widgets get omission treatment today via
`isEmptyRefFieldValue` (app/src/editor/taptab/refValue.ts:56, consumed at recordSerializer.ts:63;
on the true-empty contract it DELETES the path instead — QMS-6E, A-L1-014).
No dirty/set map exists: form state is the base payload + serialized fieldRow attrs; dirty is
derived via isDirty() (recordSerializer.ts:142-147).

## Contract (what "correct" means)
Backend enforces exactOptionalPropertyTypes: an optional slot is valid when ABSENT or when it
holds a value of the declared type. Therefore:
1. ONE shared omission helper on the save serializer (extend the existing QMS-6E ref pattern —
   do NOT add per-kind patches, do NOT touch person.schema.yaml or any schema).
2. Scope of the omission decision: for NON-ref widget values the serializer must not write an
   empty string (and must treat an empty number the same way) where the value slot is a
   scalar optional. Cleared optional => ABSENT (delete the path from the payload, mirroring the
   ref contract's deleteValueAtPath behavior — a stale base-payload value at that path must be
   removed too, or "clear" silently un-clears).
   IMPORTANT boundary the coder must nail down with a RED test, not guess: omission applies to
   the serialized fieldRow value when it is the widget's "unset/empty" value. A REQUIRED field
   left empty then fails the server's required-check (a real, desired validation error) —
   omission must not suppress requiredness.
3. Coder MUST first survey the whole record-save surface for the same defect class before
   patching: every consumer of serializeDocument — TapTabEditor.tsx handleUpdate (:66-71),
   ProjectionTapTabEditor.handleUpdate (:176-182), RecordRegistryPage.handleSave (:147-180,
   serializeDocument call :161-164). One fix at the serializer serves them all; verify no second
   payload builder (e.g. any direct-PUT form path outside TapTab) writes empty optionals — if a
   second independent builder exists, fix the shared helper or report the split.

## File ownership (expect to touch)
- app/src/editor/taptab/recordSerializer.ts (+ recordSerializer.test.ts)
- possibly app/src/editor/taptab/refValue.ts (only if the empty-set helper generalizes cleanly)
- NO schema/, NO server changes unless the survey finds a second server-side serializer emitting
  empty optionals (then STOP-note it — server-side omission is a different seam).

## RED-FIRST test plan (vitest, from the `app` package dir)
In app/src/editor/taptab/recordSerializer.test.ts (existing file covers serializeDocument /
isDirty / stripSystemProvenance; NO empty-omission coverage today [VERIFIED scout + gap is the
bug's survival reason]):
- RED: serialize a doc whose text fieldRow holds '' (untouched optional) -> payload must NOT
  contain the path.
- filled optional value -> present.
- cleared optional (base payload HAS a value at that path, widget now '') -> path ABSENT
  (deleted), not ''.
- required-but-empty -> omitted from payload; server-side required error is the correct outcome
  (assert client simply omits; do not fabricate a client-side required check).
- ref-widget behavior unchanged (QMS-6E fences stay green).

## Live reproduction (lane 1, after implementation)
Restart stack if YAML touched (none expected). On :5192 create a person with ONLY required
fields -> save succeeds; detail renders. Edit, clear an optional -> save succeeds. Then GET the
record via :3092 and confirm the cleared optional is absent in the stored payload.

## Gate (browser receipts — cl-browser-reviewer, http://localhost:5192)
VERBATIM from task block: "Browser receipt (:5192): create person filling ONLY required fields
-> save succeeds + detail renders; edit + clear an optional -> save succeeds."
Plus one regression shot: an existing record edit that saves a NON-empty optional still persists
it (no over-omission).

## Baselines (capture fresh at claim base, report §0)
- app vitest fail-FILE SET from the package dir (cd app && npx vitest run); zero NEW failing files.
- app tsc error multiset vs trunk (strip line/col, sorted-set equality).
- server untouched expected: no server baselines needed unless the survey finds a server seam.

## Stop boundaries -> architect (requires-rescope, stop, do not absorb)
- any need to change schemas or the backend validation semantics;
- a second payload-builder family that cannot share the one helper;
- pressure to make '' a storable value for optional strings.

## Deliverables
- ONE final commit on the worktree branch off cl/integration-1.
- Report at the unique path given in the dispatch prompt (.wip file, untracked), carrying §0
  baselines, RED output, GREEN tail, survey result of the save surface, diff --name-only.
- All records created during live verification are TEST DATA (Brad ruling A4) — no cleanup duty.
