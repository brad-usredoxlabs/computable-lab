# QMS-6E spec — repair the editor save write-back on BOTH surfaces (QMS-6B defects D3 + D5)

Lane: 1 · campaign: light-qms-records-browser · owner on dispatch: cl-senior (one worktree)
Source of truth for the defect: QMS-6B attempt 8 `VERDICT: fix`
  receipts ~/.hermes/cl/receipts/QMS-6B/2026-10-04_181022/ (report.md; api/a-save-payload-replays.txt)
Orchestrator independently re-verified the code paths below on trunk e4c76142 (this is orientation,
not authority — confirm by reading).

## Why
The mandatory QMS-6B gate cannot return `accept` while every reviewer edit is unsavable. Attempt 8's
D3 (MAJOR) breaks Save on BOTH editor surfaces; D5 (MINOR) is a stale-row render race. This is a
regression in the shipped EDITOR-2 write-back path — fixing it completes the editor platform work.

## Verified anchors (orchestrator, trunk e4c76142)
- D3a — /registry surface. `app/src/pages/RecordRegistryPage.tsx:151-178` `handleSave`:
  `:161 const docJson = editor.getJSON();` then `:167 apiClient.updateRecord(selectedRecord.recordId, serialized)`
  PUTs the RAW TipTap document as the record payload (no lifecycleId/kind/required fields merged).
  Server → **409 LIFECYCLE_IMMUTABLE** ("A controlled record cannot discard its lifecycle";
  RecordHandlers.ts:712). Receipt: api/a-save-payload-replays.txt (a).
  The CORRECT pattern already exists in the sibling panel: `serializeDocument(editor.getJSON(), baseRecord)`
  (app/src/editor/taptab/recordSerializer.ts:80) — walks fieldRow path/value pairs onto a CLONE of the
  base record and strips system provenance. The registry path must do the same, seeded with the
  selected record's own payload (so identity + lifecycleId survive).
- D3b — /record surface. `app/src/event-editor/create/RecordEditPanel.tsx:96-119` `handleSave`:
  `:105 payload = serializeDocument(editor.getJSON(), formData)`. When a ref field is EMPTY its
  fieldRow carries the widget's DISPLAY string `'—'` (em-dash; RefWidget.tsx:9 renders `{strVal || <span>—</span>}`),
  so `reviewerRef` becomes the string `'—'` → **422** `"Expected type: object"` at `/reviewerRef`.
  Receipt: api/a-save-payload-replays.txt (b). The fix is on the value path (the fieldRow node / ref
  widget must emit the true empty value — omit/null — NOT the display fallback), not a string hack.
- D5 — /registry tab switch. `RecordRegistryPage.tsx` `useEffect(..., [activeTab])` (:57-77) calls an
  inlined `refreshRecords` with NO stale-response guard, and there is a SECOND `refreshRecords`
  (:102-116) used by `handleSaved`. On a rapid tab switch a slower in-flight response can resolve
  after the newer one and render the wrong tab's rows. Receipt: report.md D5.

## Required work (RED-first)
1. D3a: make the /registry Save serialize via `serializeDocument` against the selected record's
   payload, exactly as /record does — no raw `editor.getJSON()` PUT. Keep identity/lifecycle intact.
2. D3b: fix the empty-ref value emission so an empty ref serializes to an absent/null value (schema
   wants an object), never the display em-dash. Fix at the source (the widget/fieldRow value), not by
   stripping '—' in the serializer.
3. D5: add a stale-response guard (e.g. an AbortController / request-sequence token keyed to
   `activeTab`) so a superseded fetch cannot set records; de-duplicate the two `refreshRecords`.
4. RED-first tests for each: a registry-save test proving the PUT body carries lifecycleId+identity
   (not a TipTap doc) and a ref-empty test proving no `'—'` reaches the payload; a tab-switch race test.
   Run them failing BEFORE the fix.

## Acceptance (verbatim)
- Browser (QMS-6B re-run, not this task): /registry Save on DOC-DEMO-SOP persists (reload shows the
  edit); /record Save on a doc with empty refs returns 2xx; rapid Documents<->People tab switch never
  renders stale rows.
- Unit/contract: the new RED-first tests fail pre-fix, pass post-fix; touched suites green; app tsc
  delta vs the re-measured base is zero NEW errors (the app baseline is already RED — measure it).

## Files (ownership)
app/src/pages/RecordRegistryPage.tsx; app/src/event-editor/create/RecordEditPanel.tsx; the ref
value-emission source (app/src/editor/forms/widgets/RefWidget.tsx and/or the fieldRow node builder);
their tests. NO server/ or schema/ edits (data + UI only).

## stop_boundary
Return to the architect (do NOT absorb): any fix that requires a server route/handler change, a
schema/lint/lifecycle YAML change, or a change to the editor projection RESPONSE shape; any demand to
revert the form.sections fallback or to change widget contracts. If a correct fix needs a new
declarative surface, STOP with the evidence.

## deps
QMS-6B-FIX-A (D1+D2) and QMS-6C (D2) must LAND first — the browser re-run candidate must include the
criticals. Code + RED-first tests may start in parallel; the browser proof rides the QMS-6B re-run.
