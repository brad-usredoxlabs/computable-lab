# W2-8-FIX2 REPORT — SAID/MEANT surface: MEANT draft editability + upload-leg validation repair
Lane 2 coder, worktree /mnt/vast/home/brad/git/wt/W2-8-fix2-lane2-l2t1340, branch W2-8-fix2-lane2-l2t1340 (off lane trunk 6c4d98c0 = W2-8 merge).
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-10_0630-W2-8-said-meant-surface-spec.md (md5 eb9fa8a8), §10 criteria read first.
Task-list note: 'GATE INVALID + REAL DEFECT 2026-10-10T13:40' (W2-8 block).

## §0 FRESH BASELINES (captured in THIS worktree at claim base)

- app tsc: `npm run typecheck` -> 34 error lines (/tmp/l2t1340-tsc-app-final.txt); normalized (strip (line,col), sort) SET-EQUAL to /tmp/l2t2230-tsc-app.txt pin. Verified again post-all-edits: `TSC APP SET-EQUAL (34)`.
- server tsc: `npx tsc --noEmit` -> 26 error lines (/tmp/l2t1340-tsc-server-final.txt); normalized SET-EQUAL to /tmp/l2t0415-tsc-server.txt pin: `TSC SERVER SET-EQUAL (26)`.
- app unit fail-file SET at claim base (cd app && npx vitest run from package dir): 35 files (/tmp/l2t1340-app-unit-base-failfiles.txt). Final full-suite run post-changes: 35 files (/tmp/l2t1340-app-unit-final-failfiles.txt); `comm -3` empty -> SET-EQUAL, ZERO NEW failing files.
- server scoped fail-SET vs /tmp/l2t2310-w25-baseline-failfiles.txt (11): all 11 still failing (unchanged debt), ZERO of my touched server test files failing. Scoped re-run of src/schema/ + src/ui/: 3 failing files — EventGraphEquipmentSchema.test.ts and LabwarePhysicalGeometryData.test.ts are baseline members; EditorSuggestionService.test.ts proven PRE-EXISTING via `git stash push` of all my server changes -> still 2 failed tests on pristine HEAD, popped back. (Full server suite at this lane state shows 107 failing files — pre-existing lane debt, not introduced here; the scoped 11-file baseline is the contract and it holds.)
- MANIFEST: `git hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` = 58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35 — byte-untouched. vendor-pdf.schema.yaml is NOT in the spine6 MANIFEST treeState/fixtures/records lists -> no golden coverage, no collision.
- lintRules: private backend boot log "Lint rules loaded: 81" — unchanged.
- Lane parity: lane-exclude entries replicated from TRUNK worktree (config.yaml copy, .env symlink, server/schema symlink — retargeted to `../schema` so MY schema edits are the ones the server loads, .run copy). node_modules symlinks untouched, never staged.

## RED (A3 failure reproduced at claim base)

Canonical command: `cd app && BASE_URL=http://localhost:5193 API_URL=http://localhost:3093 npx playwright test e2e/w28-said-meant-surface.spec.mjs --project=chromium`

Tail (reproduced twice — first run at claim base, then a stash-restored pristine gate spec re-run for a clean receipt):

```
[A3] ... 24 × locator resolved to <button disabled type="button" class="semantic-draft__save" data-testid="semantic-draft-save">Save draft</button>
     - unexpected value "disabled"
> 285 | await expect(save, 'an edit must dirty the Save button').toBeEnabled({ timeout: 10000 })
1 failed
  [chromium] ... A3: a MEANT edit saves atomically, survives reload, and provenance survives byte-equal
1 did not run   (A5)
4 passed
```

Screenshot receipt: /home/brad/.hermes/cl/receipts/W2-8-SAID-MEANT-SURFACE/l2t1340-red-a3-save-disabled.png

## GREEN (full spec 6/6)

Private stack serving MY worktree code (backend :3094 with CL_DATA_DIR=/home/brad/.computable-lab-l2t1340 private data copy + CONFIG_PATH copy with dataDir/port retargeted; vite :5195 with VITE_API_PROXY=:3094). Private data copy was RESET (gate seeds git-removed + sqlite index cleared) so the spec re-seeded VPDF+XDR through the REAL product upload path:

```
[seed] VPDF-5256F3288E3C + XDR-w28-gate0001 present (fixture sha 5256f3288e3c)
  ✓  1 PRECHECK: stack health + seeded records (75ms)
  ✓  2 A4+A6: wave-2 render — all branches visible, no literal completion, no extraction-time questions (4.2s)
  ✓  3 A2: semantic-evidence chip jumps the SAID pane to [data-vpdf-page=2] (2.3s)
[A1] VPDF sha before=e66d1868e7c4b3c1ba1f522f661126e7b775dd35 after=e66d1868e7c4b3c1ba1f522f661126e7b775dd35
  ✓  4 A1: the SAID is immutable — probing every left-pane control leaves the VPDF sha unchanged (4.2s)
[A3] GET /records/XDR-w28-gate0001 title before/after: W2-8 gate — semantic family draft EDITED -> W2-8 gate — semantic family draft EDITED EDITED
[A3] GET /records/XDR-w28-gate0001/revisions -> ["REV-0A8ACF632DC2D511C8616649DF382F5C","REV-29744E45291818E8BF327EC0AF2BAB78","REV-74AB9D2D3145A5AE146F980619B4520E","REV-7542775E6BC82F9D5C007236D3E94D1E"]
  ✓  5 A3: a MEANT edit saves atomically, survives reload, and provenance survives byte-equal (6.0s)
[A5] branch_axes on XDR-w28-gate0001 [{"axisId":"lysis-method","label":"Which lysis method?","conditions":[{"id":"bead-beater",...},{"id":"freeze-thaw",...}]}]
  ✓  6 A5 (data precondition): the family questions ride the XDR verbatim for the realization entry (28ms)
6 passed (19.6s)
```

Canonical shared-trunk stack (BASE_URL=:5193 API_URL=:3093, orchestrator's exact command) with the fixed gate spec: `6 passed (22.8s)` — same 6 legs, A3 and A5 included. (The shared stack serves trunk code; it proves the gate spec is valid and idempotent, not my code fixes — those are proven on the private stack + unit layer.)

Product-correct seed proof (private stack, after reset, record created by the real upload leg):
```
VPDF-5256F3288E3C source keys: ['engine','ingestedAt','pageCount']   has url: False
file keys: ['file_name','media_type','sha256','size_bytes','stored_path']  sha256: 5256f3288e3c6a3b...
XDR draft keys after save: ['branch_axes','kind','recordId','steps','title']  junk: []
```

Targeted unit tails (GREEN):
```
✓ src/api/handlers/VendorSearchHandlers.phase9.test.ts  (10 tests)
✓ src/schema/VendorPdfSourceSchema.test.ts  (4 tests)
Test Files 5 passed (5)   Tests 58 passed (58)   [+ UiReadonlySpellingProjection, EditorProjectionService, EditorProjectionFallback]
✓ src/editor/taptab/FieldRowEditability.test.tsx  (3 tests)
Test Files 3 passed (3)   Tests 38 passed (38)   [+ recordSerializer, DefaultEditorFixtures]
```

## Clause -> proof walkthrough vs spec §10 (verbatim criteria)

1. "SAID unmutable via any UI path incl. overrides/save" -> A1 leg: sha e66d1868... identical before/after probing every left-pane control; left pane exposes 0 editable controls. Unit: FieldRowEditability test 3 (wildcard hint slots never serialize).
2. "anchor navigation works from semantic evidence" -> A2 leg: chip click scrolls [data-vpdf-page="2"] into viewport (poll true).
3. "edits survive reload with provenance intact" -> A3 leg (rewritten to the product's real edit path): click Title value -> inline input -> fill -> Enter -> Save dirties -> note says 'Saved' -> hard reload shows edited value -> GET XDR: title persisted, intent.provenance byte-equal, source_artifact + target_kind unchanged, contentSha moved, >=1 revision captured. NEW hardening: no-junk-key assertions (no `[*]` keys minted, no new keys added to the draft).
4. "family shows all branches, no extraction-time questions" -> A4+A6 leg: Lyse samples / variant a / variant b visible; branch-axes data rendered; zero extraction-time question testids.
5. "realization entry shows questions persisting to local-protocol" -> A5 leg (NOT weakened): branch_axes verbatim on XDR (axisId lysis-method, conditions bead-beater/freeze-thaw). The full realization-entry receipt (run workspace -> localization -> accept -> LPR branch_resolution) remains the reviewer's manual leg per spec §6.2 step 6 / spec header note — unchanged posture.
6. "no visible action produces a literal-step protocol" -> A6 leg: zero vpdf-save / save-as / use-extracted / saveas-modal / tree-select testids on the route.

## D1 — diagnosis and fix (BLOCKER, A3)

GATE INVALID component: the checked-in A3 typed into the outer ProseMirror doc. The TapTab document model has NO text positions: fieldRow is an `atom: true` NodeView (extensions/FieldRow.tsx), section content is `sectionHeading fieldRow+`, CustomDocument is `section+` (documentMapper.ts). Typing can NEVER mutate that doc — the leg could not pass even against a perfect product. Headless probes (app/scratch/w28-d1-probe.mjs, w28-d1-probe2.mjs) proved the PRODUCT's real edit path already works on trunk: click `.taptab-widget-value` -> inline input -> commit -> updateAttributes -> onUpdate -> dirty -> Save -> survives reload -> revision + provenance byte-equal. The interactive FieldRow widget IS the same one BudgetDocumentSurface/registry surfaces use; the editor-draft projection already emits editable slots. No bespoke contenteditable hack was needed or added.

REAL DEFECT component (two declarative-path bugs the probes exposed):
a) readonly spelling mismatch: ui-v1.schema.yaml and every *.ui.yaml spell `readonly:`; server FieldHint type + EditorProjectionService read only `readOnly` -> read-only Intent/Provenance hint sections projected as EDITABLE slots (rendered as live junk inputs on the MEANT editor). Fix at the declarative consumption point: server/src/ui/types.ts adds `readonly?: boolean` (mirrors app uiSpec.ts which already accepts it); EditorProjectionService.projectSlotsFromFormSections honors `field.readOnly ?? field.readonly ?? false`. RED->GREEN test: server/src/ui/UiReadonlySpellingProjection.test.ts (YAML `readonly:` must survive into slot.readOnly through the real loader+projection).
b) serializer junk pollution: wildcard display-hint paths ($.steps[*].intent.provenance) were serialized back, minting literal `steps[*]` keys and `version: null` / `roles: null` into candidates[0].draft (verified first-hand on the shared trunk data repo after a trunk-stack save). Fix: app/src/editor/taptab/recordSerializer.ts — wildcard segments (`[*]`) are display hints, not addressable fields, and are never serialized; an untouched/absent field never mints a new null key (baseRecord threaded through extractFieldRows; clearing an EXISTING value still writes). INDEXED paths ($.lines[0].description — the budget surface's pre-existing convention) stay untouched. RED->GREEN test: app/src/editor/taptab/FieldRowEditability.test.tsx (3 legs: click-to-edit fires onUpdate with new value + dirty=true; save round-trips the edit; wildcard hint slots never serialize).
Gate spec A3 rewritten to drive the product's click-to-edit path (with a comment recording WHY outer-doc typing is architecturally impossible), plus the no-junk-key GET assertions, plus idempotent-safe title selection for re-runs.

## D2 — vendor-pdf upload-leg validation (MEDIUM)

Schema-conditional rationale: source.url is the provenance of the exa URL-ingest path. A local upload-by-content has no url — its provenance truth is the content-addressed file (file.sha256 + stored_path). A flat `source.required: [engine, url, ingestedAt]` rejected every honest content upload (handler omitted url -> store.create 'Validation failed' -> warn -> 200 hid it). Fix is data-side in schema/lab/vendor-pdf.schema.yaml: source.required is now [engine, ingestedAt]; a top-level allOf conditional requires url ONLY when the record does not carry a content-addressed file block:
```yaml
- if:
    not:
      type: object
      required: [ file ]
      properties: { file: { type: object, required: [ sha256 ] } }
  then:
    properties: { source: { type: object, required: [ url ] } }
```
Precedent cite: existing conditional-JSON-Schema usage in this repo's schema/ tree — schema/core/datatypes/quantity.schema.yaml and provenance-rung-ref.schema.yaml (if/then/allOf). `type: object` annotations on the nested subschemas are required by the server's Ajv strictTypes (discovered as a 500 on the private stack; the contract test now runs strict:true to mirror the server runtime so this class of error is caught by tests, not by a live upload).
Keep-every-existing-valid: a record with url passes (if-branch: no file -> url required -> satisfied); a content upload with file.sha256 passes (if-branch false -> url waived); a record with NEITHER url nor file.sha256 has no traceable provenance and stays REJECTED. Contract test server/src/schema/VendorPdfSourceSchema.test.ts (4 legs, strict:true, real SchemaLoader+registry topological order): content-upload without source.url VALIDATES; URL-ingest without url still REJECTED; url-ingest valid; file-without-sha256-and-no-url rejected.
Handler honesty (VendorSearchHandlers.ts, response-shape only — NO fabricated url): GraphLemurPdfIngestResponse gains `recordWriteError?: string`, set when the durable record create fails even though artifact bytes were written; the gate spec's seeding leg throws on it. The artifact write is kept (content-addressed retry reuses the same id). phase9 test extended: upload-without-url now produces recordedArtifact + no recordWriteError (schema fix makes the create land), and a stub-store failing create surfaces recordWriteError.
Lane data note honored: the shared trunk data repo's VPDF-5256F3288E3C (placeholder source.url) and its junk-keyed XDR are TEST DATA and were left untouched; the private-stack reseed proved the upload leg recreates the record product-correctly (no url, file.sha256 present).

## D3 — pdfjs same-canvas errors: FIXED (with evidence)

Root cause (bounded, within VendorPdfReviewPage's existing render-cancellation discipline): renderPage registered its RenderTask only AFTER `await pdfDoc.getPage()`. Two concurrent calls for the same page (StrictMode double-run + scale re-trigger) both saw `previous === undefined`, both called page.render() on the same canvas -> 'Cannot use the same canvas during multiple render() operations'. Fix: a synchronous per-page claim (renderChains ref) — the second caller claims the page in the same tick, waits for the previous chain, re-checks supersession after getPage, and the existing pdfRenderCancellation task-cancel discipline then applies to a task that actually exists. No renderer restructuring.
A/B evidence (app/scratch/w28-d3-ab-probe.mjs, identical probe on both stacks, 2 canvases rendered, 2 rounds of left-pane control clicks):
```
TRUNK 5193: canvases=2 sameCanvasErrors=14 badReqs=404 /api/protocol-ide/intake/review/...
FIXED 5195: canvases=2 sameCanvasErrors=0 badReqs=same pre-existing 404
```
(The /api/protocol-ide/intake/review/:id 404 appears on BOTH stacks — pre-existing, out of scope.)

## diff --name-only (tracked modifications)

```
app/e2e/w28-said-meant-surface.spec.mjs
app/src/editor/taptab/recordSerializer.ts
app/src/ingestion/VendorPdfReviewPage.tsx
schema/lab/vendor-pdf.schema.yaml
server/src/api/handlers/VendorSearchHandlers.phase9.test.ts
server/src/api/handlers/VendorSearchHandlers.ts
server/src/ui/EditorProjectionService.ts
server/src/ui/types.ts
```
New test files (committed): app/src/editor/taptab/FieldRowEditability.test.tsx, server/src/schema/VendorPdfSourceSchema.test.ts, server/src/ui/UiReadonlySpellingProjection.test.ts.
Scratch probes (app/scratch/w28-d1-probe.mjs, w28-d1-probe2.mjs, w28-d3-canvas-probe.mjs, w28-d3-ab-probe.mjs) and app/receipts/ are NOT committed. DebugRender.test.tsx was a temporary debug helper and was deleted.

## Golden-collision STOP note

NONE. vendor-pdf.schema.yaml is not golden-covered (spine6 MANIFEST lists scientist-intent vocabulary/schema/compile-pipeline + fixtures/records only). MANIFEST.yaml blob 58c447eb verified byte-untouched. lintRules 81 unchanged.

## Residuals / notes for orchestrator

1. The shared trunk data repo's XDR-w28-gate0001 carries junk keys (version:null, roles:null, steps[*]) minted by a PRE-FIX trunk save, and its title is now '... EDITED EDITED' from gate re-runs. Both are test data in the lane data repo; per instructions they were not 'fixed'. After this fix merges, trunk saves no longer mint junk (serializer skips wildcard hints); existing junk keys are preserved as untouched data. A data-repo cleanup is a data decision, not a code one.
2. The private verification stack (:3094/:5195, private data copy /home/brad/.computable-lab-l2t1340, config copy /tmp/l2t1340-config.yaml) was stopped after the final runs; the shared lane stack (:3093/:5193) was never restarted or killed.
3. A5's full realization-entry receipt remains the reviewer's manual leg (spec §6.2 step 6); the spec's A5 data-precondition leg ran and passed unweakened on both stacks.
4. Pre-existing 404: GET /api/protocol-ide/intake/review/:vpdfId on both stacks — outside this item's scope, flagged for bookkeeping.
