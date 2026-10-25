# CANONICAL — REG-3 spec (composer l1t2355 draft, PROMOTED by orchestrator 2026-10-18 with the binding OQ rulings at the bottom)

> Status: PROMOTED (2026-10-18). Coder dispatch authorized — follow the binding
> orchestrator OQ rulings at the END of this file. Plan is authority; this is the
> execution spec around it.

# REG-3 — record-ref widget: ref fields pick RECORDS of the declared kind and commit canonical ref objects

## Goal (one sentence)

Introduce the declarative widget name `record-ref` end-to-end (ui.yaml → UISpecLoader →
WidgetRenderer → RecordRefPicker) so record-reference fields list RECORDS of the declared
`refKind` and commit the canonical ref object from
`schema/core/datatypes/ref.schema.yaml` — instead of routing every `ref` field into
ontology search and committing a bare string that cannot save.

## Why

`training-record.ui.yaml` already declares `refKind` and the projection forwards it
(live proof in the plan), but `WidgetRenderer.tsx:312` routes ALL `widget === 'ref'` to
`RefCombobox` (ontology/vocab term search), and the FieldRow commit path for local picks
(`extensions/FieldRow.tsx:80` — `updateAttributes({ value: v })`) stores a BARE STRING where
`personRef` must be `{ kind: 'record', type: 'person', id: 'PER-…' }` per
`schema/core/datatypes/ref.schema.yaml` (required for record refs: `kind`, `id`, `type` —
lines 74-77; `label` optional, lines 24-27). A "successful" pick therefore cannot save.
This extends the widget-declaration pipeline rather than special-casing; `RecordRefPicker.tsx`
already exists (exported `app/src/editor/taptab/index.ts:21`, used nowhere) and gets rewritten.

## Scope — files IN scope (all paths at lane-1 trunk, verified first-hand)

| File | Change |
|---|---|
| `app/src/editor/taptab/extensions/WidgetRenderer.recordRef.test.tsx` | NEW — RED test (plan Task 7, verbatim) |
| `app/src/editor/taptab/types.ts` | `:27` — add `\| 'record-ref'` after `\| 'ref'` |
| `app/src/shared/forms/suggestionPlan.ts` | `:80` — `isRef = widget === 'ref' \|\| widget === 'reflist' \|\| widget === 'record-ref'` |
| `app/src/editor/taptab/refValue.ts` | `:21` — `REF_VALUE_WIDGETS = new Set(['ref', 'record-ref'])` |
| `server/src/ui/types.ts` | `:21` — add `\| 'record-ref'` (comment: `// Single record reference (record picker, canonical ref object)`) |
| `server/src/ui/UISpecLoader.ts` | `:19-25` `VALID_WIDGET_TYPES` — add `'record-ref'`; `:288` refKind gate → `['ref', 'reflist', 'record-ref'].includes(...)` |
| `app/src/editor/taptab/RecordRefPicker.tsx` | REWRITE wholesale per plan Task 9 |
| `app/src/editor/taptab/taptab.css` | add `.record-ref-picker*` rules per plan Task 9 (next to `.ref-combobox` rules) |
| `app/src/editor/taptab/extensions/WidgetRenderer.tsx` | import + dispatch block BEFORE the `:312` ref/combobox block (plan Task 10) |
| `schema/lab/*.ui.yaml` | conversions per the binding table below (Task 11) |
| `server/src/ui/UISpecRecordRef.test.ts` | NEW server guard test (Task 12) |

Explicitly OUT of scope (see §Out-of-scope map): `extensions/FieldRow.tsx` (NO edit — see
below), `app/src/shared/api/client.ts` (`listRecordsByKind` ALREADY EXISTS at `:2094-2113`,
hits `GET /records?kind=<kind>&limit&offset`; server route verified at
`server/src/api/routes.ts:224` → `RecordHandlers.listRecords` at
`server/src/api/handlers/RecordHandlers.ts:426`, returns `{ records: RecordEnvelope[], total }`
where `RecordEnvelope = { recordId, schemaId, payload, meta? }` — `app/src/types/kernel.ts:9-12`),
RecordRegistryPage.tsx, DocumentShell, anything REG-1/2/4 touch.

**FieldRow needs NO edit**: the record-ref widget commits through
`WidgetRenderer onCommit` → `FieldRow.tsx:148-152`
`updateAttributes({ value: normalizeRefFieldValue(v, attrs.widget) })`, and
`normalizeRefFieldValue` passes objects through untouched (`refValue.ts:45-50`). The
bare-string else-branch at `FieldRow.tsx:80` is the RefCombobox `onRefSelect` path — record-ref
never enters it. Registering `'record-ref'` in `REF_VALUE_WIDGETS` is what keeps the save
serializer honest: `isEmptyRefFieldValue` (`refValue.ts:57-59`) omits an empty ref from the
payload (absence, not `''`/`null`, is the true empty — the backend runs
`exactOptionalPropertyTypes: true`, `server/tsconfig.json:13`).

## NON-GOALS (binding)

- NO behavior change to the ontology `combobox`/`ref`→RefCombobox path. `widget: "ref"`
  fields NOT in the table keep routing to RefCombobox exactly as today.
- NO W4-D3 fields: `schema/lab/controlled-document.ui.yaml` stays `ref` on ALL SIX sites
  (`:65-80` and `:125-136` — authorRef/reviewerRef/approverRef, `refKind: user` —
  lifecycle identity `USR-*`, not a registry kind). Do not relitigate.
- NO `/tree/search`-based picker. The CURRENT `RecordRefPicker.tsx` is exactly the wrong
  implementation (`:64` `apiClient.searchRecordsByKind` → `GET /tree/search`, `:60` gated on
  `query.length >= 2`): fresh records have no index title, so a just-created record would not
  appear. The rewrite fetches the full kind-scoped listing ONCE and filters locally.
- NO `schema/workflow/*` and NO `protocol.ui.yaml` edits this wave (W4 ruling).
- NO conversions beyond the binding table (aliquot, instrument-log, labware-geometry,
  labware-instance, material-spec, measurement, recipe ui.yaml carry `widget: "ref"` but are
  NOT in the plan table — they stay `ref` this wave).

## Acceptance criteria (VERBATIM from task list `verified by:`)

> WidgetRenderer.recordRef.test.tsx 3/3 (lists person records, no .ref-combobox, commits the
> ref OBJECT, renders "label (ID)"); server UISpecRecordRef.test.ts PASS; app+server tsc no
> new errors; live lane curl: editor-draft for training-record shows widget:"record-ref" for
> personRef/trainerRef/trainingMaterialRef. Browser gate per plan step d: Create in Training
> tab -> Person field lists PER-... records; save -> curl records?kind=training-record shows
> "personRef":{"kind":"record",...} — never a bare string. cl-browser-reviewer VERDICT: accept.

tsc "no new errors" = delta-0 against the raw base captures below (own15 precedent: raw
error-line capture files, diff the captures, not exit codes).

## Task 7 — RED first (before ANY implementation)

Create `app/src/editor/taptab/extensions/WidgetRenderer.recordRef.test.tsx` VERBATIM from the
plan (lines 700-762). Notes verified against real code:

- Mock path `../../../shared/api/client` resolves correctly from `extensions/` to
  `app/src/shared/api/client.ts` ✓. `listRecordsByKind` mock shape matches the real return
  (`{ records: RecordEnvelope[]; total }` — mock provides `recordId` + `payload`, which is
  what the picker reads).
- The plan's `tabNavPlugin` mock exports `focusAdjacentTabField`; the REAL export is
  `focusAdjacentTapTabField` (`tabNavPlugin.ts:48`, imported at `WidgetRenderer.tsx:8`).
  Harmless ONLY because the record-ref path never calls tab-nav (picker handles Enter itself,
  `WidgetRenderer`'s `handleKeyDown` is not mounted while RecordRefPicker replaces the input).
  Keep the plan test verbatim; if a RED/GREEN run trips on the undefined export, add
  `focusAdjacentTapTabField: vi.fn()` to the SAME mock factory — do not touch the assertions.
- Test 1's `.taptab-widget-value` click enters editing via the wrapper `onClick`
  (`WidgetRenderer.tsx:349`). Test 2's `option.closest('li')` matches the picker's `li onClick`
  commit. Test 3's `"Ada Lovelace (PER-2)"` is already produced by
  `formatWidgetDisplayValue`/`isRecordLikeRef` (`WidgetRenderer.tsx:34-53`) once the object
  lands — no display code to write.
- The canonical commit object `{ kind: 'record', type, id, label }` satisfies
  `ref.schema.yaml`: kind enum includes `record` (`:14`), record refs require `id`+`type`
  (`:70-77`), `label` optional-but-displayed (`:24-27`), no `additionalProperties: false` on
  the top-level object, and the commit emits no extra keys anyway.

First targeted check (proves the approach early, run at a CLEAN base):

    cd app && npx vitest run src/editor/taptab/extensions/WidgetRenderer.recordRef.test.tsx

Expected RED at base: 3/3 fail — `record-ref` is not a known widget, it falls through to the
generic text input (`WidgetRenderer.tsx:334-347`), so no list, no object commit, and
`formatWidgetDisplayValue` shows the ref for test 3 only as `label (id)` IF the value object
renders — it does, so expect test 3 to be the flaky-half: if it PASSES at base that is fine
and expected (display formatting already exists); tests 1 and 2 MUST fail. If all three pass
at base, the widget somehow already exists — STOP and report.

## Tasks 8-10 — GREEN (exact edits, cited at trunk c895f0f0)

1. **App registration** — `app/src/editor/taptab/types.ts:27` add `| 'record-ref'` after `| 'ref'`.
2. **Suggestion plan** — `app/src/shared/forms/suggestionPlan.ts:80`
   `const isRef = widget === 'ref' || widget === 'reflist' || widget === 'record-ref';`
3. **Ref value contract** — `app/src/editor/taptab/refValue.ts:21`
   `const REF_VALUE_WIDGETS = new Set(['ref', 'record-ref'])`
4. **Server type** — `server/src/ui/types.ts:21` add `| 'record-ref'` to `WidgetType`.
5. **Server loader** — `server/src/ui/UISpecLoader.ts:19-25` add `'record-ref'` to
   `VALID_WIDGET_TYPES` (validated at `:260` — miss this and every edited ui.yaml fails
   `load()`); `:288` widen the refKind gate to `['ref', 'reflist', 'record-ref']`.
6. **Picker rewrite** — `app/src/editor/taptab/RecordRefPicker.tsx` replaced wholesale by the
   plan Task 9 component: props `{ value, refKind, onSelect(RecordRefSelection), onCancel }`,
   one `apiClient.listRecordsByKind(refKind, 200)` fetch keyed on `refKind`, `labelOf` falls
   back `displayName→name→title→label→id→recordId`, local substring filter over id/label,
   max 50 shown, ArrowUp/Down/Enter/Escape, commit
   `onSelect({ kind: 'record', type: refKind, id: option.recordId, label: option.label })`.
   Note: the OLD props signature (`onSelect(value, recordId, structured)`, `suggestionPlan`)
   has NO other call sites (grep: only `index.ts:21` re-exports it) — wholesale replacement is
   safe; keep the export name so `index.ts:21` keeps compiling.
7. **CSS** — append the plan's `.record-ref-picker*` block to
   `app/src/editor/taptab/taptab.css` next to the `.ref-combobox` rules (the literal
   `rgba(0,0,0,0.12)` box-shadow is fine — the token-only tests scan page/rail CSS only, not
   taptab.css).
8. **Dispatch** — in `app/src/editor/taptab/extensions/WidgetRenderer.tsx` import
   `RecordRefPicker` from `'../RecordRefPicker'` and insert the plan's
   `if (widget === 'record-ref' && editing) { ... }` block IMMEDIATELY BEFORE the existing
   `if ((widget === 'ref' || widget === 'combobox') && editing)` at `:312` (block order
   matters: `record-ref` must win before the ref/combobox catch-all). `handleRefCancel`
   already exists (`:176`); `refKind || 'default'` fallback per plan.

Commit (plan Task 10): `feat(editor): record-ref widget — pick records of a declared kind, commit canonical refs`
staging `app/src/editor/taptab app/src/shared/forms/suggestionPlan.ts server/src/ui/types.ts server/src/ui/UISpecLoader.ts`.

## Task 11 — ui.yaml conversion table (BINDING; file:line at c895f0f0, first line = the `path:` line, `w:` = the `widget: "ref"` line to rewrite)

Convert ONLY these — `widget: "ref"` → `widget: "record-ref"`, all other field keys
untouched:

| File | Field | path: line | widget: line | refKind |
|---|---|---|---|---|
| `schema/lab/training-record.ui.yaml` | `$.personRef` | :24 | w:25 | person (:28) |
| `schema/lab/training-record.ui.yaml` | `$.trainingMaterialRef` | :29 | w:30 | training-material (:33) |
| `schema/lab/training-record.ui.yaml` | `$.trainerRef` | :34 | w:35 | person (:37) |
| `schema/lab/equipment.ui.yaml` | `$.equipmentClassRef` | :42 | w:43 | equipment-class (:45) |
| `schema/lab/equipment.ui.yaml` | `$.instrumentRef` | :46 | w:47 | instrument (:49) |
| `schema/lab/equipment-class.ui.yaml` | — NONE (no ref fields; grep-verified) — | | | |
| `schema/lab/training-material.ui.yaml` | `$.supersededByRef` | :55 | w:56 | training-material (:58) |
| `schema/lab/training-material.ui.yaml` | `$.reviewerRef` | :66 | w:67 | person (:69) — person IS a record kind, convert |
| `schema/lab/training-material.ui.yaml` | `$.approverRef` | :71 | w:72 | person (:74) |
| `schema/lab/competency-authorization.ui.yaml` | `$.personRef` | :24 | w:25 | person (:27) |
| `schema/lab/competency-authorization.ui.yaml` | `$.approvedByRef` | :40 | w:41 | person (:43) |
| `schema/lab/equipment-training-requirement.ui.yaml` | `$.equipmentRef` | :24 | w:25 | equipment (:27) |
| `schema/lab/equipment-training-requirement.ui.yaml` | `$.equipmentClassRef` | :28 | w:29 | equipment-class (:31) |
| `schema/lab/instrument.ui.yaml` | `$.equipmentRef` | :41 | w:42 | equipment (:44) |
| `schema/lab/calibration-record.ui.yaml` | `$.equipmentRef` | :25 | w:26 | equipment (:29) |
| `schema/lab/calibration-record.ui.yaml` | `$.performedByRef` | :50 | w:51 | **NONE at base** — see OQ-1 |
| `schema/lab/qualification-record.ui.yaml` | `$.equipmentRef` | :26 | w:27 | equipment (:29) |
| `schema/lab/qualification-record.ui.yaml` | `$.performedByRef` | :34 | w:35 | person (:37) |
| `schema/lab/person.ui.yaml` | — NONE (no ref fields; grep-verified) — | | | |
| `schema/lab/controlled-document.ui.yaml` | — DO NOT TOUCH (`:65-80`, `:125-136`) — W4-D3 | | | user (stays `ref`) |

OQ-1: `calibration-record.ui.yaml` `$.performedByRef` (`:50-52`) has NO `refKind` at base.
With the gate widened, converting it without adding a kind leaves the picker at
`refKind || 'default'` → it would list records of kind `default` (nothing). Spec
recommendation: add `refKind: "person"` alongside the conversion, mirroring
`qualification-record.ui.yaml:37`. Orchestrator ruling requested; the coder MUST NOT invent a
different kind.

NOT converted (out of the binding table even though they carry `widget: "ref"`):
aliquot(:28), instrument-log(:43,:46,:49), labware-geometry(:29), labware-instance(:29),
material-spec(:29,:48), measurement(:37,:43,:46), recipe(:29,:46) — stay `ref` this wave.

After edits: `bash cl-lane-stack.sh 1 restart` (lane-1 stack = backend **:3092**, frontend
**:5192**; `cl-lane-stack.sh` header lines 11/20 — tsx --watch does NOT reload YAML, the spec
cache is boot-loaded; NEVER a blanket kill of :3001/:5174 — those are Brad's main stack and
are NOT part of this lane).

Commit (plan Task 11): `spec(registry): declare record-ref for record-reference fields`.

## Task 12 — server guard test

Create `server/src/ui/UISpecRecordRef.test.ts` from plan lines 1093-1127 with ONE correction
(OQ-2): the plan test asserts `res.errors ?? []`, but `UISpecLoadResult`
(`server/src/ui/types.ts:297-306`) has NO `errors` field — it is
`{ success, spec?, error?, validationErrors? }`. Assert
`expect(res.validationErrors ?? []).toEqual([])` instead (plus `res.success` true). Otherwise
the guard asserts nothing. Verified import targets: `createUISpecLoader` is exported at
`server/src/ui/UISpecLoader.ts:787` and re-exported via `server/src/ui/index.ts:6`
(`export * from './UISpecLoader.js'`); `projectRecord` is exported at
`server/src/ui/EditorProjectionService.ts:422` with signature
`(uiSpec, payload, schemaId, recordId)`; `res.spec!.schemaId` exists (`types.ts:267`);
`ProjectionSlot` carries `path`/`widget`/`refKind` (`types.ts:523-535` and the fallback path
copies `refKind` at `EditorProjectionService.ts:213`). The two-it assertions on the three
training-record slots stay verbatim.

Server test runner convention: vitest (`server/package.json:12 "test": "vitest"`), NOT node --test.

Commit: `test(ui): record-ref widget is declared and projected for training-record`.

## Live-lane proof (orchestrator-side, after merge + stack restart)

    curl -s -X POST "http://localhost:3092/api/ui/schema/https%3A%2F%2Fcomputable-lab.com%2Fschema%2Fcomputable-lab%2Ftraining-record.schema.yaml/editor-draft" \
      -H 'content-type: application/json' -d '{}' | grep -o '"path":"\$\.\(personRef\|trainerRef\|trainingMaterialRef\)","label":"[^"]*","widget":"[^"]*"'

Expected: three lines, each `"widget":"record-ref"`. (URL shape mirrors the plan's :3001
command, retargeted to lane :3092.) Browser gate per plan step d + cl-browser-reviewer accept
are orchestrator-side gates; coder must NOT touch :3001/:5174/:3092/:5192 processes directly.

## Verification commands (coder runs in the worktree)

RED (base): `cd app && npx vitest run src/editor/taptab/extensions/WidgetRenderer.recordRef.test.tsx` → FAIL as above.
GREEN: same command → **3 passed (3)**.
Regression: `cd app && npx vitest run src/editor/taptab` → compare against BASELINE below:
  15 files → 12 passed | 3 failed; 156 tests → **150 passed | 6 failed**, the 6 being the
  PRE-EXISTING failures (RefCombobox.test.tsx 2, ChipComboboxWidget.test.tsx 2,
  documentMapper.test.ts 2). REG-3 must add zero new failures and must NOT fix those 6 (they
  are ontology-mock/pre-existing debt — fixing them is scope creep).
Server guard: `cd server && npx vitest run src/ui/UISpecRecordRef.test.ts` → PASS (2 tests).
Server ui regression: `cd server && npx vitest run src/ui` → no new failures.
tsc delta-0 (own15 precedent — raw capture files, then diff):
  base captures (taken by composer at c895f0f0, below), head captures:
  `cd app && npx tsc --noEmit > <worktree-report-dir>/tsc-reg3-head-app-l1t2355.txt 2>&1`
  `cd server && npx tsc --noEmit > <worktree-report-dir>/tsc-reg3-head-server-l1t2355.txt 2>&1`
  Then `diff` head vs base: identical (the app test file is test-only and vitest-run; app tsc
  baseline already includes pre-existing test-file errors — head must match line-for-line).

## Baselines captured at claim time (composer, at trunk c895f0f0 — REG-3's base)

- Base commit: `c895f0f02e8dda08072f4f957850c1de270a434a` (cl/integration-1; REG-1 already
  merged). **REG-3 runs CONCURRENTLY with the REG-2→REG-4 chain (disjoint files: they own
  RecordRegistryPage/DocumentShell/registry CSS, REG-3 owns taptab/UISpecLoader/schema-lab);
  REG-3's base is trunk AT CLAIM TIME — re-capture the tsc bases on the claim SHA if the
  chain merges first and any merged diff could touch shared files (none currently do).**
- app tsc base: **23 raw `error TS` lines** — `/home/brad/.hermes/cl/lanes/1/tsc-reg3-base-app-l1t2355.txt`
  (pre-existing: useAiChat.surfaceContext.test 6, editorHistory 2, deckLayout 2, Viewer,
  IngestionUploadModal, ExtractionProgressPanel, useSurfaceContext …; NONE in taptab/ui files —
  the two files REG-3 touches app-side that could type-error are new/edited by REG-3 itself).
- server tsc base: **0 errors** — `/home/brad/.hermes/cl/lanes/1/tsc-reg3-base-server-l1t2355.txt` (empty).
- taptab suite base: `Test Files 3 failed | 12 passed (15)`, `Tests 6 failed | 150 passed (156)`
  — `/home/brad/.hermes/cl/lanes/1/reg3-base-taptab-suite-l1t2355.txt`.

## Worker contract

- Worktree: `/mnt/vast/home/brad/git/wt/REG-3-lane1-l1t2355`, branch
  `cl/REG-3-lane1-l1t2355` off lane-1 trunk at claim time (same pattern as REG-1's
  `wt/REG-1-lane1-l1t2305`). All git via `git -c core.fileMode=false` (NFS mode-bit noise).
- Deliverable/report: `/home/brad/.hermes/cl/lanes/1/reg3-report-l1t2355.md`, end-line
  `REG3 CODER DONE <sha>`; head tsc captures + RED/GREEN vitest raws alongside (own15
  precedent).
- Plan commits in order (Task 10 commit covers Tasks 7-10; Task 11 ui.yaml commit; Task 12
  test commit). Stack restart only AFTER the Task 11 commit; orchestrator does the live curl.
- Never touch :3001/:5174 (main stack) or kill processes outside the worktree; lane stack
  restarts belong to the orchestrator tick if the coder's restart races another lane process.

## Reviewer-bait (likely shortcuts — the coder must pre-empt each)

1. **Missing server `VALID_WIDGET_TYPES` registration** (`UISpecLoader.ts:19-25`): without it
   EVERY edited ui.yaml fails `load()` at `:260` ("invalid widget type 'record-ref'") and the
   editor silently falls back — the live curl then shows the OLD widget or nothing. Task 12's
   guard test exists precisely to catch this; do not skip the gate widening at `:288` either.
2. **Picker built on /tree/search**: keeping `searchRecordsByKind` (old RecordRefPicker's
   `:64`, `query.length >= 2` gate) looks identical in a browser demo with seeded records but
   shows NOTHING for freshly created records (no index title). The mock in the RED test only
   stubs `listRecordsByKind` — a /tree/search build fails test 1.
3. **Committing a bare string and wrapping at save** (or leaving FieldRow's else-branch
   `FieldRow.tsx:80` as the record-ref commit path): the PICKER must call
   `onCommit({ kind: 'record', type, id, label })` — test 2 asserts the exact object. A save-side
   coercion hack passes no test, breaks the ref value contract, and re-breaks on ontology refs.
4. **Converting a W4-D3 or unlisted field**: `controlled-document.ui.yaml` (all 6 sites) and
   anything outside the table (measurement, recipe, aliquot, …) stay `ref`. Converting
   `refKind: user` fields would point users at a `user` record listing that is not a registry
   kind — adversarial review rejects on sight.
5. **Skipping `REF_VALUE_WIDGETS` / `suggestionPlan.isRef`**: without `refValue.ts:21` the save
   serializer treats an empty record-ref as an ordinary string and writes `'—'`/`null` into the
   payload — 422 under the server's `exactOptionalPropertyTypes`; without `suggestionPlan.ts:80`
   the tab-nav/plan machinery treats the slot as plain text.
6. **Trusting the plan's `res.errors` assertion** in Task 12: that field does not exist on
   `UISpecLoadResult` — use `validationErrors` (OQ-2). A test that vacuously passes is worse than none.

## Out-of-scope map

- `schema/workflow/*`, `protocol.ui.yaml` — untouched this wave (W4 ruling).
- `controlled-document.ui.yaml` — all 6 ref sites stay `ref` (W4-D3).
- ui.yaml files with `widget: "ref"` outside the table — stay `ref`.
- `extensions/FieldRow.tsx` — no edit (dispatch/commit path proven above); `RefCombobox.tsx`,
  `refValue.ts` behavior (only the Set literal grows).
- `app/src/shared/api/client.ts` — no new method; `listRecordsByKind` exists (`:2094`).
- RecordRegistryPage.tsx / RelatedRecordsCard / DocumentShell / provenance card — REG-1/2/4 files.
- `/tree/search`, full-text indexing, ontology grounding machinery — untouched.
- The 6 pre-existing taptab test failures and the 23 pre-existing app tsc errors — observed,
  not fixed, not regressed.
- Ports :3001/:5174/:3092/:5192 — coder never kills/restarts outside its worktree; live
  restart + curl + browser gate are orchestrator-side.

## Open questions (composer, max 3)

1. **OQ-1 — calibration-record `$.performedByRef` has no `refKind` at base**
   (`schema/lab/calibration-record.ui.yaml:50-52`). The plan converts it; without a kind the
   picker lists kind `default`. Recommended: add `refKind: "person"` (mirrors
   `qualification-record.ui.yaml:37`). Checked: plan table (binding but silent on the value),
   both calibration ui sites, the loader gate (`refKind` only validated if present,
   `UISpecLoader.ts:288-292`) — needs an orchestrator ruling, coder must not guess.
2. **OQ-2 — plan Task 12 asserts `res.errors ?? []`; the field is `validationErrors`**
   (`server/src/ui/types.ts:297-306`). Spec deviates from plan-verbatim deliberately. Checked:
   `UISpecLoadResult` definition, `load()` returns (`UISpecLoader.ts:49-88`), sibling test
   `UISpecLoader.editor.test.ts` uses `validationErrors`.
3. **OQ-3 — Task 7 test's tabNav mock export name mismatch** (`focusAdjacentTabField` vs real
   `focusAdjacentTapTabField`, `tabNavPlugin.ts:48`). Harmless on the happy path (checked:
   record-ref never invokes tab-nav), but flagged so adversarial review doesn't read the
   verbatim-kept mock as a coder error. No code change recommended.

COMPOSER DONE

## ORCHESTRATOR ADJUDICATIONS (promotion ruling, 2026-10-18 tick — BINDING for the coder)

- **OQ-1 RULED: YES — add `refKind: "person"` to calibration-record `$.performedByRef`**
  alongside the `widget: "record-ref"` conversion (schema/lab/calibration-record.ui.yaml
  :50-52), mirroring qualification-record.ui.yaml:37. Calibration is performed by a person;
  a kindless record-ref picker would list kind `default` (nothing). The coder must not
  choose a different kind.
- **OQ-2 RULED: APPROVED deviation — assert `res.validationErrors ?? []`** (plus
  `res.success`) in UISpecRecordRef.test.ts. `UISpecLoadResult` has no `errors` field
  (server/src/ui/types.ts:297-306, orchestrator-verified at c895f0f0). The plan's
  `res.errors ?? []` would vacuously pass.
- **OQ-3 NOTED — tabNav mock name mismatch stays as-is** (plan-verbatim mock kept;
  `focusAdjacentTapTabField` is the real export, orchestrator-verified at
  tabNavPlugin.ts:48). Add `focusAdjacentTapTabField: vi.fn()` to the SAME mock factory
  ONLY if a RED/GREEN run trips on it; never touch assertions.
- **Base:** REG-3 branches off trunk at claim time (>= c895f0f0). REG-3 is file-disjoint
  from the REG-2/REG-4 chain and MAY run while REG-1's browser gate is pending. Re-capture
  tsc bases on the claim SHA if trunk moved.
- Promoted by the orchestrator after first-hand spot-checks of: WidgetRenderer ref-block
  location, refValue.ts:21 Set literal, UISpecLoader VALID_WIDGET_TYPES + refKind gate,
  client.ts:2094 signature, calibration-record OQ-1 site, UISpecLoadResult shape,
  RecordRefPicker old /tree/search implementation, index.ts:21, tabNavPlugin.ts:48.
