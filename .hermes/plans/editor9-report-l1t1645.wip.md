# EDITOR-9-EMPTY-OPTIONAL-SAVE — CODER REPORT (lane 1)

Worktree: /mnt/vast/home/brad/git/wt/editor-9-lane1-l1t1645
Branch:   wt/editor-9-lane1-l1t1645 (base 14637f6d, NOT rebased onto 25f74aaa per dispatch)
Final head: the report commit (branch tip; product head 0584b6f8 — `git -c core.fileMode=false log --oneline -5` shows both)
Spec: /mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-10_editor9-empty-optional-save-spec.md (md5 verified: 89cc34020a8f60acb3f72e2d1381f4b5)

## Commits (3, logical steps)

```
0584b6f8 fix(editor9): unset (null/undefined) is omitted for EVERY widget incl. composites; [] and {} stay as real values
9d1b87ba fix(editor9): one shared omission helper on the save serializer — empty optionals serialize to ABSENT
ed4ff3d0 test(editor9): RED — empty optional slots must serialize to ABSENCE on the save payload builder
14637f6d Merge branch 'wt/qms-7b-lane1-20261004T1255' into cl/integration-1   <- base
```

`git -c core.fileMode=false diff --name-only 14637f6d..HEAD`:
```
app/src/editor/taptab/recordSerializer.test.ts
app/src/editor/taptab/recordSerializer.ts
app/src/editor/taptab/refValue.ts
```
Product code ONLY. No schema/, no server/, no manifests/goldens touched (verified: no schema golden/manifest test exists in app/src that consumes serializer output; `find . -maxdepth 2 -name "*manifest*"` returns only specifications/workflow-and-datatypes-manifesto.md).

## §0 BASELINES (captured fresh at 14637f6d in THIS worktree — old lane pins NOT trusted)

### §0.0 Worktree parity precondition (non-trivial, orchestrator should know)

At dispatch the lane worktree had only 3 untracked entries (the node_modules symlinks) and was
MISSING all 123 lane-synced ignored files the trunk carries. Per the lane rule I replicated them
1:1 from the TRUNK worktree (symlinks as symlinks, dirs copied, plain files copied — never from
Brad's live tree contents). 123/123 replicated. Parity proof:

```
$ comm -3 <(trunk git status --porcelain -uall --ignored=matching|sort) <(worktree same) | grep -v '\.hermes/plans'
?? app/src/shell/settings/AiModelSection.test.tsx
?? app/src/shell/settings/AiModelSection.tsx
?? app/src/shell/settings/PolicyBundleSelector.test.tsx
PARITY-DIFF-LINES-NONPLANS: 3
```

Those 3 are untracked in trunk (QMS-8-era files present in Brad's live tree only) and absent in
the worktree; they are NOT referenced by any tracked file at 14637f6d (grep of
app/src/shell/settings/index.ts finds no import) and produce zero tsc/vitest noise — verified:
`grep -c "AiModelSection\|PolicyBundleSelector" /tmp/l1t1645-head-tsc-app2.txt` -> 0.
One dangling symlink `.env -> /mnt/vast/home/brad/git/computable-lab/.env` exists in BOTH trunk
and worktree (target does not exist in either) — identical state, no effect on vitest/tsc.

### §0.1 app vitest fail-FILE SET at base (cd app && npx vitest run)

Verbatim tail (/tmp/l1t1645-base-vitest2.txt, lines 18062-18066):
```
 Test Files  56 failed | 223 passed (279)
      Tests  63 failed | 1791 passed (1854)
     Errors  5 errors
   Start at  01:44:36
   Duration  109.56s (transform 38.58s, setup 176.75s, collect 145.01s, tests 130.35s, environment 1365.26s, prepare 140.59s)
```

Fail-SET (56 files = 19 e2e/*.spec.ts + 37 src/ files), extracted via
`grep -oE 'FAIL  src/[^ >]+'` plus the e2e FAIL rows; SET file /tmp/base-fs.txt:
e2e/ai-observability-trace.spec.ts, e2e/ai-panel-always-visible.spec.ts, e2e/deck-add-equipment.spec.ts,
e2e/deck-equipment-via-agent.spec.ts, e2e/deck-layout-regression.spec.ts, e2e/graph-search.spec.ts,
e2e/labware-editor.spec.ts, e2e/navigation.spec.ts, e2e/nav-step-tooltip.spec.ts, e2e/plate-focus-compact.spec.ts,
e2e/preview-overlay.spec.ts, e2e/record-browser.spec.ts, e2e/run-workflow.spec.ts, e2e/schemas-records.spec.ts,
e2e/session-persistence.spec.ts, e2e/settings.spec.ts, e2e/term-panel-in-modal.spec.ts,
e2e/three-pane-harness.spec.ts, e2e/vendor-pdf-review.spec.ts,
src/App.test.tsx, src/claims/ClaimWorkspace.test.tsx, src/collections/ClaimCollectionView.test.tsx,
src/editor/RawRecordEditor.test.tsx, src/editor/taptab/RefCombobox.test.tsx,
src/editor/taptab/widgets/ChipComboboxWidget.test.tsx, src/event-editor/deck/LabwareGlyph.test.tsx,
src/event-editor/deck/LawnSurface.footprint.test.tsx, src/event-editor/execution/ExecutionContext.test.tsx,
src/event-editor/focus/WellGrid.footprint.test.tsx, src/event-editor/projects/ProjectTabStrip.test.tsx,
src/event-editor/protocol-builder/ProtocolCandidatePreview.test.tsx,
src/event-editor/right-pane/ai/draftChanges.test.ts, src/event-editor/right-pane/ai/ParameterAnswerInput.test.tsx,
src/event-editor/right-pane/ai/useChatThread.deckLayout.test.tsx,
src/event-editor/right-pane/find/FindTabPanel.inventory.test.tsx, src/event-editor/right-pane/find/FindTabPanel.test.tsx,
src/event-editor/viewer/document/DocumentEditorContext.test.tsx, src/event-editor/viewer/pdf/PdfViewer.test.tsx,
src/event-editor/viewer/ViewerToolbar.test.tsx, src/extensions/ExtensionContext.test.tsx,
src/extraction/ExtractionDraftsListPage.test.tsx, src/ingestion/protocol-review/BranchQuestionsPanel.test.tsx,
src/knowledge/browser/RecordPreviewPanel.test.tsx, src/knowledge/claimProjectLink.test.ts,
src/lab/LabEntityWorkspace.test.tsx, src/literature/LiteraturePage.test.tsx,
src/protocol-ide/ProtocolIdeIntakePane.test.tsx, src/protocol-ide/ProtocolIdeShell.test.tsx,
src/protocol-ide/ProtocolIdeSourcePane.test.tsx, src/protocols/ProtocolsPage.test.tsx,
src/sequences/nativeDraft.test.ts, src/shared/context/useSurfaceContext.test.ts,
src/shared/hooks/useAiChat.surfaceContext.test.ts, src/shared/shell/activeProject.test.ts,
src/types/createLabwareFromDefinitionPayload.test.ts, src/welcome/WelcomePage.test.tsx

Debt provenance (verified, not assumed):
- The 12 lane-synced symlink tests fail with `Failed to load url ... (resolved id:
  /mnt/vast/home/brad/git/computable-lab/...)` — the known reviewer-harness symlink trap. Proven
  pre-existing by running the same 12 files IN THE TRUNK: `Test Files  12 failed (12)` with the
  identical resolution error (/tmp/l1t1645-trunk-synced.sh run, tail captured).
- e2e/*.spec.ts failures are Playwright specs vitest cannot run here (no browser env) — present at
  base and head identically.
- `Errors 5` unhandled-exception line is identical at base and head (pre-existing debt class).

### §0.2 tsc error-line MULTISETS at base (captured myself)

`cd app && npx tsc --noEmit` -> 37 lines (/tmp/l1t1645-base-tsc-app2.txt)
`cd server && npx tsc --noEmit` -> 46 lines (/tmp/l1t1645-base-tsc-server2.txt)
(Pre-replication values were 21/54 — confirming the dispatch warning that old pins drift with
lane-synced state; only the post-replication 37/46 are pinned here.)

Multiset comparison method: `sed 's/([0-9]*,[0-9]*)//' | sort` on each file, then diff.

### §0.3 FIRST TARGETED CHECK (before any patch) — serializer suites green at base

```
$ cd app && npx vitest run src/editor/taptab/recordSerializer.test.ts src/editor/taptab/refValue.test.ts src/editor/taptab/documentMapper.test.ts
 ✓ src/editor/taptab/refValue.test.ts  (5 tests) 2ms
 ✓ src/editor/taptab/recordSerializer.test.ts  (12 tests) 3ms
 ✓ src/editor/taptab/documentMapper.test.ts  (10 tests) 46ms

 Test Files  3 passed (3)
      Tests  27 passed (27)
```

## §1 SAVE-SURFACE SURVEY (mandatory first step, before patching)

Consumers of serializeDocument (the ONE payload builder on the editor save path) — all served by
the single serializer fix:

| # | Consumer | Call site | Save route |
|---|----------|-----------|-----------|
| 1 | TapTabEditor.handleUpdate | TapTabEditor.tsx:68 | onUpdate -> parent save |
| 2 | ProjectionTapTabEditor.handleUpdate | TapTabEditor.tsx:179 | onUpdate -> parent save |
| 3 | RecordRegistryPage.handleSave | RecordRegistryPage.tsx:161 | createRecord :167 / updateRecord :169 |
| 4 | RecordEditPanel | RecordEditPanel.tsx:105 | apiClient.updateRecord :116 |
| 5 | RecordCreatePanel | RecordCreatePanel.tsx:202 | apiClient.createRecord :236 |
| 6 | CreateNodeModal (knowledge browser) | CreateNodeModal.tsx:173 | apiClient.createRecord |
| 7 | BudgetDocumentSurface | BudgetDocumentSurface.tsx:78 | onUpdate -> RunBudgetTab save |

Second-builder scan (`method: 'PUT'|'POST'` sweep across app/src + createRecord/updateRecord call
inventory):
- RecordCreatePanel.tsx:205-217 has a PRE-EXISTING local top-level empty-strip loop (deletes
  top-level ''/null/undefined/[] from the serialized payload) with a comment acknowledging "the
  serializer writes EVERY field row back". Now redundant for top level (the shared helper does it,
  and nested too); left in place (not my file, harmless). CreateNodeModal has NO such loop — it
  was exposed to the defect and is fixed by the shared helper.
- DeckToolbar.handleRename (:57), DocumentEditorContext.persistBody (:121), ProtocolTabPanel
  (:1347/:1357/:1386): payloads built from the STORED record with specific keys replaced — they
  never introduce empty optionals; not the defect class.
- SectionedForm/FieldRenderer + RecordBrowser.handleSave (:265, editData PUT): a SEPARATE
  non-serializer form seam. Its widgets mostly send `undefined` on clear (NumberWidget
  `raw === '' ? undefined`, SelectWidget `e.target.value || undefined`), but TextWidget/
  TextareaWidget send `''` directly into formData. This is a second payload path OUTSIDE the
  serializer family; it is NOT the reported defect (Brad's report is the TapTab save path) and
  fixing it would be a per-surface patch outside this item's contract. FLAGGED as an open question
  for the orchestrator, not absorbed.
- Server seam: RecordHandlers.updateRecord replaces the payload wholesale (no merge with existing
  payload; verified at server/src/api/handlers/RecordHandlers.ts:631-860) — so client omission is
  the ONLY way a cleared field disappears. No second server-side serializer emitting empty
  optionals was found; no server change needed.

Conclusion: ONE shared helper in the serializer serves all 7 consumers; no second serializer
family requiring a split.

## §2 RED (written before implementation; reproduced at the RED commit)

`git checkout ed4ff3d0 && cd app && npx vitest run src/editor/taptab/recordSerializer.test.ts`:
```
 Test Files  1 failed (1)
      Tests  7 failed | 14 passed (21)
   Start at  02:13:19
   Duration  23.86s (transform 238ms, setup 2.21s, collect 139ms, tests 34ms, environment 17.73s, prepare 1.10s)
```
The 7 RED failures (verbatim assertion heads from /tmp/l1t1645-red.txt):
```
 FAIL ... > RED-1: an untouched optional (null widget value) is ABSENT from the payload
AssertionError: expected { kind: 'person', …(5) } to not have property "organizationId"   (+ Received: null)
 FAIL ... > RED-2: an untouched optional holding an empty string is ABSENT
AssertionError: expected { kind: 'person', …(5) } to not have property "organizationId"   (+ Received: "")
 FAIL ... > filled optional is PRESENT with its value (no over-omission)
AssertionError: expected { email: 'editor9@example.org', …(1) } to not have property "phone"   (+ Received: null)
 FAIL ... > RED-3: a CLEARED optional deletes the stale base-payload value (absent, not '')
AssertionError: expected { kind: 'person', …(5) } to not have property "organizationId"   (+ Received: "")
 FAIL ... > clearing one nested optional keeps its filled siblings
AssertionError: expected { email: 'keep@example.org', …(1) } to not have property "phone"   (+ Received: null)
 FAIL ... > required-but-empty is omitted from the payload (the server owns requiredness)
AssertionError: expected { displayName: '' } to not have property "displayName"
 FAIL ... > number widget: a cleared input is ABSENT, but 0 is a real value and stays
AssertionError: expected { threshold: '' } to not have property "threshold"
```
Ref-widget (QMS-6E) fence tests passed already at RED — the fences were green before and after.

## §3 GREEN (after implementation)

Targeted (9 files incl. both QMS-6E panel tests and the ref-emission boundary):
```
$ cd app && npx vitest run src/editor/taptab/recordSerializer.test.ts src/editor/taptab/refValue.test.ts src/editor/taptab/CompositeWidgets.test.tsx src/editor/taptab/DefaultEditorFixtures.test.tsx src/editor/taptab/documentMapper.test.ts src/graph/run-workspace/RunBudgetTab.test.tsx src/event-editor/create/RecordEditPanel.qms6e.test.tsx src/pages/RecordRegistryPage.qms6e.test.tsx src/editor/taptab/extensions/WidgetRenderer.refEmission.test.tsx
 Test Files  9 passed (9)
      Tests  96 passed (96)
   Start at  02:07:53
   Duration  27.25s (transform 2.90s, setup 29.52s, collect 21.26s, tests 552ms, environment 149.05s, prepare 11.40s)
```

Full app suite at head 0584b6f8 (/tmp/l1t1645-head-vitest2.txt lines 18062-18066, verbatim):
```
 Test Files  56 failed | 223 passed (279)
      Tests  63 failed | 1801 passed (1864)
     Errors  5 errors
   Start at  02:08:25
   Duration  107.97s (transform 45.56s, setup 125.01s, collect 157.36s, tests 183.53s, environment 1181.73s, prepare 141.11s)
```
Fail-SET equality (base vs head, SET diff — not bare counts):
```
$ diff /tmp/base-fs.txt /tmp/head-fs.txt && echo FAILSET-EQUAL-56
FAILSET-EQUAL-56
```
Zero NEW failing files. Tests delta: 1854 -> 1864 total (+10 new tests), failures 63 -> 63,
unhandled `Errors 5` identical at base and head.

tsc multiset equality at head vs §0.2 pins:
```
$ diff /tmp/l1t1645-tsc-app-base.norm /tmp/h1.norm && echo APP-TSC-MULTISET-EQUAL-FINAL
APP-TSC-MULTISET-EQUAL-FINAL
$ diff /tmp/l1t1645-tsc-server-base.norm /tmp/h2.norm && echo SERVER-TSC-MULTISET-EQUAL-FINAL
SERVER-TSC-MULTISET-EQUAL-FINAL
```
(app 37 lines, server 46 lines, byte-multiset equal after position normalization; server code was
never touched.)

## §4 Contract grounding at the API seam (deterministic probes, lane server :3092 — NOT the browser gate)

These prove the exact defect class and the fix's payload shape at the validation seam. Records
created are TEST DATA (Brad ruling A4).

(a) person with ONLY required fields (optionals ABSENT) -> success:
```
$ curl -s -X POST http://localhost:3092/api/records -H "content-type: application/json" -H "x-user-id: USR-BRAD" -d '{"schemaId":"...person.schema.yaml","payload":{"kind":"person","id":"PER-EDITOR9-PROBE-A","displayName":"Probe Absent Optionals","status":"active"}}'
{"success":true,"record":{"recordId":"PER-EDITOR9-PROBE-A",...
```
(b) optionals as null (what the UNFIXED serializer writes for untouched slots) -> the verbatim
field-report errors:
```
{"success":false,"validation":{"valid":false,"errors":[{"path":"/organizationId","message":"Expected type: string","keyword":"type","params":{"type":"string"}},{"path":"/contact/phone","message":"Expected type: string","keyword":"type","params":{"type":"string"}}]},"error":"Validation failed"}
```
(c) required-but-empty -> server validation error (minLength), and required-but-OMITTED ->
"Missing required property: displayName" — omission does NOT suppress requiredness:
```
{"success":false,"validation":{"valid":false,"errors":[{"path":"/displayName","message":"Must be at least 1 characters","keyword":"minLength",...
{"success":false,"validation":{"valid":false,"errors":[{"path":"/","message":"Missing required property: displayName","keyword":"required",...
```
(d) PUT replacing the payload with optionals ABSENT (what the FIXED serializer sends after a
clear) -> success, and the stored record no longer carries the previously-set optional:
```
$ curl ... -X PUT /api/records/PER-EDITOR9-PROBE-A -d '{"payload":{...no organizationId...}}'
{"success":true,...}
$ curl ... /api/records/PER-EDITOR9-PROBE-A | ...
organizationId present after clear-PUT: False
```
Note found while probing: `organizationId: ""` PASSES Ajv on PUT (an empty string is a valid
string per the schema). The defect is therefore not "'' is structurally rejected on every write"
— it is that the editor writes typed empties (null for untouched slots — probe (b) reproduces
Brad's exact error pair) and that a cleared field must disappear from the payload. The omission
contract (absence, never a typed empty) is the correct fix either way.

## §5 Per-file change rationale

1. app/src/editor/taptab/refValue.ts (+~35 lines)
   - Added `COMPOSITE_VALUE_WIDGETS` / `isCompositeValueWidget` and `isEmptyFieldValue(value,
     widget)` — THE ONE shared omission decision, living in the existing value-emission contract
     module (the spec's "extend the existing QMS-6E ref pattern" seam).
   - Semantics: null/undefined => omit for EVERY widget (TipTap fills an absent attr with the node
     default null, so an untouched array/object row carries null and would 422 "Expected type:
     array"); ref widgets keep the QMS-6E display-glyph rule ('—'/whitespace => omit); composite
     widgets keep their EMPTY container ([] / {} are user intent, not unset); scalar '' => omit;
     false and 0 are values and stay.
   - `isEmptyRefFieldValue` untouched (refValue.test.ts fences green).
2. app/src/editor/taptab/recordSerializer.ts
   - extractFieldRows now routes EVERY fieldRow through `isEmptyFieldValue` (was
     `isEmptyRefFieldValue` only): empty => `deleteValueAtPath` (omission + stale-base-value
     deletion), else `setValueAtPath` as before. One decision point, no per-kind branches.
   - `deleteValueAtPath` extended: after deleting the leaf, ancestors emptied by the deletion are
     pruned deepest-first (clearing contact.email + contact.phone removes `contact: {}` residue);
     containers that still hold values (filled siblings, fields outside the projection) are kept.
     This generalizes the QMS-6E delete behavior the spec mandates for "clear".
3. app/src/editor/taptab/recordSerializer.test.ts (+241 lines, 10 new tests)
   - The three task-block cases (untouched optional ABSENT — both null and '' variants; filled
     optional present; cleared optional ABSENT via stale-base deletion) plus boundary fences:
     required-but-empty omitted (no client-side required check fabricated), number cleared vs 0,
     false/[] kept, untouched composite (null) omitted, nested-sibling preservation, QMS-6E ref
     fences re-asserted.

## §6 Assumptions

- AS-EDITOR9-01: an untouched optional slot reaches the serializer as `null` (FieldRow attr
  default / mapper getValueAtPath), and a cleared slot as `''`. Evidence: probe (b) reproduces
  Brad's exact error pair from null values; RED-1/RED-2 cover both encodings. evidence_debt: false.
- AS-EDITOR9-02: required-but-empty is omitted client-side and the server's required/minLength
  check is the correct, desired error; no client-side requiredness check is fabricated. Proven at
  the API seam (§4c). evidence_debt: false.
- AS-EDITOR9-03: composite containers keep `[]`/`{}` (emptied list = user intent) but a never-set
  container (null) is omitted. Required to keep CompositeWidgets/DefaultEditorFixtures green and
  to stop null-into-array 422s. evidence_debt: false.
- AS-EDITOR9-04: `''` on an optional string is structurally schema-valid (PUT probe stored it) but
  is never a correct editor emission; omission is the contract. The stored-`''` behavior predates
  this item and is not re-litigated. evidence_debt: false.
- AS-EDITOR9-05: the lane worktree required replication of the 123 trunk lane-synced ignored files
  before baselines are meaningful (pre-replication tsc was 21/54 vs post 37/46). Replication was
  trunk->worktree 1:1 (symlinks as symlinks). evidence_debt: false (parity comm recorded in §0.0).
- AS-EDITOR9-06: the 12 symlink-test failures + 19 e2e failures + `Errors 5` are pre-existing lane
  debt identical at base and head (trunk re-run proof in §0.1). evidence_debt: false.

## §7 Open questions for the orchestrator

1. SectionedForm/RecordBrowser edit seam (§1 last bullet): TextWidget/TextareaWidget write `''`
   into formData and RecordBrowser PUTs it. Outside the serializer family; a fix there is a
   separate item (would need its own omission decision). Route to a field-defect ruling if Brad
   hits it in the field.
2. RecordCreatePanel's local top-level empty-strip loop (RecordCreatePanel.tsx:205-217) is now
   redundant with the shared helper. Removal is a one-file cleanup in a file I do not own — left
   untouched per scope.
3. Browser gate readiness: no YAML/schema touched, so no stack restart expected; the gate runs
   against :5192 as dispatched by the orchestrator (NOT run by me per dispatch).
4. `''` stored via direct API PUT (§4 note) is schema-legal; if the lane wants `''` rejected at
   the schema level, that is a schema change — explicitly outside this item's stop boundaries.

## §8 Commands the orchestrator can re-run

```
cd /mnt/vast/home/brad/git/wt/editor-9-lane1-l1t1645/app && npx vitest run src/editor/taptab/recordSerializer.test.ts src/editor/taptab/refValue.test.ts src/editor/taptab/CompositeWidgets.test.tsx src/editor/taptab/DefaultEditorFixtures.test.tsx src/editor/taptab/documentMapper.test.ts src/graph/run-workspace/RunBudgetTab.test.tsx src/event-editor/create/RecordEditPanel.qms6e.test.tsx src/pages/RecordRegistryPage.qms6e.test.tsx src/editor/taptab/extensions/WidgetRenderer.refEmission.test.tsx
cd /mnt/vast/home/brad/git/wt/editor-9-lane1-l1t1645/app && npx vitest run
cd /mnt/vast/home/brad/git/wt/editor-9-lane1-l1t1645/app && npx tsc --noEmit
cd /mnt/vast/home/brad/git/wt/editor-9-lane1-l1t1645/server && npx tsc --noEmit
git -c core.fileMode=false diff --name-only 14637f6d..HEAD
```
Raw evidence files: /tmp/l1t1645-red.txt, /tmp/l1t1645-base-vitest2.txt, /tmp/l1t1645-head-vitest2.txt,
/tmp/l1t1645-base-tsc-app2.txt, /tmp/l1t1645-head-tsc-app2.txt, /tmp/l1t1645-base-tsc-server2.txt,
/tmp/l1t1645-head-tsc-server2.txt, /tmp/base-fs.txt, /tmp/head-fs.txt.

EDITOR9 CODER DONE 0584b6f8
