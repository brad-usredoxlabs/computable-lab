# SPEC DRAFT — QMS7-5: Discoverable Create per tab + reliable registry save; remove dead CSV chrome (D3)

Composer: cl-spec-composer, 2026-10-16T14:28Z (l1t0855). Draft — pending orchestrator review; NOT canonical until promoted.
Campaign: QMS registry unification wave 3. Trunk `cl/integration-1` @ **703b0572** (all path:line cites below measured against this sha in /mnt/vast/home/brad/git/cl-integration-1).
Intake: ~/.hermes/specs/intake/2026-10-15_qms-registry-unification-wave3/wave3-append-blocks.md (Brad-approved "as is"). Task block: /home/brad/.hermes/cl/lanes/1/task-list.md:4298-4324.

## Goal (one sentence)

Give every registry tab a discoverable Create button that opens the exact governed draft path EDITOR-9 shipped (editor-draft projection + serializeDocument base seeding, no hardcoded kind→schema map), pin the save/draft-copy behaviors with tests, and delete the dead CsvImportModal chrome — so Create is exercisable per AC 1:1 with the task's verified-by.

## Scope

### Files in scope (ownership — the diff must stay inside these)
- `app/src/pages/RecordRegistryPage.tsx` (509 lines @ 703b0572 — the page: tabs :17-27, create machinery :169-186, save :219-252, draft-copy :265-295, combobox wiring :352-369, dead CSV mount :497-506)
- `app/src/components/registry/CsvImportModal.tsx` — DELETE (see OQ-1; product-code import verified to be only RecordRegistryPage.tsx:3)
- `app/src/pages/RecordRegistryPage.test.tsx` — remove the CsvImportModal vi.mock (:114-117); add save-failure-keeps-content pin if not already pinned
- `app/src/pages/RecordRegistryPage.createSearch.test.tsx` — remove vi.mock (:128)
- `app/src/pages/RecordRegistryPage.qms6e.test.tsx` — remove vi.mock (:87-89)
- `app/src/shared/shell/RegistryHostPage.test.tsx` — remove vi.mock (:175-177) ONLY (this is the mount-owner test of RecordRegistryPage; deleting the mocked module forces this one-line-scope touch — flagged in OQ-1)
- NEW `app/src/pages/RecordRegistryPage.createTab.test.tsx` — the RED-first affordance suite (design below)

### Explicitly OUT of scope
- `app/src/lib/csvParser.ts` — KEEP: `SampleBindingPanel.tsx` (app/src/graph/BindingMode/) also imports `parseCsv` (verified by grep @ 703b0572). Only CsvImportModal.tsx dies. A real CSV import is NOT in scope.
- `app/src/components/registry/RecordSearchCombobox.tsx` — no edit; create-from-search keeps its current onSelect contract (:187-193 forwards the precompile payload; page consumes at :358-367). Regression pin: the 5 existing tests in RecordRegistryPage.createSearch.test.tsx must stay green.
- `app/src/components/registry/DocumentControlBar.tsx`, `SlideOverEditor.tsx`, `SignOffReceipt.tsx`, `RelatedRecordsCard.tsx` — no edits.
- Server, schema YAML, ui YAML, lint YAML, lifecycles: ZERO. No declarative surface changes are needed (verified below; if any turn out needed mid-implementation that is the platform-gap stop-boundary — STOP, return requires-rescope, do not absorb).
- The lane stack (:3092/:5192): the coder does NOT restart it (no YAML touched; vite serves the trunk worktree). Brad's :3001/:5174 stack — never touch.

## Acceptance criteria — verbatim verified-by, mapped 1:1 to exercisable states

Task verified-by (task-list.md:4317-4323, verbatim):
> RED component tests for the missing affordance first. At tip: from EACH tab Create opens a projected draft without needing a failed search; save creates a governed draft record (state from stamping), visible in the list after save; invalid payload errors actionably without losing entered content; editing EQC-QUANTSTUDIO5 + Save SUCCEEDS (promotion), survives reload, code repo git status stays clean; approved/effective records offer draft-copy not in-place save; no CSV modal in DOM. cl-browser-reviewer VERDICT: accept.

| AC | Clause | Component-test state | Browser-gate state (:5192) |
|----|--------|----------------------|-----------------------------|
| AC-1 | RED tests first | `RecordRegistryPage.createTab.test.tsx` fails at base (no Create button exists — verified: no Create affordance in RecordRegistryPage.tsx @ 703b0572; the ONLY create path is the combobox at :352-369) | n/a |
| AC-2 | EACH tab Create opens a projected draft, no failed-search prerequisite | For each of the 9 tab ids in REGISTRY_TABS (:17-27): switch tab, click Create (multi-kind tabs: pick kind from the picker), assert `getEditorDraftProjection` was called with that kind's schema `$id` (never `''`) and the editor renders | Per tab: click Create → editor shows projected sections (e.g. People: Identity/Organization/Contact/Notes — live probe below shows the projection is real) |
| AC-3 | Save creates a governed draft (state from stamping), visible in list | After Create + a field edit (dirty) + Save: `createRecord(schemaId, body)` called once; body carries `kind` + suggested `id` (serializeDocument base-clone mechanism, EDITOR-9 fix-2, RecordRegistryPage.tsx:169-186/:228-242); `refreshRecords` re-lists | Save a People draft with a unique id → row appears in the left list without reload; GET the record on :3092 shows `lifecycleId: registry-ops`, `state: draft` (QMS7-3 stamp-at-create, server/src/api/handlers/RecordHandlers.ts:568-595, coverage in schema/registry/registry-kinds.registry.yaml — verified: kinds person/equipment/equipment-class/training-record/competency-authorization/instrument/calibration-record) |
| AC-4 | Invalid payload errors actionably, entered content survives | Mock `createRecord` to reject with `{message}`: assert the error text renders verbatim AND `selectedRecord`/editor stay mounted with the typed values (current catch at :247-251 sets error without clearing selection — pin it so a refactor can't regress it) | Force a 422 (e.g. id violating the schema pattern): error visible, editor content intact, Cancel still exits cleanly |
| AC-5 | Editing a promoted plain-kind record + Save SUCCEEDS (promotion), survives reload, code repo clean | (browser-only) | ORCHESTRATOR CORRECTION (20261016T1045, first-hand): EQC-QUANTSTUDIO5 is now `state: archived` (QMS7-4 LG7 left it terminal-archived — AS-ORCH-L1-119), so an in-place save on it now correctly returns 409 CONTROLLED_RECORD_LOCKED — that is NOT a QMS7-5 defect. NEW PINNED TARGET: **EQP-QUANTSTUDIO5** (verified live: `state: active`, `lifecycleId: registry-ops`, covered kind). Open Equipment tab → EQP-QUANTSTUDIO5 → edit a field → Save (PUT path :241) → 200 → reload → edit persisted. Code repo `git -C /mnt/vast/home/brad/git/cl-integration-1 status --porcelain -uno` stays clean (no record writes leak). Bonus negative lap (recorded, not a criterion): attempting Save on archived EQC-QUANTSTUDIO5 surfaces the 409 message and offers draft-copy — proves the archive guard reads through the registry surface. |
| AC-6 | Approved/effective offer draft-copy, NEVER in-place save | VERIFICATION ONLY — already shipped: `contentLocked` :265-268 (state approved/effective), Save replaced by "Create draft revision" :414-421, handler :270-295, existing pin RecordRegistryPage.test.tsx:503 ("Create draft revision replaces Save when locked…"). Do not rewrite; keep the test green | Open DOC-DEMO-SOP once approved-state is displayed (or any approved record): only "Create draft revision" renders, no Save |
| AC-7 | No CSV modal in DOM; dead chrome deleted | Component test asserts no CsvImportModal mock/module reachable; suites pass with the vi.mocks removed | `/registry` DOM contains no csv-import-modal node (it never opened today — state `csvModalOpen` :43 is set false at :499/:503 and NEVER set true: no trigger exists. Dead chrome confirmed, Brad ruling: cut) |
| AC-8 | cl-browser-reviewer VERDICT: accept | n/a | Orchestrator runs the full gate (flow below) on :5192 after merge |

## Design (Brad-ruling-bound)

### Create button + kind picker
- One Create button on the list panel (next to the tab strip / combobox, :337-369 region). It uses the ACTIVE tab — "Create button per registry tab" satisfied by the per-tab affordance, matching how the combobox is per-tab today.
- Kind source is the tab's `kinds` DATA only (REGISTRY_TABS :17-27). NO kind→schema map, NO new literals:
  - Single-kind tab (people, instruments, verbs, capabilities, documents): click → Create for `kinds[0]`.
  - Multi-kind tab (equipment, training, authorizations, calibrations): click → a small popover/menu listing `activeTabConfig.kinds` (:318), default selection = FIRST kind, mirroring the existing primary-kind logic at :320-325 (`kinds[0]` drives activeTabSchemaId). Choosing a kind resolves its schema exactly like :324-325: `schemaNodes.find(n => n.kind === chosenKind)?.schemaId` — schemaNodes already come from GET /schemas + deriveSchemaNode (:65-84, browser/SchemaTree.tsx:39). Registry coverage verified live: all 13 tab kinds resolve to a registered schema via /api/schemas (196 entries on :3092).
- Clicking Create calls the EXISTING `handleCreateRecord(schemaId, seedPayload)` (:169) — the identical governed path as create-from-search (:358-367). Nothing persists until Save (this is already the EDITOR-9 contract: the draft projection endpoint POST /ui/schema/:schemaId/editor-draft is read-only — server/src/api/routes.ts:340, UIHandlers.ts:343-389 projects an empty payload, `recordId: '__draft__'`, display-only provenance). Cancel (:254-260) leaves no record. Save failure keeps the edited draft and surfaces the server message verbatim (:247-248 — pin, don't rewrite).

### The one genuinely new sub-problem: id seeding (verified constraint)
The create base MUST carry `kind` and `id` — EDITOR-9 fix-2 shipped exactly that for web results (precompile payload carries them; :169-186 comment block). But the Create button has no precompile step, and the server REJECTS a payload without an id: RecordHandlers.ts:524-530 `payload must contain recordId or id field` (400). The draft projection's id slot is `readOnly: true` (live probe below), so serializeDocument would drop a null id (app/src/editor/taptab/recordSerializer.ts:110 skips readOnly nulls) → 400.

Declared-data answer (no hardcoded map): every registry kind's schema declares its id regex — verified first-hand on :3092 `GET /api/schemas/:id` returns the full schema, `properties.id.pattern`: person `^PER-…`, equipment `^EQP-…`, equipment-class `^EQC-…`, training-material `^TRM-…`, training-record `^TRR-…`, competency-authorization `^AUTH-…`, equipment-training-requirement `^ETR-…`, instrument `^INSTR-…`, calibration-record `^CAL-…`, verb-definition `^VERB-…`, equipment-capability `^ECP-…` (all `^[PREFIX]-[A-Z0-9][A-Z0-9_-]*$`). The page fetches `apiClient.getSchema(schemaId)` (client.ts:2050) and derives the prefix from the literal `^([A-Z]+)-` anchor of the declared pattern; the seed id is `PREFIX + '-NEW-' + <uppercase alphanumeric suffix>` (schema-compliant by construction). This follows the repo's precedent direction (server mints ids from declared prefixes, server/src/execution/*.ts nextRecordId) while keeping the app honest:
- If the schema lacks `properties.id.pattern` or the prefix is not parseable → show an actionable error ("no id pattern declared for this schema") and do NOT open the editor. NEVER fabricate a prefix literal (hard boundary — CLAUDE.md "The Hard Boundary"). Existing app precedents NOT to copy: RecordCreatePanel's `ID_PREFIXES` hardcoded map (event-editor/create/RecordCreatePanel.tsx:64-74), CreateNodeModal's prefix table.

Known parity note (NOT a regression, deliberate): the seeded id renders readOnly in the editor (ui.yaml `readonly: true` on `$.id` — e.g. schema/lab/person.ui.yaml:14-17, equipment-class.ui.yaml:14-17). Same as today's web-created records, whose precompile id is also uneditable. See OQ-2.

### CSV chrome removal
- RecordRegistryPage.tsx: delete import :3, state :43, mount :497-506.
- Delete `app/src/components/registry/CsvImportModal.tsx` — its only product-code import site is RecordRegistryPage.tsx:3 (grep @ 703b0572; remaining references are `vi.mock` strings in the 4 test files listed in scope). vi.mock with a factory does not require the module to exist ONLY if nothing imports the path; vitest still resolves the mocked path — the mock lines must be deleted with the file (they are in the ownership list above). lib/csvParser.ts + its test stay (SampleBindingPanel uses parseCsv).
- App tsconfig has `noUnusedLocals`/`noUnusedParameters` ON (app/tsconfig.json:20-21) — the post-deletion file must have zero unused imports (refreshRecords stays used by :116-121 etc.).

## First targeted check (proves the approach early, single command)

After writing the RED suite ONLY (before implementation):
```
cd /mnt/vast/home/brad/git/cl-integration-1/app && npx vitest run src/pages/RecordRegistryPage.createTab.test.tsx
```
Expected at base: FAIL — no element with role button / name `/create/i` exists in the list panel (verified absent @ 703b0572), while the existing suites still pass. If it fails for any other reason (mock wiring, async), fix the test before touching product code.

## Verification commands (complete, with expected outputs)

All run from `/mnt/vast/home/brad/git/cl-integration-1/app` with the existing node_modules (do NOT `pnpm install --frozen-lockfile` — known lockfile drift, task-list header).

1. Touched suites (GREEN gate):
```
npx vitest run src/pages/RecordRegistryPage.test.tsx src/pages/RecordRegistryPage.createSearch.test.tsx src/pages/RecordRegistryPage.qms6e.test.tsx src/pages/RecordRegistryPage.createTab.test.tsx src/shared/shell/RegistryHostPage.test.tsx src/components/registry
```
Expected: 8 test files passed; **63 pre-existing tests** (measured at 703b0572: 7 files/63 pass: RecordRegistryPage.test 17, createSearch 5, qms6e 2, RegistryHostPage 6, DocumentControlBar 14, SignOffReceipt 7, SlideOverEditor 12) **plus** the new createTab tests, 0 failures. (Note: running these files with a cold jsdom cache can spuriously fail all 7 in one batched run — I reproduced this; re-running individually passes. Not a code issue.)
2. Typecheck (lane baseline, NOT exit-0):
```
npx tsc --noEmit 2>&1 | grep -c 'error TS'
```
Expected: **23** (pre-existing event-editor baseline, measured at 703b0572), and:
```
npx tsc --noEmit 2>&1 | grep -cE 'RecordRegistryPage|components/registry'
```
Expected: **0** — zero errors in touched files. Any NEW error type = defect; do not "fix" pre-existing ones.
3. Code-repo cleanliness after any live probing the coder does:
```
git -C /mnt/vast/home/brad/git/cl-integration-1 status --porcelain -uno
```
Expected: empty (node_modules noise is untracked -uno-invisible; record writes must never appear).
4. Live sanity (no restart needed; verified live by composer):
```
curl -s -H 'content-type: application/json' -X POST 'http://localhost:3092/api/ui/schema/https%3A%2F%2Fcomputable-lab.com%2Fschema%2Fcomputable-lab%2Fequipment-class.schema.yaml/editor-draft' -d '{}'
```
Expected 200 with `recordId:"__draft__"`, slots incl. `slot-_id readOnly=true` and required `$.name` (this is the exact response the Create editor will render). Note the content-type header is REQUIRED (415 without it) — relevant for reviewer curl traces.

## RED-first test design (RecordRegistryPage.createTab.test.tsx)

Follow RecordRegistryPage.createSearch.test.tsx's harness conventions verbatim (vi.mock apiClient with getSchemas returning real-shaped `$id`+path pairs; ProjectionTapTabEditor forwardRef stand-in capturing `data`/`onUpdate`/`getEditor`). New pins:
1. Each of the 9 tab labels renders a Create button when schemaNodes are loaded (RED at base).
2. People tab: click Create → `getEditorDraftProjection` called with the PERSON `$id`, never `''`; editor mounts; base payload passed to the editor carries `kind:'person'` and an `id` matching the mocked person id-pattern derived from the mocked `getSchema` response.
3. Equipment tab (multi-kind): click Create → kind picker shows exactly `['equipment','equipment-class']` (from kinds data — assert the mock's list, no third kind, no literal); default = 'equipment'; choosing 'equipment-class' and confirming → draft projection requested with the EQUIPMENT-CLASS `$id`.
4. Schema without a parseable id pattern → actionable error, no editor, `createRecord` never called.
5. Save path reuse: after Create + `onUpdate(payload, true)` + Save → `createRecord` body carries kind + seeded id (base-clone mechanism must not regress).
6. Save rejection keeps the draft: `createRecord` rejects `{ message: '…' }` → message rendered, editor + entered values still present, Cancel exits to the empty pane.
7. No CsvImportModal: the module is deleted — assert via the removed vi.mocks compiling and the page rendering `csv-import-modal` testid nowhere (`queryByTestId` null).

## Worker contract

- Branch: `wt/QMS7-5-lane1-l1t<ts>` off `cl/integration-1` tip (>= 703b0572), worktree `/mnt/vast/home/brad/git/wt/QMS7-5-lane1-l1t<ts>` (node_modules symlinked per fleet convention). Orchestrator dispatches; fleet coder lock.
- Deliverable: commit(s) on the branch + report `/home/brad/.hermes/cl/lanes/1/qms7-5-report-l1t<ts>.md` + handoff under `.hermes/plans/handoffs/`. End line: `QMS7-5 DONE <sha>`.
- Commit discipline: RED test file lands first (or same commit clearly labeled RED-first per the createSearch.test.tsx precedent of calling the inversion out). CSV deletion may be its own commit.
- Never mark done; orchestrator merges + runs the browser gate.
- Tests are RED-first (rule 5, CLAUDE.md). No hardcoded policy in TS. Declarative surfaces untouched (any YAML demand = platform-gap stop: return requires-rescope).

## Browser-gate flow (orchestrator → cl-browser-reviewer on :5192, after merge + trunk restart-free serve)

Targets: LANE stack only — frontend http://localhost:5192, backend :3092 (data dir /home/brad/.computable-lab-lane1). NEVER :5174/:3001. Reviewer reliability rule applies: every negative claim (absent CSV node, "not found") re-verified via reload/API before reporting; screenshots after network settle.

1. Open /registry (shell-hosted from QMS7-1). Assert no `csv-import-modal` node anywhere in the DOM (AC-7), zero console errors.
2. For EACH of the 9 tabs: click tab → click Create (multi-kind: equipment/training/authorizations/calibrations — open picker, confirm the listed kinds equal the tab's kinds, default first). Editor renders the projected draft (sections/fields per the draft projection; no failed-search prerequisite). Cancel. Nothing new in the list, nothing on the server (AC-2).
3. People tab: Create → fill Display Name + Status + a unique id-adjacent marker if editing allowed → Save. Row appears in the list WITHOUT reload (AC-3). Then `GET :3092/api/records/<id>` shows `lifecycleId: registry-ops`, `state: draft` (stamping).
4. Negative save: Create on any tab, set the id to an invalid value IF editable in the projection, otherwise trigger a 4xx by duplicate-id save of an existing id → error surfaces the server message verbatim, editor content survives, then Cancel → list unchanged (AC-4).
5. Promotion lap (AC-5, ORCH-CORRECTED target): Equipment tab → EQP-QUANTSTUDIO5 (state active, verified live) → edit `notes` (or manufacturer) → Save SUCCEEDS (PUT 200) → hard reload :5192 → reopen → edit persisted. `git -C /mnt/vast/home/brad/git/cl-integration-1 status --porcelain -uno` → empty. Bonus negative lap (record evidence, NOT a pass/fail criterion): open archived EQC-QUANTSTUDIO5 → Save attempt surfaces the server's 409 CONTROLLED_RECORD_LOCKED message and draft-copy remains offered — correct archive-guard behavior, not a defect.
6. Draft-copy lap (AC-6): open an approved/effective record (e.g. advance DOC-DEMO-SOP per the cheatsheet if not already approved in the lane) → header shows ONLY "Create draft revision" (no Save); clicking it opens the NEW draft with the honest note; in-place save is not offered.
7. Sweep: no other DELETE/CSV affordance appeared anywhere on /registry.

## Reviewer bait (edge errors likely for THIS item — pre-empt them in the diff and the report)

1. **Hardcoded kind→schema or prefix map.** The reviewer will grep the diff for `'person'`, `'equipment'`-style literals in new code. Allowed literals: none for schema ids, none for id prefixes. Kind names may only flow through from REGISTRY_TABS `kinds` / schemaNodes. The id-prefix derivation MUST parse the schema-declared `properties.id.pattern`; a `PREFIX_MAP` fallback table = instant fix-verdict (CLAUDE.md hard boundary; RecordCreatePanel.tsx:64-74 is the anti-pattern).
2. **Empty optional save regression.** The EDITOR-9 contract (empty optionals serialize to ABSENCE, not `''`/null — createSearch.test.tsx:280-286) must not regress when the Create path seeds a base. The new base is `{kind, id}` only; do not pre-fill any other key.
3. **The id slot is readOnly** (projection live-probe: `slot-_id readOnly=true`). If the coder "fixes" this by making ids editable client-side or by dropping readOnly, that contradicts the ui YAML and is a stop-boundary violation — see OQ-2. The correct answer: seed, render read-only, parity with web-create.
4. **YAML-reload trap**: none for the coder (no YAML edits). For the orchestrator: if ANY future promote adds YAML, tsx --watch does not reload it — restart :3092 before trusting.
5. **exactOptionalPropertyTypes**: ON in **server** only (server/tsconfig.json:13; app/tsconfig.json does not set it — app is strict + noUnusedLocals/noUnusedParameters:20-21). App-side new state/props: keep optional props genuinely optional (conditional spread, client.ts style). No server files in scope — any server change is scope creep, reject.
6. **Ontology terms**: the kind picker labels are the ontology kind strings themselves (`equipment-class`, not "Equipment Class"); no invented display vocab. Tab labels stay as declared (:17-27).
7. **CSV half-death**: leaving CsvImportModal.tsx imported anywhere, or leaving a `vi.mock('../components/registry/CsvImportModal')` line that vitest resolves against a deleted file, or deleting lib/csvParser.ts (still used by SampleBindingPanel) — all are review-blockers.
8. **Draft-copy regression**: the approved/effective Save replacement (:414-421) and the draft-revision note (:437-441, test :503) already ship. If a refactor turns Save back on for locked records, RED.
9. **Stale-list trap**: post-save refresh must go through the single `refreshRecords` with the seq-token (:95-114, QMS-6E D5) — no bespoke list mutation after create.
10. **Nothing-persists-before-Save**: the reviewer will assert a Create→Cancel lap leaves the list and GET /records/by-kind unchanged; the editor-draft endpoint is read-only by construction (UIHandlers.ts:343-389) — do not add any client-side pre-POST.

## OQs (open questions — with recommendations)

- **OQ-1 (CsvImportModal.tsx deletion)**: RECOMMEND full deletion of `app/src/components/registry/CsvImportModal.tsx` + removal of the 4 vi.mock lines (incl. the one-line touch to `app/src/shared/shell/RegistryHostPage.test.tsx`, which is the registry page's shell-mount test and thus legitimately within "components/registry + their tests" in spirit). Verified @ 703b0572: the only product-code import is RecordRegistryPage.tsx:3; `lib/csvParser.ts` is shared with SampleBindingPanel and stays. If the orchestrator prefers to keep RegistryHostPage.test.tsx strictly untouched, fallback = leave the component file unmounted (dead-code defect persists — not recommended; dead chrome is a defect).
- **OQ-2 (readOnly id slot on Create)**: the seeded id is not user-editable because the ui YAML declares `$.id` readonly (person.ui.yaml:14-17 et al.). Recommendation: ACCEPT parity with EDITOR-9 web-create (id comes from the seed, display read-only); an editable-id affordance is a declarative-surface change (ui YAML) → Brad/architect ruling, not this item. Checked: projection live-probe (:3092 editor-draft), ui YAMLs, serializer readOnly semantics (recordSerializer.ts:110).
- **OQ-3 (id-suggestion location)**: recommendation is client-side derivation from the schema-declared `properties.id.pattern` (GET /schemas/:id — client.ts:2050, response shape verified live: `{id, path, schema, …}`). Alternative = a new generic server "next suggested id" endpoint; that is a server-side new surface outside this item's file list and the QMS7-4 coder currently holds the fleet lock for server work. If the adversarial review rejects client-side pattern parsing as fragile, route to architect as a platform follow-on (pattern `^[A-Z]+-[A-Z0-9][A-Z0-9_-]*$` is uniform across all 13 registry kinds — verified per-kind above; instrument/qualification-record/controlled-document also carry their patterns).

## Assumptions (stated, low risk)

- DISPATCH-GATE NOTE: at my recon time QMS7-1's final session-fix re-gate and QMS7-4 were still live per handoff 2026-10-16_lane1-tick-20261016T0845; QMS7-2/QMS7-3 are DONE and their user-visible machinery is proven live (EQC-QUANTSTUDIO5 promoted copy; registry-ops stamping verified in RecordHandlers.ts:568-595 + the lane's QMS7-3 live-gate probe record EQC-LIVEGATE-QMS73). If the orchestrator dispatches before QMS7-1 is marked done, AC-2/AC-3 browser laps may trip the session-PUT defect instead of QMS7-5's own code — treat any 4xx on the session tab PUT as a QMS7-1 signal, not a QMS7-5 fix.
- Verb-definition and equipment-capability kinds are NOT in the registry-ops coverage file (schema/registry/registry-kinds.registry.yaml lists 7 kinds); creates on Verbs/Capabilities tabs therefore land WITHOUT lifecycle stamping (existing server behavior, RecordHandlers.ts:566-568: undeclared kinds unchanged). AC-3's "state from stamping" is verified on a covered kind (person or equipment-class); Verbs/Capabilities laps assert only create-succeeds + visible-in-list.
- Authorizations-tab kinds (competency-authorization IS covered; equipment-training-requirement is NOT) — same rule: one covered kind is sufficient for the stamping assertion.

## ORCHESTRATOR REVIEW + RULINGS (20261016T1050, tick l1t1000) — SPEC PROMOTED

Anchors re-verified first-hand at tip c892847d (>= 703b0572; no diff touched
RecordRegistryPage.tsx or components/registry since measurement — git log clean):
handleCreateRecord :169, CsvImportModal import :3 / state :43 / mount :497,
deriveSchemaNode :12/:73, create-from-search :363 all present at cited lines.
CsvImportModal product-code import sites: RecordRegistryPage.tsx:3 ONLY (other 4
references are vi.mock strings in tests) — first-hand grep at tip. lib/csvParser.ts
retention (SampleBindingPanel uses parseCsv) verified first-hand. /api/schemas count
196 and person id pattern `^PER-[A-Z0-9][A-Z0-9_-]*$` re-verified live on :3092.

OQ RULINGS:
- OQ-1: FULL DELETION APPROVED (component file + all 4 vi.mock lines incl. the
  RegistryHostPage.test.tsx touch). Dead chrome is a defect; the fallback leaves it.
- OQ-2: PARITY ACCEPTED — seeded id renders read-only per the ui YAML. No client-side
  readOnly override; editable-id affordance is a declarative-surface change, out of scope.
- OQ-3: CLIENT-SIDE pattern derivation ACCEPTED (schema-declared properties.id.pattern,
  parse the ^PREFIX- anchor; no parseable pattern -> actionable error, editor NOT opened,
  createRecord never called). A server suggest-id endpoint is a platform follow-on, not
  this item.
- Assumptions block ACCEPTED as written (verbs/capabilities uncovered: create-succeeds +
  visible-in-list only, no stamping assertion).
- AC-5 CORRECTED (see table + browser-flow step 5): EQC-QUANTSTUDIO5 is ARCHIVED as of
  QMS7-4 LG7 (terminal by design, AS-ORCH-L1-119) — pinned save target is EQP-QUANTSTUDIO5
  (verified live active/registry-ops). Archived-EQC 409 lap is recorded evidence, not a
  criterion.
- Dispatch-gate note: QMS7-1/2/3 are all DONE (orchestrator-marked) — the session-defect
  caveat is stale; any session-PUT 4xx at gate time IS a defect signal.

DISPATCH: coder takes tip c892847d+; worktree /mnt/vast/home/brad/git/wt/QMS7-5-lane1-l1t<ts>;
report /home/brad/.hermes/cl/lanes/1/qms7-5-report-l1t<ts>.md; end line "QMS7-5 DONE <sha>".
