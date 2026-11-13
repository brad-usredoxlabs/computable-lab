# L2-ONTSRC idmintreadonly7 — GREEN (readonly identity slot mints REC- id at submit)

- item: L2-ONTOLOGY-ANCHOR-SOURCES-1 · unit: idmintreadonly7 (GREEN continuation of idmintreadonly6)
- worktree: /home/brad/cl-wt/L2-ONTSRC-idmintreadonly6-lane2 · branch: cl/lane2-ontsrc-idmintreadonly6-0317
- base at start: 59f81fa7609aa23742bf19a84df4275aaaca2de2 (RED pin committed at 96b6804e, report at 59f81fa7)
- implementation commit: eff13ca4306d89d32c0c3da63c8c27ead447031b
  (`ontsrc idmintreadonly7: GREEN — projection-marked readonly identity slot mints REC-<8hex> id at submit
   (labware-definition anchor round-trip; gc16 D4 author-id preserved via empty-slot guard)`)
  — 1 file changed, 52 insertions(+), 2 deletions(-)

## THE CHANGE (owned file: app/src/event-editor/create/RecordCreatePanel.tsx only)

1. Module-level `mintReadonlyIdentity()`: returns exactly `REC-` + 8 UPPERCASE hex chars
   (8× `Math.floor(Math.random()*16).toString(16)`, uppercased). NOT `generateSpineRecordId`
   (4 lowercase base36 — would fail the `^REC-[0-9A-F]{8}$` pin). Spine branch untouched.
2. Discriminator, derived from the projection — never the kind:
   `const identitySlotReadOnly = !isSpine && projection?.slots.find((s) => s.path === `$.${idField}`)?.readOnly === true`
   (strict `=== true`; missing projection or missing slot → NO mint). Uses the RAW
   `projection.slots`, not the `slots` memo (which force-sets readOnly on parent-path slots).
3. In `handleSubmit`, AFTER the empty-field strip and BEFORE `payload.kind = nodeType`:
   `if (identitySlotReadOnly && !payload[idField]) { payload[idField] = mintReadonlyIdentity() }`
4. `idNote` swap: when `identitySlotReadOnly`, the note is
   `An identifier is minted when you save — the UI spec marks it read-only.` The
   writable-identity D16 text is byte-identical (still contains `the client does not mint
   knowledge ids`).

### Deviation from the brief's exact line — and why (documented in-code at the mint site)
The brief's line `if (identitySlotReadOnly) payload[idField] = mintReadonlyIdentity()` is
superseded by the guarded form `if (identitySlotReadOnly && !payload[idField]) { … }`.
Reason: the PROHIBITED gc16 suite's D4 pin (RecordCreatePanel.gc16.test.tsx, the
"knowledge draft is schema-driven: NO client-minted id" test) stubs the assertion
projection with `$.id` slot `readOnly: true` (projectionFor, line 99) AND injects the
AUTHOR's id `ASN-0001` through the mocked editor's onUpdate. An unconditional overwrite
minted a REC- id over the author's id → that pin failed on its first run
(`expected 'ASN-0001'` got `REC-…`, 1 failed | 15 passed (16)). The guard makes the mint
a fallback for an EMPTY identity slot only: an author-supplied id is never replaced (the
D16 contract: the author supplies the id). In the real served form a readonly slot
renders NO input (the D10 shape), so the served-readonly path always reaches the mint
with the id absent — the guard only protects author-supplied values. The readonlyId
RED→GREEN, the gc16 16/16, and the mutation probe below all hold under the guarded form.
The discriminator itself is exactly as briefed (raw `projection.slots`, `=== true`).

Nothing else changed: spine recordId mint + shortSlug stamping, the D9/shortSlug-deletion
branch, projection fetch, refusal states, serializer call — all byte-identical. No
`recordId` is ever invented for a non-spine payload (the server derives it from `id`,
RecordEnvelope.ts:87).

## RED (as re-measured this run — baseline at 59f81fa7)
Targeted test at base: `Tests 1 failed | 1 passed (2)`; raw payload
`{"kind":"labware-definition","title":"bench top","name":"bench top","ontology_ref":"LWO:0000120"}`
— no `id`; `TypeError: .toMatch() expects to receive a string, but got undefined`.
Reproduced verbatim by the mutation probe below (same raw payload, same failure at
:141).

## GREEN (implementation commit eff13ca4)
`cd app && node node_modules/vitest/vitest.mjs run src/event-editor/create/RecordCreatePanel.readonlyId.test.tsx`
(`npx vitest` is NOT resolvable from the repaired node_modules — no `.bin/` links — so
`npx vitest …` was substituted with the direct vitest entry point, same runner, same args):

```
stdout | … labware-definition: $.id is readonly in the served projection → …
RAW CAPTURED PAYLOAD (readonly $.id): {"kind":"labware-definition","title":"bench top","name":"bench top","ontology_ref":"LWO:0000120","id":"REC-A7E8527A"}

stdout | … D16 pin (writable identity): $.id NOT readonly → …
RAW CAPTURED PAYLOAD (writable $.id): {"kind":"assertion","title":"scoped assertion","name":"scoped assertion"}

 ✓ src/event-editor/create/RecordCreatePanel.readonlyId.test.tsx  (2 tests) 121ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
```

The POST body carries `id: REC-A7E8527A` (matches `^REC-[0-9A-F]{8}$`), the anchor
`LWO:0000120` and the display name `bench top` survive; the writable-identity arm carries
NO client-minted `id`.

## gc16 regression pins (16/16)
`cd app && node node_modules/vitest/vitest.mjs run src/event-editor/create/RecordCreatePanel.gc16.test.tsx src/event-editor/create/RecordCreatePanel.gc16-widget-commit.test.tsx`:

```
 ✓ src/event-editor/create/RecordCreatePanel.gc16.test.tsx  (6 tests) 739ms
 ✓ src/event-editor/create/RecordCreatePanel.gc16-widget-commit.test.tsx  (10 tests) 4145ms
 Test Files  2 passed (2)
      Tests  16 passed (16)
   Duration  14.43s
```

(First run before the guard: 1 failed | 15 passed (16) — the D4 author-id collision
documented above; the guarded mint restores 16/16 with zero test-file edits.)

## Typecheck (baseline comparison)
At most one run, in `app/`: `node node_modules/typescript/bin/tsc --noEmit`
(`npm run typecheck -w app` cannot resolve `tsc` from the repaired node_modules — same
`.bin/`-less repair — so the package's own tsc entry was invoked directly):

```
src/editor/taptab/tabNavPlugin.ts(7,33): error TS2307: Cannot find module 'prosemirror-view' or its corresponding type declarations.
```

Exactly 1 error — the pre-existing baseline (lane-ops node_modules repair side effect);
the only file named is `src/editor/taptab/tabNavPlugin.ts`. No error names
RecordCreatePanel.tsx. Exit gate met: count still 1, same single file.

## Mutation probe (exact mutation per brief: delete the mint statement)
1. Removed the `if (identitySlotReadOnly && !payload[idField]) { payload[idField] = mintReadonlyIdentity() }`
   block (sed/python removal, backup kept in /tmp during the probe), ran the targeted test:

```
RAW CAPTURED PAYLOAD (readonly $.id): {"kind":"labware-definition","title":"bench top","name":"bench top","ontology_ref":"LWO:0000120"}
RAW CAPTURED PAYLOAD (writable $.id): {"kind":"assertion","title":"scoped assertion","name":"scoped assertion"}

 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
```

   — the g4 RED shape reproduced exactly (no `id` in the captured payload; failure at
   `.toMatch(/^REC-[0-9A-F]{8}$/)`, line 141). The mint is NOT re-derived elsewhere.
2. Restored the line from the /tmp backup, re-ran: `Test Files 1 passed (1)` / `Tests 2
   passed (2)`.
3. `git status --short` after restore, before commit:

```
 M app/src/event-editor/create/RecordCreatePanel.tsx
?? app/node_modules.symlink.bak
```

   — only the allowed owned file dirty plus the untracked lane-ops artifact
   (untouched, never added).

## AC mapping (for the browser gate)
- AC1 (labware-definition create with anchor): the minted `id` (REC-<8hex>) + `ontology_ref`
  + display name now ride in the single POST; the server's `extractRecordId` id-fallback
  (RecordEnvelope.ts:87) resolves the recordId, so the g4 400 ("payload must contain
  recordId or id field") cannot recur. Live-browser leg is the independent reviewer's.
- AC2 (writable identity / spine): D16 arm green (note text byte-identical, no minted id);
  spine `recordId` keeps its STU-/EXP-/RUN- mint (gc16 D5/D9 pins green, 16/16).
- AC3 (identity stability): the mint fires once per submit (not on mount/derive), the
  header preview is untouched, and the created record is re-read at the minted id.

## Environment notes (no action taken — per commit discipline)
- `npx vitest` / `npm run typecheck` fail with "command not found" in this worktree: the
  hand-repaired `app/node_modules` has no `.bin/` links. Substituted the package-local
  entry points (`node node_modules/vitest/vitest.mjs`, `node node_modules/typescript/bin/tsc`)
  — same runner, same arguments, no installs, no scaffolding.
- `app/node_modules.symlink.bak` left untracked and un-staged; not added to
  `.git/info/exclude` (it stays `??` and every commit staged explicitly — nothing swept in).

## Changed files (this unit)
- app/src/event-editor/create/RecordCreatePanel.tsx (52 insertions, 2 deletions) — commit
  eff13ca4306d89d32c0c3da63c8c27ead447031b. No test files, schema files, server files,
  uiSpec.ts, or RecordEditPanel.tsx touched.

## Verification commands (reproducible)
```
cd /home/brad/cl-wt/L2-ONTSRC-idmintreadonly6-lane2/app
node node_modules/vitest/vitest.mjs run src/event-editor/create/RecordCreatePanel.readonlyId.test.tsx
# → Test Files 1 passed (1) / Tests 2 passed (2)
node node_modules/vitest/vitest.mjs run src/event-editor/create/RecordCreatePanel.gc16.test.tsx src/event-editor/create/RecordCreatePanel.gc16-widget-commit.test.tsx
# → Test Files 2 passed (2) / Tests 16 passed (16)
node node_modules/typescript/bin/tsc --noEmit
# → exactly 1 error: src/editor/taptab/tabNavPlugin.ts(7,33) TS2307 'prosemirror-view' (pre-existing baseline)
cd /home/brad/cl-wt/L2-ONTSRC-idmintreadonly6-lane2 && git -c core.fileMode=false status --short
# → (after the report commit) only: ?? app/node_modules.symlink.bak
```

## Next actions
- Browser gate (independent reviewer): AC1–AC3 on the authorized lane stack against the
  served rev; read its screenshots on any defect. Note: a YAML change is not involved in
  this unit — no lane-stack reload required for the app code change itself (the served
  projection already carries `readOnly: true` on `$.id` from
  schema/workflow/labware-definition.ui.yaml:35, unedited).

## Marker
L2-ONTOLOGY-ANCHOR-SOURCES-1 UNIT idmintreadonly7 DONE eff13ca4306d89d32c0c3da63c8c27ead447031b
