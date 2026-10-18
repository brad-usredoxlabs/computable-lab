# REG-3 FIX1 — coder report (lane 1, l1t0400)

Worktree: /mnt/vast/home/brad/git/wt/REG-3-lane1-l1t2355
Branch:   wt/REG-3-lane1-l1t2355
Base:     125221bda28d9de83c13ad90f55b850fdc7ab22b (cl/integration-1 tip; REG-3 widget work already merged — not redone)
Commits:
  e8ceeb3084cfd449b8ec354898684227929cf767  test(registry): RED pins for browser-gate defects D1/D2/D3
  2bff278ab40c329dfc249235204edfcbde7daa3c  fix(registry): D1 datetime commit format; D2 editor mount keyed to editing subject; D3 record-ref label fallback
Gate source: /home/brad/.hermes/cl/receipts/REG-3/20261018T065824Z/report.md (D1/D2/D3 read in full, incl. trail steps 22-29 carryover probe and shots/29-C3-carryover-new-record-prefilled.png).

STATUS: D1 fixed + proven server-side; D2 fixed with root-cause mechanism proven; D3 display-fallback fixed (clipping left, see §D3). All new pins RED at base -> GREEN at head. tsc delta-ZERO. No stack restarted, no browser run, no file outside scope touched.

## 0. Checkout gate

`git -c core.fileMode=false status --porcelain | grep -c '^D'` -> 0 on first poll (no WAIT-TIMEOUT). Untracked node_modules dirs only.

## 1. Diff (base 125221bd -> head 2bff278a)

```
 app/src/editor/taptab/RecordRefPicker.display.test.tsx   |  80 +  (NEW test)
 app/src/editor/taptab/RecordRefPicker.tsx                |  25 +-  (D3 fix)
 app/src/editor/taptab/widgets/DatetimeWidget.commit.test.tsx | 85 +  (NEW test)
 app/src/editor/taptab/widgets/DatetimeWidget.tsx         |  27 +-  (D1 fix)
 app/src/pages/RecordRegistryPage.createWhileOpen.test.tsx| 281 +   (NEW test)
 app/src/pages/RecordRegistryPage.tsx                     |  16 +   (D2 fix)
 schema/lab/training-record.ui.yaml                       |   4 +-  (D1 YAML)
 server/src/validation/TrainingRecordDateTimeAcceptance.test.ts | 123 + (NEW test)
 8 files changed, 629 insertions(+), 12 deletions(-)
```

## 2. D1 — training-record create cannot be saved (422 /completedAt: Invalid format: expected date-time)

Route taken: (a) declarative-first, WITH the normalize-on-commit sub-route — because the sub-route was proven NECESSARY, not optional.

Sub-route proof (the load-bearing question the fix contract asked):
- Direct probe against the server's exact Ajv config (Ajv2020 + ajv-formats, same options as AjvValidator.ts:27-32/157-169), run in the worktree's server/node_modules:
    "2026-10-18T14:30"        -> INVALID  (format date-time)   <- what DatetimeWidget.tsx:22 commits raw
    "2026-10-18T14:30:00"     -> VALID
    "2026-10-18T14:30:00Z"    -> VALID
    "2026-10-18"              -> INVALID  (what the old widget "date" committed)
  So switching the widget to "datetime" ALONE would still 422: datetime-local has no seconds component. The widget's commit path must complete its own output.
- Pinned permanently in server/src/validation/TrainingRecordDateTimeAcceptance.test.ts against the REAL schema files via the REAL pipeline (loadAllSchemas + SchemaRegistry topological order + createValidator — the ControlledDocumentSchemas.test.ts harness pattern):
    * schema file asserted UNWEAKENED: `completedAt/expiresAt: type: string, format: date-time` regex-pinned;
    * ui.yaml asserted to declare widget "datetime" for both fields;
    * the widget-committed value "2026-10-18T14:30:00" PASSES the real AjvValidator;
    * both bare legacy shapes ("YYYY-MM-DD", "YYYY-MM-DDTHH:mm") are REJECTED with keyword=format path=/completedAt — the normalization is load-bearing and nothing was relaxed.

Fixes:
- schema/lab/training-record.ui.yaml: completedAt and expiresAt widget "date" -> "datetime" (only YAML file touched; see §7 restart trigger). "datetime" is already in server VALID_WIDGET_TYPES (UISpecLoader.ts:21) and WidgetRenderer.tsx:230 already dispatches it to DatetimeWidget — no server code change needed.
- app/src/editor/taptab/widgets/DatetimeWidget.tsx: added normalizeDateTimeCommit — appends ":00" ONLY when the committed string is exactly the datetime-local shape `YYYY-MM-DDTHH:mm`; applied ONLY on the widget's commit paths (blur + Enter) and ONLY when widget === 'datetime'. A `date` widget still commits bare "YYYY-MM-DD" (unchanged). Values that already carry seconds/fraction/offset (e.g. stored "2026-10-03T15:10:13.995Z") pass through untouched. No page-side normalization, no schema change, no validator change.

RED evidence (fixes stashed, final test files at base):
- /home/brad/.hermes/cl/lanes/1/reg3fix1-red-app-consolidated-l1t0400.txt: DatetimeWidget.commit.test 2 failed (commit was '2026-10-18T14:30', expected '...:00') | 2 pass-through pins pass.
- /home/brad/.hermes/cl/lanes/1/reg3fix1-red-server-consolidated-l1t0400.txt: 1 failed (ui.yaml declares 'date', expected 'datetime') | 4 pass (the Ajv accept/reject facts hold at base — they are the mechanism proof).
GREEN: /home/brad/.hermes/cl/lanes/1/reg3fix1-green-server-l1t0400.txt — 5/5 pass. Server suite `npx vitest run src/validation` at head: 5 files / 47 tests ALL pass (reg3fix1 evidence in report dir; raw shown in §5).

## 3. D2 — Create while a record is open carries the open record's values

Root cause (found in the real dependency source, not papered):
@tiptap/react v3 useEditor(options, deps = []) -> EditorInstanceManager.onRender (node_modules/@tiptap/react/dist/index.cjs:473-511): with `deps.length === 0` the manager NEVER recreates the instance when options change — it calls `editor.setOptions(...)`, and Editor.setOptions (@tiptap/core dist:5050-5062) merges options and calls `view.updateState(this.state)`: the EXISTING ProseMirror doc — every fieldRow's attrs.value — is REUSED. The new `content` (built from the seed base) is stored but never applied. RecordRegistryPage mounted ProjectionTapTabEditor with no identity key, so flipping edit->create kept TRR-DEMO-1's doc; handleSave then ran serializeDocument(oldDoc, seedBase), re-applying the open record's id/personRef/completedAt over the seed — the gate's "New Record shows TRR-DEMO-1" and "a Save would write to the open record".

Fix (minimal, 16 lines, page-side only — no shared editor machinery touched, no requires-rescope):
- RecordRegistryPage.tsx: `editorSubjectKey = \`${editorMode}:${selectedRecord.recordId || payload.id}\`` and `key={editorSubjectKey}` on the ProjectionTapTabEditor mount. The key changes ONLY when the editing SUBJECT changes (different record, or edit<->create flip); editing the same record keeps the same key, so legitimate editor state is never lost to a blanket remount. (Create carries recordId='' so the seeded payload.id is the identity.)

RED evidence (fixes stashed, final test file at base):
- /home/brad/.hermes/cl/lanes/1/reg3fix1-red-d2-l1t0400.txt and reg3fix1-red-app-consolidated: pin (i) FAILS at base — create-while-open renders ID field 'TRR-DEMO-1' (expected /^TRR-NEW-/) and carries personRef/completedAt; pin (ii) FAILS at base — the create POST body carries id 'TRR-DEMO-1' + the open record's personRef/completedAt (expected the new seeded id, fields absent). Pin (iii) (Cancel issues no updateRecord/createRecord) passes at base and at head.
- The mock models tiptap's verified semantics (doc built from `data` at MOUNT, REUSED across re-renders on a `data` change; only a remount rebuilds it) — documented in the test header. Real-browser confirmation is the orchestrator's re-gate.
GREEN: 3/3 pass (reg3fix1-green-app-l1t0400.txt).

Abandon-flush attribution (honest): the gate observed TRR-DEMO-1 re-committed on disk after navigating away from the carryover form. I searched the registry surface for a flush-on-leave writer (beforeunload/pagehide/autosave/flush in RecordRegistryPage, DocumentShell, OpenTabsContext, DocumentControlBar, SlideOverEditor, RecordHostPage): the ONLY updateRecord call sites on this surface are handleSave (Save button), DocumentControlBar.commitTransition (explicit lifecycle transition), SlideOverEditor.save — none fires on tab leave. No client-side writer could be attributed to the observed re-commit; the D2 pin asserts no updateRecord/createRecord on abandon. With the subject key, even a hypothetical flush path would flush the NEW record's own doc, never the previously open record's. Flag for the re-gate to re-check the disk state after abandon.

## 4. D3 — record-ref display fallback (constrained scope)

Fixed: RecordRefPicker now prefills the input with the label the LOADED candidate list knows when the stored ref carries only an id (or a stored label): after the single kind-scoped `listRecordsByKind(refKind, 200)` fetch resolves, a match on recordId/label seeds the query — only while the user has not typed (typedRef guard; a typed query is never overwritten). No extra fetch per open, no invented label data, no hardcoded strings. The read view keeps its deterministic id display when no label is known (formatWidgetDisplayValue, WidgetRenderer.tsx:34-53 — untouched).
RED: both pins fail at base (input prefilled 'PER-1'/'PER-2' instead of the known labels). GREEN: 2/2.

Dropdown clipping in the narrow pane: LEFT AS-IS, as scoped. The label span already has flex+ellipsis (taptab.css .record-ref-picker__label); the clipping is pane-width layout, not a one-line CSS token change. Fixing it properly means layout work outside the constrained scope.

## 5. Test evidence (real command output)

Canonical command `npx vitest run --root app src/editor/taptab src/pages/RecordRegistryPage src/components/registry`:
- RED at base (fixed files reverted to 125221bd, new tests present): Test Files 9 failed | 21 passed (30); Tests 12 failed | 238 passed (250) — 6 debt + 6 new-pin failures. Raw: reg3fix1-red-targeted-l1t0400.txt.
- HEAD: Test Files 6 failed | 24 passed (30); Tests 6 failed | 244 passed (250). Raw: reg3fix1-green-targeted-l1t0400.txt.
- App-directory run (normal convention, from app/): base 12 failed | 251 passed (263) [reg3fix1-red-appsuites-l1t0400.txt] -> head 6 failed | 257 passed (263) [reg3fix1-green-suites-l1t0400.txt].
- Zero-new proof (comm of sorted FAIL-file lists, base vs head): the ONLY differences are the 3 new pin files, present ONLY at base:
    comm -3 -> src/editor/taptab/RecordRefPicker.display.test.tsx
              src/editor/taptab/widgets/DatetimeWidget.commit.test.tsx
              src/pages/RecordRegistryPage.createWhileOpen.test.tsx
  The 6 pre-existing debt failures remain, unfixed and unreduced: documentMapper x2, RefCombobox x2, ChipComboboxWidget x2.
- Harness artifact (documented, NOT mine): under `--root app` the 3 styling suites (RecordRegistryPage.styling, DocumentControlBar.styling, RelatedRecordsCard.styling) suite-LOAD-fail with ENOENT because they read files via process.cwd() which resolves to the worktree root, not app/. Identical at base AND head under that command (both show the same 3 ENOENT FAILs); run from app/ they pass 3/3 (13 tests).
- Server: new test 5/5 GREEN; `npx vitest run src/validation` 5 files / 47 tests all pass; `src/ui` at head 2 failed | 187 passed (189) — the 2 EditorSuggestionService failures are PRE-EXISTING, proven by re-running with all my changes stashed: identical 2 failed | 140 passed (142) at base. My server diff is ONLY the new test file (git diff --stat -- server: 1 file, +123).
- Adjacent suites importing the touched page: AiTabPanel.recordDraft.retarget 6/6 pass; RegistryHostPage.test has 1 failure ("drops the hand-rolled viewport-height root") — proven pre-existing by re-running with RecordRegistryPage.tsx reverted to 125221bd: identical failure at base.

## 6. tsc (delta-ZERO against own base capture)

- Base capture (taken BEFORE any edit, at 125221bd): /home/brad/.hermes/cl/lanes/1/tsc-reg3fix1-base-l1t0400.txt — 23 raw `error TS` lines.
- Head: /home/brad/.hermes/cl/lanes/1/tsc-reg3fix1-head-app-l1t0400.txt — 23 lines; `diff base head` -> IDENTICAL (delta-ZERO). (One transient new error — unused `screen` import in my own new test file — was removed before the final capture.)
- Server head: /home/brad/.hermes/cl/lanes/1/tsc-reg3fix1-head-server-l1t0400.txt — 0 errors (server tsconfig excludes test files; the new test file is vitest-run and LSP-clean).

## 7. YAML touched — ORCHESTRATOR RESTART TRIGGER

- schema/lab/training-record.ui.yaml (completedAt: date->datetime; expiresAt: date->datetime).
- tsx --watch does NOT reload YAML (spec cache is boot-loaded): the orchestrator MUST restart the lane-1 stack after merge before the re-gate, then re-verify via the live editor-draft curl / browser gate. I did not restart anything.

## 8. Assumptions (values I supplied that no source provided)

- AS-L1T0400-REG3FIX1-01: seconds completion ":00" for the datetime-local commit. datetime-local carries no seconds; appending ":00" preserves the user's wall-clock reading. Converting to a UTC-offset form was rejected: it would fabricate an offset the user never chose. Ajv2020 accepts the completed form (proven §2).
- AS-L1T0400-REG3FIX1-02: D2 key shape `${editorMode}:${recordId || payload.id}` — the payload.id fallback for create (recordId is '') is my choice; both components come from existing page state.
- AS-L1T0400-REG3FIX1-03: D3 prefill applies only until the user types (typedRef) — my choice, to avoid clobbering an in-progress filter.
- AS-L1T0400-REG3FIX1-04: the D2 test mock models tiptap mount semantics (doc built at mount, reused on data change, rebuilt only on remount) per the verified dist source; browser-level behavior is the orchestrator's re-gate, not my mock.
- AS-L1T0400-REG3FIX1-05: the gate's abandon-flush disk re-commit could not be attributed to any registry-surface writer in code (§3); the pin asserts no write on abandon; flagged for re-gate re-check.

## 9. Out-of-scope observations (NOT fixed, flagged)

- Same-class latent D1 defects exist in sibling kinds: calibration-record.ui.yaml (:31,:35), competency-authorization.ui.yaml (:47,:51), qualification-record.ui.yaml (:52,:56), training-material.ui.yaml (:51) all declare widget "date" against schemas whose fields require format: date-time. Same 422 class on those create legs. Outside this task's defect list and the REG-3 conversion table — orchestrator should schedule a follow-up (the D1 widget-commit normalization already makes the "datetime" route safe for them).
- The 6 debt failures, the 23 pre-existing app tsc errors, the 2 EditorSuggestionService failures, the RegistryHostPage styling failure, and the `--root app` styling-suite ENOENT artifact: observed, not regressed, not mine.

## 10. Handoff for the re-gate

Merge 2bff278a -> restart lane-1 stack (YAML!) -> browser re-gate should now see: Create (Training tab, with or without an open record) -> blank New Record with TRR-NEW-xxxx id; Completed At renders a datetime-local control; Save POSTs a payload whose completedAt is "YYYY-MM-DDTHH:mm:00" and whose id is the seeded TRR-NEW id; abandon issues no write; Person picker prefills the known label.

REG3-FIX1 DONE 2bff278ab40c329dfc249235204edfcbde7daa3c
