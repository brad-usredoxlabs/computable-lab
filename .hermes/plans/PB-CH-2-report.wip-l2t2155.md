# PB-CH-2 REPORT — generic draft-adapter seam + workstate (session-document) compilation
Work: LANE 2 (cl/integration-2) ITEM PB-CH-2. Worker: cl-coder (appliance-2).
Date: 2026-10-06/07 EDT. Spec: `.hermes/plans/2026-10-06_2155-PB-CH-2-workstate-draft-adapter.md` (orchestrator copy).

## Provenance
- Worktree: `/mnt/vast/home/brad/git/wt/PB-CH-2-lane2-l2t2155`, branch `cl/PB-CH-2-lane2-l2t2155`.
- CLAIM-TIME BASE SHA: **e5395353** (trunk HEAD at claim; contains host-landing **d56037d7** and PB-CH-1 **d6e566e1**).
- HOST-LANDING SHA built on: **d56037d7** (`feat(lane2): land form-draft host mechanism for PB-CH-2 (read-only copy-in)`).
- NO vendoring: `git log --all --oneline -- server/src/drafts` shows the mechanism ONLY from d56037d7 (+ my PB-CH-2 commits). No content copied from `/mnt/vast/home/brad/git/computable-lab` (never read for copying, never touched).
- Worktree-environment note (NOT a code change): the fresh worktree lacked the lane-excluded sibling SYMLINKS the trunk checkout carries (e.g. `server/src/lifecycle/BypassAudit.ts` → live-tree symlink; without it `RecordStoreImpl.ts` cannot even load, so the drafts suite could not run). I recreated the identical 63-symlink set from the trunk checkout (same pattern as PB-CH-1's worktree `wt/PB-CH-1-lane2-l2t1350`, byte-for-byte the same link targets). These paths are lane-excluded/gitignored: `git status` shows only my 8 real files; nothing symlinked is staged or committed.

## What was built (files)
NEW:
- `server/src/drafts/workstateCompile.ts` — pure compile module (WorkstateDeps, workstateDepsFromContext, compileWorkstateIntent, WorkstateCompileResult, loadWorkstateTabKindMapping).
- `server/src/drafts/workstateCompile.test.ts` — pure-module suite (16 tests).
- `server/src/drafts/WorkstateDraftAdapter.test.ts` — lifecycle suite through FormDraftService (13 tests).
- `schema/workflow/workstate-intent.schema.yaml` — proposal envelope ($id `.../workflow/workstate-intent.schema.yaml`, additionalProperties:false, required [operation,tabs], declares compiler-injected `requestId`). Boot-registered by the existing recursive glob; agent-action.schema.yaml got ZERO bytes.
- `config/drafting/workstate-tab-kinds.yaml` — kind→tab policy DATA (planned-run/execution-run→run:runId, study→project:studyId, protocol→record-edit:recordId, vendor-pdf→protocol-review:recordId).
MODIFIED (the only adapter-mechanism changes the spec allows, plus the PB-CH-1 export refactor):
- `server/src/drafts/adapters.ts` — added the `'workstate'` registry entry (stage delegates to workstateCompile; project returns the projection unchanged; no checkRequest).
- `config/drafting/adapters.yaml` — added `workstate: {domain: workstate, operations: [compose-workstate], projection: {}}`.
- `server/src/ai/compileWorkspaceAction.ts` — EXPORT-ONLY refactor: `LOCAL_TIERS` and `isMintAffordance` exported (spec §4). No behavior change (proof below).
ZERO diffs (verified `git diff --stat HEAD -- ...` EMPTY): `server/src/drafts/FormDraftService.ts`, `server/src/drafts/draftRoutes.ts`, `server/src/drafts/StagingStore.ts`, `server/src/drafts/FormDraftService.test.ts`, `schema/workflow/lab-session.schema.yaml`, `schema/workflow/agent-action.schema.yaml`, `schema/registry/surfaces/`, `server/src/api/routes/workspace-session.ts`, `server/src/workspace-session/`, all `app/**`.

## Red-first outputs (pasted)
RED #1 — pure suite before the module existed (`cd server && npx vitest run src/drafts/workstateCompile.test.ts`):
```
 FAIL  src/drafts/workstateCompile.test.ts [ src/drafts/workstateCompile.test.ts ]
Error: Failed to load url ./workstateCompile.js (resolved id: ./workstateCompile.js) ... Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```
RED #2 — first implementation run (14/15 failed: harness `deps.validate` built before beforeAll populated it — a harness bug, fixed; then 2/15 failed on `idField` semantics — the mapping's `idField` names the TAB field (runId/studyId/recordId per app workspace/types.ts), fixed in the YAML):
```
 Test Files  1 failed (1)
      Tests  2 failed | 13 passed (15)
```
GREEN — pure suite: `Test Files 1 passed (1) / Tests 16 passed (16)`.
GREEN — lifecycle suite first run had 10 failed (host fact: `createResolveSpineFromContext` pins tier-1 to the material-family DEFAULT_KINDS in `resolve/providers/records.ts`, so run/protocol/study terms never resolved). Fix: workstate deps compose the SAME host providers (`createTermProvider` tier-0 + `createRecordProvider` tier-1) with the tier-1 kind set taken from the DECLARATIVE mapping file (see Deviations #2). Then:
```
 ✓ src/drafts/workstateCompile.test.ts  (16 tests)
 ✓ src/drafts/WorkstateDraftAdapter.test.ts  (13 tests)
 ✓ src/drafts/FormDraftService.test.ts  (10 tests)
 Test Files  3 passed (3)
      Tests  39 passed (39)
```

## Test-matrix mapping (spec table → named tests)
| Criterion | Test | Where |
| valid projection-only compile | `compiles a proposal to a schema-valid version:1 session document with zero writes` — result.sessionDocument Ajv-valid vs lab-session $id, `writes:[]`, `projection:{}`, canonical() set-equal before/after | lifecycle |
| (extra spy-proof) | `workstate compile stages nothing: no store.create/store.update for any non-draft record` — only `create:form-draft`/`update:form-draft` observed | lifecycle |
| unresolved tab target ⇒ diagnostic | `unresolvable tab term yields UNRESOLVED_TERM with ok:false` (pure, fake spine appends a REAL tier-5 `curie:''` mint EVERY call) + `unresolvable tab term yields a needs-missing-fact diagnostic and canAccept:false` (lifecycle, REAL spine) | both |
| invalid activeTabId ref | `activeTab target absent from tabs yields ACTIVE_TAB_UNRESOLVED`, `invented activeTab recordId yields UNKNOWN_RECORD`, `projected activeTabId always equals a server-derived tab id` (pure) + `invalid activeTab reference yields ACTIVE_TAB_UNRESOLVED and blocks accept` (lifecycle) | both |
| cross-actor accept rejected | `a second actor's accept is rejected (403, draft access restricted to its actor)` — DraftError status 403 asserted; cross-actor compile-revision also rejected | lifecycle |
| reject changes nothing / /api/session byte-unchanged | `compile-then-abandon leaves /api/session and the canonical records byte-identical` — WorkspaceSessionStore(tmpRoot) seeded, sha256 of `var/sessions/USR-test/main.yaml` + full records-tree hash (form-draft lifecycle paths excluded — the pipeline legitimately persists draft history per PB-CH-7), compile×2 + blocked accept, re-hash EQUAL | lifecycle + API receipt (PENDING-RESTART, below) |
| repeat-accept not duplicated | `accept twice (and concurrently) returns byte-identical results without duplicating anything` — Promise.all + third accept, JSON-identical; records fingerprint unchanged; draft revision unchanged | lifecycle |
| accept returns authoritative projection | `accept returns the authoritative compiled projection; the client cannot resubmit its own document` — accept deep-equals compile result; accept body with an extra `sessionDocument` key is schema-rejected (accept $defs additionalProperties:false) | lifecycle |
| sequence-authoring still green | `FormDraftService.test.ts` untouched (zero diff) and green: 10/10 | suite |
| no TS kind branch | `unmappable record kind produces a diagnostic...` (pure, budget fixture) + `unmappable record kind yields a diagnostic (no TS kind branch)` (lifecycle, real BUD-WST1 record) | both |
| mint-only never binds | `mint-only candidate never binds (tier-5 leak guard exercised every call)` | pure |
| UNSUPPORTED_SURFACE | `surface not in the registry yields UNSUPPORTED_SURFACE (registry membership only)` | pure |
| requestId tolerated | `intent schema tolerates the compiler-injected requestId; malformed envelopes are MALFORMED_ENVELOPE` (harness injects requestId like the pipeline; lifecycle goes through the real injection at FormDraftService.ts:106) | both |
| kernel empty-plan assumption | `kernel assumption: an empty plan compiles with zero error diagnostics and all-allowed policy decisions` — CompilerKernel.evaluateRequest with ZERO candidateBindings/steps keeps canAccept-eligible | pure |
| project:<studyId> consistency pin | `project tab ids are project:<studyId> (client tabId.ts consistency pin)` | pure |

## Full-suite counts vs pinned baselines (baselines re-measured at MY base e5395353 in this worktree)
- `npx vitest run src/drafts`: base (before my changes): 1 file / 10 PASS. After: **3 files / 39 PASS (0 failures)** = host 10 + pure 16 + lifecycle 13. Matches the orchestrator's post-landing pin (1/10) plus my additions.
- `npx vitest run src/ai`: **10 failed files / 21 failed / 565 passed (73 files), 2 unhandled errors** — diff of the FAIL-line set vs my base run: EMPTY (set-identity with the canonical PB-CH-1 baseline).
- PB-CH-1 targeted set (`compileWorkspaceAction.test.ts AgentOrchestrator.workspaceAction.test.ts submitSuggestionTool.test.ts submitSuggestionTool.protocolEdit.test.ts`): **4 files / 52 tests PASS** — the export-only refactor changed no behavior.
- `npx vitest run src/schema src/surfaces`: **3 failed files / 10 failed / 372 passed / 53 skipped (44 files)** — failing-file set IDENTICAL to my base run (the pre-existing symlinked live-tree suites: EventGraphEquipmentSchema.test.ts, LabwarePhysicalGeometryData.test.ts, surfacesAjv.test.ts — untouched by me).
- `npm run typecheck -w server`: **26 error lines** after my changes; diff of the sorted error-line set vs the trunk checkout (`/mnt/vast/home/brad/git/cl-integration-2/server`, same command) at d56037d7: **EMPTY — zero new error lines**. NOTE for the orchestrator: my `grep -c "error TS"` measurement of the pinned baseline is 26, not the dispatch note's 27 (the 27 likely counted a summary line); either way the bar (zero NEW lines) is met with set-identity.
- `npm run typecheck -w app`: **34 error lines**, error-FILE set (24 files) IDENTICAL to trunk. No app file touched.

## Sequence-suite green excerpt
```
 ✓ src/drafts/FormDraftService.test.ts  (10 tests) 1690ms
 Test Files  3 passed (3)   (src/drafts run)
```
Zero diff to `FormDraftService.test.ts`, `adapters.ts` sequence entry (`:14-26` content unchanged), and `server/src/sequences/**`.

## Accept-body excerpt (real, generated by the lifecycle harness probe — tmp store)
Compile summary: `{"draftId":"DRAFT-8cc28c85-067b-41ab-a9c7-9c6d13d6e598","revision":1,"canAccept":true,"writes":[],"projection":{},"reviewHash":"a5dc90d12ec1bc584f489b0128455108d04aa60764c25d05740c429ccfcf99ea"}`
Accept response body (this is what `POST /api/drafts/accept` returns — a JSON response body, not an event):
```json
{
 "sessionDocument": {
  "version": 1,
  "tabs": [
   { "kind": "run", "runId": "PLR-WST1", "title": "ZymoBIOMICS extraction run" },
   { "kind": "record-edit", "recordId": "PRT-WST1", "title": "ZymoBIOMICS MagBead protocol" }
  ],
  "activeTabId": "run:PLR-WST1"
 },
 "summary": "Workstate proposal: 2 tab(s), active run:PLR-WST1.",
 "resolvedTerms": [
  { "term": "ZymoBIOMICS extraction run", "curieOrRecordId": "PLR-WST1", "label": "ZymoBIOMICS extraction run" },
  { "term": "ZymoBIOMICS MagBead protocol", "curieOrRecordId": "PRT-WST1", "label": "ZymoBIOMICS MagBead protocol" }
 ]
}
```
Server-derived ids are REAL record ids (PLR-WST1/PRT-WST1), never the proposed terms; `activeTabId` matches the client convention `runTabId` (`run:<runId>`, app/src/event-editor/workspace/types.ts:164).

## /api/session byte-hash pair + API receipts — **PENDING-RESTART**
The lane backend :3093 serves d56037d7 and does NOT have my new YAML loaded (`tsx --watch` does not reload YAML; I may not restart it). Proof of the pending state, measured now:
```
$ curl -s -X POST localhost:3093/api/drafts/compile -H 'content-type: application/json' -H 'x-user-id: USR-BRAD' \
    -d '{"adapter":"workstate","intent":{...}}'
{"error":"DRAFT_FAILED","message":"Unknown form draft adapter."}
```
(Sequence adapter still served: 422 on an unregistered operation — the existing lifecycle is healthy.)
`curl -s localhost:3093/api/health` → 200 (184 schemas loaded).

BEFORE-half of the byte-hash pair (captured now, lane data dir `/home/brad/.computable-lab-lane2/worktrees/main`):
- `sha256sum var/sessions/USR-BRAD/main.yaml` → `8107ef6e1b88ee296dd29fc552e1709c8bf844366bfe45fcd5afe6008b1e85b9`
- `curl -s localhost:3093/api/session -H 'x-user-id: USR-BRAD' | sha256sum` → `43d245a2676e19b56b6bf6cffce40792fae05b89399e2fdb057f52680d2ff804`

AFTER-half requires the orchestrator to restart :3093 (new schema + mapping YAML). Exact commands + expected outputs the orchestrator (or I, post-restart) should run:
1. `curl -s localhost:3093/api/health` → 200.
2. BEFORE hashes (commands above) → record both hashes.
3. Compile (lane data already has mappable records — no seeding needed; e.g. `PLR-000001` planned-run titled "Planned", protocol `CAN-protocol-1788724639561`):
```
curl -s -X POST localhost:3093/api/drafts/compile -H 'content-type: application/json' -H 'x-user-id: USR-BRAD' -d '{
  "adapter":"workstate",
  "intent":{"operation":"compose-workstate",
    "tabs":[{"surface":"run-plan","target":{"term":"Plan: Assist Plus Transfer"}},
            {"surface":"protocol-review","target":{"recordId":"CAN-protocol-1788724639561"}}],
    "activeTab":{"index":0}}}'
```
Expected: 200, `canAccept:true`, `writes:[]`, `projection:{}`, `result.sessionDocument.version==1` with RESOLVED ids (e.g. `{"kind":"run","runId":"PLR-plan-assist-plus-transfer-866a0306",...}` and `{"kind":"record-edit","recordId":"CAN-protocol-1788724639561",...}`), `activeTabId:"run:<runId>"`.
4. AFTER hashes (same commands as step 2) → BYTE-IDENTICAL to step 2 (compile touches only the form-draft record under `records/form-draft/`, never `var/sessions/**`).
5. Accept: `curl -s -X POST localhost:3093/api/drafts/accept -H 'content-type: application/json' -H 'x-user-id: USR-BRAD' -d '{"draftId":"<from step 3>","revision":1,"reviewHash":"<from step 3>"}'` → body's `sessionDocument` deep-equals compile's; run twice → identical; re-hash session file → still identical.
6. Unresolved variant: same as step 3 with `"term":"nonexistent phantom assay"` → 200 with `canAccept:false` and a `needs-missing-fact` diagnostic containing `UNRESOLVED_TERM`; accept → 422 `Draft is blocked...`.
7. Cross-actor: accept step-5's draft with `-H 'x-user-id: USR-SOMEONE-ELSE'` → **403** `{"error":"DRAFT_FAILED","message":"Draft access is restricted to its actor."}`.
8. Smuggled doc: accept body with an extra `"sessionDocument":{...}` key → 422 naming `sessionDocument` (accept schema additionalProperties:false).

## Lane discipline (verification step 7)
- Lane data dir `/home/brad/.computable-lab-lane2/` (auth, repos, shadow-router, worktrees) differs from main data `/home/brad/.computable-lab/` (no shadow-router). All unit tests ran in tmp dirs (`mkdtemp`); no writes under main data.
- Evidence URLs ONLY on :3093 (health, drafts, session). No :3001/:5174 contact.
- `git diff --stat HEAD -- schema/workflow/lab-session.schema.yaml schema/workflow/agent-action.schema.yaml schema/registry/surfaces/` → EMPTY.

## Deviations / justified design decisions (all in-code comments too)
1. **Canonical read view instead of the staging store for spine enumeration.** During compile the pipeline swaps `ctx.store` for the staging proxy, which PROHIBITS `list` (StagingStore.ts:18) — but the spine's tier-0/1 providers enumerate records. `canonicalReadStore` reads the canonical record files through the (unswapped, read-only) repo adapter + `parseRecord`, memoized per compile, excluding `form-draft` records from resolution. Targeted `get` still goes through the staging proxy, so bound records are pinned in `reads` and re-verified at accept. This is a READ-ONLY view — no new mutation semantics (stop-boundary NOT hit).
2. **Spine composition instead of `createResolveSpineFromContext`.** That factory pins tier-1 to the material-family `DEFAULT_KINDS` (resolve/providers/records.ts:15-23), which cannot see runs/protocols/studies — the workstate adapter would resolve nothing. `workstateDepsFromContext` composes the SAME host providers (`createTermProvider`, `createRecordProvider`) with the tier-1 kind set taken from `config/drafting/workstate-tab-kinds.yaml` (data, not a hardcoded list), plus the ontology config when present. The vendor tier is omitted (resolution is localOnly; localOnly excludes remote tiers anyway). Tier/mint discipline is IMPORTED from PB-CH-1 (`LOCAL_TIERS`, `isMintAffordance`), never re-implemented.
3. **UNMAPPABLE_RECORD_KIND for ontology-only resolutions.** A term resolving to a canonical CURIE with no workspace record (e.g. `CL:0000182`) has no record kind to map; it yields a diagnostic rather than a guessed tab.
4. **Mapping `idField` names the TAB field** (runId/studyId/recordId), matching the client tab shapes in app/src/event-editor/workspace/types.ts; the VALUE is always the resolved record's canonical recordId. Caught by my own red-first run (RED #2).
5. **Surface vs tab kind:** the surface is a registry-membership check only (`surfaces.get()` — no TS allow-list); the tab KIND derives from the record-kind mapping. So a `protocol` record proposed on surface `protocol-review` projects a `record-edit` tab. Honest limits recorded in the YAML header: `project-details`/`splash` tab kinds are not producible from a proposal (no stable record derivation); unmapped kinds (e.g. `local-protocol` today) yield `UNMAPPABLE_RECORD_KIND` — teaching the adapter a new kind is a YAML edit.
6. **Server tsc baseline measurement:** 26 `error TS` lines at base and after (set-identical to trunk at d56037d7); the dispatch note pinned 27 — likely a summary-line counting difference. Zero NEW lines either way.

## Stop-boundary
NOT hit. Nothing required new mutation semantics or session-payload versioning: projection-only rides the existing staged-write boundary (stage creates nothing ⇒ accept write loop iterates an empty array), actor binding, reviewHash pinning, repeat-accept early-return, and revision recompiles are all INHERITED from the existing lifecycle (FormDraftService.ts:46,155-156,186 / draftRoutes.ts:9-10 / form-draft-request accept additionalProperties:false). The lab-session payload is unchanged (`version: 1`); agent-action envelope untouched.

## Reviewer-bait self-audit
- Host-file smuggling: none — FormDraftService/draftRoutes/StagingStore/sequences/form-draft*.yaml diffs EMPTY; only adapters.ts registry entry + adapters.yaml entry added.
- Schema/adapter-name dispatch: zero `if (adapter===...)` in the service (its diff is empty); kind→tab policy in YAML; surface membership via `registry.get()` only; verbs live in adapters.yaml operations.
- Projection-only is data: `writes:[]` because stage creates NOTHING (canonical set-equality + store-spy test), no `if (projectionOnly)`.
- /api/session proof: tmp-dir unit proof DONE; real lane-data-dir hash pair PENDING-RESTART (before-half captured above).
- Mint leak: fake spine appends a real tier-5 `curie:''` mint every call (pure); lifecycle uses the REAL spine.
- exactOptionalPropertyTypes: conditional spreads used throughout (`...(x !== undefined ? {x} : {})`); `activeTabId` emits `null`, never `undefined`.
- requestId: envelope declares it; unit harness injects it; lifecycle exercises the real injection.
- Accept is a response body: no SSE/stream added.
- Session routes / workspace-session: zero diff. Ledger/journal: none (test asserts no journal paths under var/).
- PB-CH-1 collateral: export-only; 52-test targeted set green; src/ai set-identity; agent-action YAML untouched.

## Commits
- `23c92476` — one logical commit (mechanism + module + tests + YAML): 8 files, +1224/-4.
- report commit (this file).
Verify with:
`git -c core.fileMode=false log --oneline -3` and `git -c core.fileMode=false show --stat 23c92476`.

---

## API receipts — EXECUTED BY ORCHESTRATOR POST-RESTART (closes PENDING-RESTART / adversarial DEFECT 1)
Restart of :3093 at 23:20 EDT loaded the new YAML (health: 185 schemas, +1 = workstate-intent).
Backend serves merged trunk 35f28cbb. All receipts against :3093 ONLY. Lane data dir
`/home/brad/.computable-lab-lane2/worktrees/main`.

BYTE-HASH PAIR (real lane-data-dir, USR-BRAD) through compile + accept x2 + negatives:
- BEFORE: file `8107ef6e1b88ee296dd29fc552e1709c8bf844366bfe45fcd5afe6008b1e85b9` / GET `43d245a2676e19b56b6bf6cffce40792fae05b89399e2fdb057f52680d2ff804`
- AFTER (post-accept-x2, post-negatives): file `8107ef6e…` GET `43d245a2…` — BYTE-IDENTICAL (SESSION-BYTE-PAIR-IDENTICAL-THROUGH-COMPILE-ACCEPT-X2).

HAPPY PATH (real :3093, actor USR-BRAD, draft DRAFT-560baaba-20da-4ce5-a6f2-a3f2dba5c443,
tabs: run-plan target recordId PLR-plan-cellrox-flow-cytometry-assay-kits-34e5af82 + protocol-review
target recordId PRT-4iaey2, activeTab index 0):
- compile → 200 canAccept:true writes:[] projection:{} reads pinned both records.
- sessionDocument (real): {version:1, tabs:[{kind:run, runId:PLR-plan-cellrox-flow-cytometry-assay-kits-34e5af82, title:"Plan: CellROX® Flow Cytometry Assay Kits"},{kind:record-edit, recordId:PRT-4iaey2, title:"PureLink Genomic DNA Extraction (Thermo Fisher)"}], activeTabId:"run:PLR-plan-cellrox-flow-cytometry-assay-kits-34e5af82"}
- accept x2 → BYTE-IDENTICAL responses; accept deep-equals compile `result` (ACCEPT-EQUALS-COMPILE).

TERM-VARIANT COMPILE (spec example, term "Plan: Assist Plus Transfer" + CAN-protocol-1788724639561):
compile → 200, canAccept:true, writes:[], RESOLVED ids (PLR-plan-assist-plus-transfer-866a0306), activeTabId run:… — server-derived ids, never the proposed term.

STEP 6 UNRESOLVED VARIANT: term "nonexistent phantom assay zzz-9999" → compile 200
canAccept:false diagnostic {code:DRAFT_INVALID,outcome:needs-missing-fact,message:"UNRESOLVED_TERM /tabs/0/target/term: …"}; accept → HTTP 422 "Draft is blocked. Correct the validation or policy diagnostics."

STEP 7 CROSS-ACTOR: seeded USR-RECEIPT-OTHER (test user via POST /api/records, 201); accepting
USR-BRAD's draft as USR-RECEIPT-OTHER → HTTP 403 "Draft access is restricted to its actor."
EXACT expected message. NOTE: x-user-id: USR-LOCAL-ADMIN does NOT stay ADMIN — resolveRequestUser's
ensureLocalAdminUser fallback resolves it to the first non-admin active user (USR-BRAD); a receipt
attempt as ADMIN compiled actor=USR-BRAD and accept then hit "Record access denied." (403) on the
private planned-run ACL — independent confirmation that actor binding + ACL re-verification on accept
reads both work. (Lane store users are test data; USR-RECEIPT-OTHER left in place.)

STEP 8 SMUGGLED DOC: accept body + "sessionDocument":{…} → HTTP 422 "/: Unknown property: sessionDocument" (accept $defs additionalProperties:false).

DEFECT 1 CLOSED: every receipt the reviewer required now exists on the real lane backend.
