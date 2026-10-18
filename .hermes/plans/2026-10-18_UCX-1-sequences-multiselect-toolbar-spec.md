# UCX-1 SPEC DRAFT — Sequences surface: multi-select toolbar over the result list
Date: 2026-10-18 · Composer: cl-spec-composer (lane 2) · Trunk verified: cl/integration-2 @ e68a6271
Status: DRAFT for orchestrator review — not canonical, not dispatched.

## GOAL
Give the Sequences Library list a multi-select toolbar (per-row checkboxes, select-all/clear, count) whose only batch action is the page's already-existing `save_collection` operation, driven by ONE selection model that the existing Analysis-tab checkbox fieldset and the chat context both read — zero new operations, zero new server surface.

## WHY (short)
Brad's north-star workstate flow needs batch curation on this surface; the universal-chat-panel plan named it as its core unshipped gap. Merged-main re-ground (2026-10-17) and this composer's re-ground at trunk e68a6271 both confirm: ZERO multi-select affordances exist on the Library list. The save_collection member-selection machinery already exists inline (Analysis tab) and is exactly what the toolbar should reuse.

## SCOPE

IN SCOPE (app-only):
- `app/src/sequences/SequencesPage.tsx` — selection state, Library toolbar + per-row checkboxes, aiContext exposure.
- `app/src/sequences/SequencesPage.css` — toolbar/row chrome.
- `app/src/sequences/SequencesPage.multiSelect.test.tsx` — NEW unit test file (RED-first).
- `app/e2e/sequences-multiselect.spec.ts` — NEW playwright spec for the :5193 gate.

EXPLICITLY OUT OF SCOPE:
- Any server change (no server/src, no schema/*.yaml edits — see OQ2 for why agent-action target kinds stay out).
- `app/src/sequences/applyAgentAction.ts` and its test — no new target kind this item.
- The Analysis-tab collection fieldset's BEHAVIOUR (it keeps working; it shares the state, see DESIGN).
- New operations (no delete/export/tag/run-on-selection — none exist today; inventing one is a rule violation).
- The FASTA-import batch path (:81) — creation-driven, not selection-driven; untouched.

## CURRENT STATE (verified first-hand at e68a6271; scout not used — all reads direct)

1. Selection state on SequencesPage:
   - Single-record focus: `selected` string, `selectRecord(id)` (SequencesPage.tsx:21, :73). Editor focus only — NOT a multi-select.
   - Collection members: `const [collectionName,setCollectionName]=useState('')` and `const [members,setMembers]=useState<string[]>([])` (SequencesPage.tsx:29). This is the ONLY existing multi-record selection state on the page.
   - The task-list's claim is VERIFIED: the only checkbox UI is the Analysis-tab fieldset at **SequencesPage.tsx:103** — `<fieldset><legend>Reference / alignment collection</legend>… {byKind('sequence').map(r=><label …><input type="checkbox" checked={members.includes(r.recordId)} …/>…}<button disabled={busy||!collectionName||!members.length} onClick={()=>fire({operation:'save_collection',label:collectionName,members:members.map(id=>recordRef(id))})}>Save collection</button></fieldset>`. Row source: `byKind('sequence')` (:37).
   - The "result list" the title means is the **Library navPane** at SequencesPage.tsx:134: rows are plain `<button>` elements filtered to `['sequence','oligo-spec']`, query-filtered by `query` (:21), clicking calls `open(r)` → `selectRecord` (:73-74, switches to Editor tab). NO checkboxes, NO testids anywhere in SequencesPage.tsx (grep `data-testid` = 0 hits).

2. Exact save-collection payload the page builds today (the equivalence target):
   - Click handler (:103): `fire({operation:'save_collection', label:collectionName, members: members.map(id=>recordRef(id))})`.
   - `fire`→`act` (:67-72): posts `sequenceApi('/actions', { requestId: requestId(), ...action })` → POST `/sequences/actions`.
   - `recordRef(id)` (api.ts:18) = `{kind:'record', id, type:'sequence'}`; `requestId()` (api.ts:14-17) = 24 hex chars.
   - Wire body, in key order: `{ operation:'save_collection', requestId:<hex24>, label:<string>, members:[{kind:'record',id:<id>,type:'sequence'},…] }`.
   - Server contract: `schema/bio/sequence-action.schema.yaml:127-146` — required `[operation, requestId, label, members]`, `additionalProperties:false`, members `minItems:1, uniqueItems:true`, requestId pattern `^[A-Za-z0-9_-]{1,100}$`.
   - Server executor: `server/src/sequences/SequenceService.ts:103-107` — `save_collection` **pins every member with type allow-list `['sequence']`** (`this.pin(ref,['sequence'])` at :104) and saves a `sequence-collection` record (id prefix SEQSET). ⇒ an oligo-spec member FAILS server-side. This is the eligibility gate the toolbar must mirror (see OQ1).

3. Other existing per-record actions on the page — honest enumeration:
   - `save_interval` (:82) operates on the single editor-focused record + typed region — per-record, not list-batchable, needs start/end.
   - `save_sequence`/`save_collection` in the FASTA import (:81) — creation-driven batch, no selection involved.
   - Library rows (:134) only OPEN records. Editor (`SequenceEditor.tsx`) is single-record.
   - Conclusion: **`save_collection` is the ONLY existing action that consumes a multi-record selection.** The toolbar scopes to exactly that one action. No second button.

4. Agent-action path on this surface:
   - Server emits `agent_action` frames (AgentOrchestrator.ts:2941); target kinds are declared in `schema/workflow/agent-action.schema.yaml:44,52` — ONLY `sequence-tab` and `sequence-record` exist (plus protocol-step/record/ontology in `server/src/ai/compileWorkspaceAction.ts:199-232`). There is **no batch/selection target kind today**; the composer verified the schema and compiler directly.
   - App-side: `SequencesPage.tsx:42-54` wires `createSequencesAgentActionHandler` (applyAgentAction.ts:76-142 pure decision, :167-197 mount adapter). Single-record select goes through the page's own `selectRecord`, canLeave guard inherited; selectability gated by registry `selectableKinds` (schema/registry/surfaces/surfaces.yaml:96: `[sequence, sequence_interval, oligo-spec]`).
   - Chat-initiated operations on sequences today ride the **proposal path**, not agent_action: `onSequenceProposal` (SequencesPage.tsx:55-59) → structured-action YAML → Accept-and-apply (:133) → same `act()` path. So a chat-directed save_collection ALREADY lands on the same wire call the toolbar will use.
   - **deckLabwares precedent (SH-QC-1 lineage, test-file attribution says SH-QB-1 OQ1 — noted honestly):** `AiTabPanel.tsx:631-637` reads the LIVE editor deck state at send time and passes it as an additive, conditional body key `deckLabwares` (client.ts:4146, :4159 — key ABSENT when empty, never `undefined`; test `client.intentCompileDeck.test.ts:47-74`). The precedent's lesson for UCX-1: the agent/chat path must read the SAME live selection state at send time — never a parallel copy, never a stale snapshot — and expose it as an additive context key.

5. Existing multi-select UI patterns to reuse:
   - Closest list pattern: `app/src/graph-search/GraphSearchPage.tsx:46,96-103` — `selectedIds: Set<string>`, `toggleSelect(id)` immutably rebuilding the Set, checkbox column in `GraphSearchTable.tsx:12,43`, selection-dependent action bar at GraphSearchPage.tsx:168-200. Same conceptual shape; it dispatches selection INTO the chat as a SurfaceContext rather than acting directly.
   - In-page pattern to mirror exactly: the :103 checkbox fieldset (array membership `members.includes(id)`, toggle via spread/filter).
   - Declarative button source: the page's `contract` (GET /sequences/contract, sequenceRoutes.ts:21) carries `schema` (the full sequence-action oneOf) and `capabilities.engines` — the Analysis tab already derives operation dropdowns from it (:96,:78). BUT nothing in ANY existing data (contract, surfaces.yaml, ui.yaml) declares "which operations apply to a multi-record selection"; surfaces.yaml's sequences entry has only `objectTypes/selectableKinds/tabs` (surfaces.yaml:92-98, schema additionalProperties:false at surfaces.schema.yaml:26). **State it plainly: no declarative source for button definitions exists.** Since exactly ONE batch action is verified to exist, a single hardcoded button is the honest floor (matching the single hardcoded Save-collection button already at :103). Minimal future data shape, if a second batch action ever lands: a `selectionActions: [save_collection]` array on the surfaces.yaml sequences entry + surfaces.schema.yaml property + a compat test — DO NOT build that indirection now (speculative generalization; rule: build the capability when the second instance exists).

6. Test file homes (verified names):
   - No `SequencesPage.test.tsx` exists. App unit tests in app/src/sequences: `applyAgentAction.test.ts` (19 tests, green), `SequenceSearch.test.tsx`, `SequenceEditor.test.tsx` (2), `SequenceImport.test.tsx` (7), `nativeDraft.test.ts`.
   - Sequences e2e: `app/e2e/ingestion-sequences.spec.ts`, `sequence-chat-scroll.spec.ts`, `sequences-harness-chat.spec.ts` (testid conventions: `harness-chat-pane`, `surface-focus-header`).

## DESIGN

Selection model (one model, two surfaces):
- Promote the EXISTING `members: string[]` state (SequencesPage.tsx:29) to the page's single collection-selection model. The Library toolbar checkboxes and the Analysis-tab fieldset checkboxes BOTH read/write `members`. This is the literal form of "chat-directed batch operation targets the same selection model": there is exactly one, and the Analysis fieldset's payload construction (:103) is untouched — so payload equivalence is true by construction, and the unit pin proves it anyway.
- Per-row checkbox in the Library for every row whose `payload.kind === 'sequence'` (mirrors the fieldset's existing row source `byKind('sequence')`, :103; server pins members to `sequence` at SequenceService.ts:104 — oligo rows render WITHOUT a checkbox, and the toolbar count can never contain a non-pinnable member). Oligo rows keep their open-on-click behaviour untouched.
- Row structure: the current row IS a `<button>` (:134). Do NOT nest an `<input>` inside a `<button>` (invalid HTML, click-through re-renders the editor). Restructure the row to a wrapper `<div className="sequence-library__row">` containing the checkbox and the existing open button as siblings. Checkbox gets `data-testid={`sequence-check-${recordId}`}` and `aria-label={`Select ${label}`}`; a click on the checkbox must NOT trigger `open()` (sibling layout makes this structural, no stopPropagation tricks).

Toolbar (directly above the row list inside the Library navPane, always rendered):
- `<div data-testid="sequence-selection-toolbar">` containing:
  - Select-all button `data-testid="sequence-select-all"` — selects the currently VISIBLE (query-filtered), checkbox-eligible row ids (adds to current selection; idempotent).
  - Clear button `data-testid="sequence-clear-selection"` — `setMembers([])` (also clears the Analysis fieldset — same model, that is the point).
  - Count `<span role="status" data-testid="sequence-selection-count">{members.length} selected</span>`.
  - Collection name input `aria-label="New collection name"` bound to the EXISTING `collectionName` state.
  - Save button `data-testid="sequence-toolbar-save-collection"`, `disabled={busy||!collectionName||!members.length}`, onClick EXACTLY the :103 handler: `fire({operation:'save_collection',label:collectionName,members:members.map(id=>recordRef(id))})`. On success (fire→act already refreshes), clear the selection: wrap so `setChecked`… precisely — the toolbar's onClick is `void act({operation:'save_collection',label:collectionName,members:members.map(id=>recordRef(id))}).then(()=>setMembers([])).catch(()=>{})` (act() returns the data and refreshes, :67-71; failed action keeps the selection). The :103 fieldset button keeps using `fire` exactly as today (behaviour freeze).
- Declarative ruling: one button, because exactly one verified batch operation exists. No new data file, no DSL (see CURRENT STATE item 5 for the recorded absence and the minimal future shape).

Agent-action cooperation (deckLabwares mirror):
- aiContext (:61): add `collectionSelection: members` to the `surfaceContext` object (live-read via the existing useMemo deps — add `members` to the dep array). Name it `collectionSelection`: the key `selection` is TAKEN by `selection:inputs` (the analysis inputs map) — overwriting it is a silent regression (reviewer bait).
- Do NOT touch applyAgentAction.ts, agent-action.schema.yaml, or the compiler: no batch target kind exists and minting one is a schema+compiler+orchestrator change (OQ2). A chat-directed batch save_collection already reaches the page through the proposal path (:55-59 → :133 Accept → act()) and hits the identical wire payload; the aiContext key is what lets the model propose the CURRENT selection instead of guessing ids.

## EXACT EDITS per file

1. `app/src/sequences/SequencesPage.tsx`
   - :29 — none (reuse `collectionName`/`members` states as-is).
   - :61 — add `collectionSelection:members` to surfaceContext; add `members` to the useMemo dep array (:61 tail).
   - :134 — split the navPane rows into `row wrapper (div.sequence-library__row) + checkbox (sequence-kind rows only, checked={members.includes(r.recordId)}, testid `sequence-check-${recordId}`) + existing open button`; insert the toolbar div (markup above) between the search input and the row list; the row filter chain (:134's `records.filter(['sequence','oligo-spec']…).filter(query…)`) stays as the visible-rows expression feeding select-all.
   - No other lines change; the deep-link effect (:32-36), agent handler (:42-54), proposal path (:55-60), and fieldset (:103) stay byte-identical.
2. `app/src/sequences/SequencesPage.css` — `.sequence-library__row`, `.sequence-selection-toolbar` chrome (flex row, wrap; no pixel perfection required — reviewer gate is functional).
3. `app/src/sequences/SequencesPage.multiSelect.test.tsx` — NEW (harness mirrors SequenceSearch.test.tsx: `vi.mock('./api')` with `requestId: vi.fn(()=>'req-test')` and a faithful `recordRef` re-export; additionally mock `../shared/hooks/useAiChat` (return a no-op chat object), `../shared/context/AiPanelContext` (`useRegisterAiChat: vi.fn()`), `../agent/HarnessChatPane` (stub), `../shared/surfaces/registry` (resolve `[]`), and wrap in `MemoryRouter` — SequencesPage imports `useSearchParams`). Mock `fetch`/catalog via the mocked `sequenceApi` returning `{records:[…]}` fixtures with two `sequence` rows (SEQ-A "Alpha", SEQ-B "Beta") + one `oligo-spec` row (OLIG-1) and a null contract.
4. `app/e2e/sequences-multiselect.spec.ts` — NEW playwright spec (project chromium, base :5193).

## TEST PLAN (RED first: commit the failing spec, then the implementation)

Unit pins in `SequencesPage.multiSelect.test.tsx` (all against the mocked `sequenceApi` call capture on `/actions`):
1. toolbar renders count `0 selected` on load; every `sequence` row has `sequence-check-*`, the oligo row does NOT.
2. check SEQ-A + SEQ-B → `sequence-selection-count` text `2 selected`.
3. select-all → count equals number of visible sequence rows (2 with fixture) and oligo never enters the count; query-filter "Alpha" then select-all → only SEQ-A added.
4. type collection name "Gates", click `sequence-toolbar-save-collection` → the captured `/actions` body DEEP-EQUALS `{operation:'save_collection',requestId:'req-test',label:'Gates',members:[{kind:'record',id:…,type:'sequence'},…]}` with exactly the checked ids in selection order — and the pin runs the OLD fieldset flow (Analysis tab, same fixture, same name/ids) in the same test and asserts `expect(toolbarBody).toEqual(fieldsetBody)` — byte-for-byte equivalence (requestId deterministic via the mock).
5. after a successful save the count resets to `0 selected` (selection cleared on success); on a REJECTED save (sequenceApi rejects) the selection is KEPT and the error surfaces (`role="alert"`).
6. clear resets: check rows → Clear → count `0 selected`, fieldset checkboxes (Analysis tab) also unchecked (single-model proof).
7. aiContext pin: the `useAiChat` mock captures `aiContext`; after checking SEQ-A, `aiContext.surfaceContext.collectionSelection` equals `['SEQ-A']`, and the pre-existing key `selection` still carries the analysis inputs map (regression fence against key clobbering).

First targeted check (early proof the approach is sound, run BEFORE implementing):
`cd /mnt/vast/home/brad/git/cl-integration-2 && npx vitest run --root app src/sequences` → baseline GREEN (5 files / 40 tests, measured at e68a6271); then the same command after committing RED pins shows ONLY SequencesPage.multiSelect failing.

Full verification commands (worker, in its worktree):
- `npx vitest run --root app src/sequences` → 6 files / 40+N tests, all pass. (NOTE: run vitest with `--root app`; running the repo-root vitest sweeps server/src/sequences tests that ENOENT on lane-exclude symlink artifacts — a measurement trap, not a product failure.)
- `npm run typecheck -w app 2>&1 | grep -c "error TS"` → exactly **23** and the error-file set unchanged (baseline measured at e68a6271; zero lines under src/sequences).
- `npx playwright test sequences-multiselect.spec.ts --project=chromium` against :5193 (stack serves the trunk checkout — merge + `cl-lane-stack.sh 2 restart` FIRST; that restart script is BLOCKING, launch it background=true).

Browser-gate criteria for cl-browser-reviewer on :5193 (verbatim-executable):
1. Navigate to the Sequences surface; Library visible. Expect `[data-testid="sequence-selection-toolbar"]` present, count reads `0 selected`. Screenshot.
2. Tick checkboxes on ≥2 sequence rows → `[data-testid="sequence-selection-count"]` shows `<N> selected`. Screenshot.
3. Open Analysis tab → the "Reference / alignment collection" fieldset shows EXACTLY the same rows checked (shared model). Type name `gate-collection` there or in the toolbar input.
4. From the TOOLBAR click Save collection → success status line appears (`Saved SEQSET-…`); count returns to `0 selected`; a `sequence-collection` named gate-collection exists afterwards in the Setup/Analysis listings or store. Backend trail: the POST /sequences/actions body carries `operation:"save_collection"`, `label`, `members` array of `{kind:"record",type:"sequence"}` — shape-equal to the fieldset flow body (requestId differs by design, exclude it).
5. Select rows, click Clear → count `0 selected`, Analysis fieldset unchecked.
6. Select-all with a search query active selects only visible sequence rows; oligo-spec rows are never selectable.
VERDICT: accept on :5193 is the gate; coder tests are not the gate.

## WORKER CONTRACT
- Branch `cl/UCX-1-lane2-<token>` off lane trunk `cl/integration-2` tip (≥ e68a6271) in worktree `wt/UCX-1-lane2-<token>`; NFS noise ⇒ always `git -c core.fileMode=false`.
- Deliverable/report (unique): `.hermes/plans/UCX-1-report.wip-<token>.md`; completion marker `UCX-1 DONE <sha>`; RED commit separate from feat commit.
- app-only diff; any server/ or schema/ hunk = scope violation, stop and flag.

## REVIEWER BAIT (expected adversarial attacks — pre-empt in code+report)
- **Row-button nesting:** checkbox inside the existing row `<button>` is invalid HTML and re-fires open(); the wrapper-row split is mandatory, prove it with a unit pin (clicking the checkbox does NOT change the Editor tab / `selected`).
- **aiContext key collision:** `selection:inputs` at :61 is the analysis-inputs map; naming the new key `selection` clobbers it silently. Key is `collectionSelection`; pin 7 fences it.
- **exactOptionalPropertyTypes sites:** backend-only tsconfig (CLAUDE.md rule 6); app has `strict` without it (app/tsconfig.json:18). No server edits here; in aiContext keep the conditional-spread discipline already at :61 if any key becomes conditional. `members` is a plain required array — never `undefined`.
- **YAML-reload trap:** nothing here touches YAML. IF any worker "improves" surfaces.yaml (e.g. adding selectionActions — spec says DON'T), :3093 tsx --watch will NOT reload it; a stack restart is required and that makes the diff out of scope. Report must state YAML: none.
- **Hardcode boundary:** the single Save-collection button and the `sequence`-kind checkbox gate reuse the page's EXISTING derivations (`byKind('sequence')` source, one-button-for-one-verified-operation); the report must cite CURRENT STATE item 5 (no declarative button source exists — recorded honestly) rather than pretending the button is data-driven, and must NOT add a fake capability filter.
- **Payload equivalence is by-construction AND by-pin:** equivalence claim rests on reusing the :103 expression verbatim + `recordRef`/`act`; pin 4 re-checks it. A reviewer should attack: key ORDER in the captured body (JSON.stringify compare) — deep-equal is the pin; the wire order matches because the object literal is identical.
- **Ontology terms:** no new nouns introduced — `sequence-collection`/SEQSET already exists; toolbar language says "collection", never a new coinage. If a term is ever needed, CURIE-style local namespace per rule 7.
- **requestId shape:** schema requires `^[A-Za-z0-9_-]{1,100}$`; the hex-24 requestId() satisfies it — do not "fix" the pattern.

## OPEN QUESTIONS for the orchestrator (with recommended defaults)
1. **Eligible kinds:** checkbox only on `sequence`-kind rows (server pins collection members to `['sequence']`, SequenceService.ts:104; Library also shows oligo-spec). Checked myself: fieldset source :103 (`byKind('sequence')`) and the pin. RECOMMENDED: yes, gate to `sequence`; no surfaces.yaml change (its `selectableKinds` at surfaces.yaml:96 is about agent FOCUS selection, a different concept — don't overload it).
2. **Agent can SET the selection?** No batch/selection target kind exists in schema/workflow/agent-action.schema.yaml (:44,:52) or compileWorkspaceAction.ts:199-232 — verified by direct read. Adding one is schema+compiler+orchestrator work. RECOMMENDED: out of scope; cooperation this item = single shared model + `collectionSelection` in aiContext (deckLabwares live-read pattern) + the existing proposal path already reaching the identical payload. Follow-up line if Brad wants chat to drive checkboxes.
3. **State sharing vs new state:** RECOMMENDED: reuse `members` (single model, payload equivalence by construction). Alternative (separate state) was considered and rejected — it would create two selections that can disagree, the exact failure the task warns against.
4. **Count visibility:** render `0 selected` always vs hide toolbar when empty. RECOMMENDED: always render (testids must be stably present for the playwright leg; empty-state chrome is a known defect class, not a hazard here).

## BASELINE MEASUREMENTS (all measured by composer at e68a6271, node_modules present in trunk)
- `git -c core.fileMode=false rev-parse HEAD` → `e68a6271bbdc04a8975174bdae666e0d05301d22`, branch cl/integration-2. Matches the tasked tip.
- `npm run typecheck -w app` → **23** `error TS` lines, distributed across shared/hooks/useAiChat.surfaceContext.test.ts (6) and event-editor/ingestion files (17); **zero under src/sequences**. UCX-1 must land with exactly 23 and the same file set.
- `npx vitest run --root app src/sequences` → **5 files / 40 tests passed** (baseline green; applyAgentAction 19 confirmed separately).
- `data-testid` occurrences in SequencesPage.tsx: **0** (the new testids are net-new surface for the browser gate).
- Failing-file count for files I touch: none failing at baseline (src/sequences suite fully green).
- Trap measured: repo-root `npx vitest run src/sequences` (no --root app) pulls server-side sequence tests through lane-exclude symlinks → 4 failed files / 18 failed tests ENOENT on /mnt/vast/home/brad/git/server/prompts/… (pre-existing artifact of the trunk's symlinked layout, NOT caused by this work).

---

## ORCHESTRATOR ADJUDICATION (l2t0110, 2026-10-18T01:2x EDT — binding)

Draft reviewed first-hand at trunk e68a6271: orch independently re-verified the
:29 members state, the :103 fieldset payload expression, the 0-testid Library
row-buttons, SequenceService.ts:104 `pin(ref,[sequence])`, and agent-action
target-kind exactness (sequence-tab/sequence-record only). All confirmed.

- OQ1 RULED: YES — checkbox on `sequence`-kind rows only (mirrors the server
  pin and the fieldset source). No surfaces.yaml change.
- OQ2 RULED: OUT OF SCOPE — no new agent-action target kind this item.
  Cooperation = shared `members` model + `collectionSelection` aiContext key +
  the existing proposal path. If chat-driven checkbox-setting is wanted later it
  is its own item.
- OQ3 RULED: REUSE `members` (single model; payload equivalence by construction).
- OQ4 RULED: ALWAYS RENDER the toolbar (`0 selected` visible; stable testids).

Worker contract: app-only diff (any server/ or schema/ hunk = stop+flag); RED
commit separate; report `.hermes/plans/UCX-1-report.wip-<token>.md`; marker
`UCX-1 DONE <sha>`; app typecheck must land exactly 23 error TS lines with the
same file set; `npx vitest run --root app src/sequences` green (NOTE the --root
trap documented in the draft). UI item -> :5193 browser gate MANDATORY post-merge.
