# ADVERSARIAL REVIEW — PB-CH-2 (lane 2, branch cl/PB-CH-2-lane2-l2t2155)

Reviewer: cl-adversarial-reviewer (deepseek/deepseek-v4.1-flash). Date: 2026-10-06 EDT.
Item: PB-CH-2 — generic draft-adapter seam + tier-2 workstate (session-document) compilation, projection-only.
Worktree reviewed READ-ONLY: /mnt/vast/home/brad/git/wt/PB-CH-2-lane2-l2t2155 @ branch cl/PB-CH-2-lane2-l2t2155.
Base: e5395353. Commits in scope: 23c92476 (feat), 0a3e21d9 (report). Diff 9 files, +1392/-4 (reproduced).
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-06_2155-PB-CH-2-workstate-draft-adapter.md

I did NOT restart any backend, did NOT POST to :3093, did NOT touch :3001/:5174, did not
read /mnt/vast/home/brad/git/computable-lab, and did not edit any tracked file.

================================================================================
EXECUTED COMMANDS (real output)
================================================================================
1) `git -c core.fileMode=false diff --stat e5395353..HEAD`
   -> 9 files: .hermes/plans/PB-CH-2-report.wip-l2t2155.md | config/drafting/adapters.yaml |
      config/drafting/workstate-tab-kinds.yaml | schema/workflow/workstate-intent.schema.yaml |
      server/src/ai/compileWorkspaceAction.ts | server/src/drafts/WorkstateDraftAdapter.test.ts |
      server/src/drafts/adapters.ts | server/src/drafts/workstateCompile.test.ts |
      server/src/drafts/workstateCompile.ts   (1392 insertions, 4 deletions)

2) `git -c core.fileMode=false diff --stat e5395353..HEAD -- <forbidden paths>`
   paths: FormDraftService.ts draftRoutes.ts StagingStore.ts FormDraftService.test.ts
   'schema/core/form-draft*.yaml' server/src/sequences lab-session.schema.yaml
   agent-action.schema.yaml workspace-session.ts server/src/workspace-session app
   -> EMPTY. Also `-- schema/workflow/lab-session.schema.yaml schema/workflow/agent-action.schema.yaml
      schema/registry/surfaces/` -> EMPTY.

3) `cd server && npx vitest run src/drafts`
   -> `✓ workstateCompile.test.ts (16)`, `✓ WorkstateDraftAdapter.test.ts (13)`,
      `✓ FormDraftService.test.ts (10)` — `Test Files 3 passed (3) / Tests 39 passed (39)`.

4) Typecheck, branch: `npm run typecheck -w server | grep -c "error TS"` -> 26; `-w app` -> 34.
   Typecheck, trunk /mnt/vast/home/brad/git/cl-integration-2 (009faa10): server -> 26.
   `diff <(trunk sorted) <(branch sorted)` -> SET-IDENTICAL (zero new error lines).

5) Greps:
   - `projectionOnly` anywhere: NONE.
   - adapter-name/schema-name branch in FormDraftService.ts / draftRoutes.ts: NONE.
   - `.create|.update|.delete` in workstateCompile.ts: NONE.
   - hardcoded record-kind names in workstateCompile.ts: only inside a comment (line 153).
   - `3001|5174`: only the report line "No :3001/:5174 contact." Tests use mkdtemp tmp dirs.

6) `git log --all --oneline -- server/src/drafts` -> 23c92476 (PB-CH-2) + d56037d7 (host landing).
   No vendored copy; branch adds nothing outside the 8 real files + report.

================================================================================
ACCEPTANCE CRITERIA (spec §"Acceptance criteria", verbatim)
================================================================================
"Red-first tests: valid projection-only compile; unresolved tab target => diagnostic;
invalid activeTabId ref; cross-actor accept rejected; reject changes nothing (prove
/api/session byte-unchanged before/after); repeat-accept not duplicated; accept returns
the authoritative compiled projection (client cannot resubmit its own doc); sequence-
authoring suite still green."

Criterion-by-criterion, and how I checked:

1. valid projection-only compile — MET in code/tests. Lifecycle test
   `compiles a proposal to a schema-valid version:1 session document with zero writes`:
   asserts canAccept, `writes toEqual []`, `projection toEqual {}`, lab-session Ajv valid,
   real record ids, activeTabId 'run:PLR-WST1', canonical id-set equal + fingerprint equal.
   My run: 39/39 pass.
2. unresolved tab target => diagnostic — MET. Pure test `unresolvable tab term yields
   UNRESOLVED_TERM with ok:false` asserts code/path; lifecycle asserts needs-missing-fact
   + canAccept:false + blocked accept.
3. invalid activeTabId ref — MET. Pure: ACTIVE_TAB_UNRESOLVED, index-out-of-range,
   UNKNOWN_RECORD, server-derived id pin, null when absent. Lifecycle: blocked accept.
4. cross-actor accept rejected — MET. Lifecycle asserts DraftError status 403 and
   cross-actor compile-revision rejected.
5. reject changes nothing (/api/session byte-unchanged before/after) — PARTIALLY MET.
   The committed test uses a tmp-dir WorkspaceSessionStore + sha256 and records-tree hash;
   it genuinely asserts byte-identity across compile×2 + blocked accept. BUT the
   real-lane-data-dir API receipt required by the spec is NOT present (see Defect 1).
6. repeat-accept not duplicated — MET. Promise.all + third accept, JSON-identical,
   records fingerprint unchanged, revision unchanged.
7. accept returns the authoritative compiled projection (client cannot resubmit) — MET.
   accept deep-equals compile result; accept body carrying `sessionDocument` rejected by
   the frozen accept schema. draftRoutes.ts diff EMPTY -> response body, no SSE/stream.
8. sequence-authoring suite still green — MET. FormDraftService.test.ts 10/10, zero diff
   to FormDraftService.test.ts / adapters.ts sequence entry / server/src/sequences.

================================================================================
REVIEWER-BAIT ITEMS (1-11 from the task), each with evidence
================================================================================
1. Host-file smuggling/vendoring — PASS. Forbidden-path diff EMPTY (cmd 2). Only
   adapters.ts registry entry + config/drafting/adapters.yaml entry added as mechanism
   changes (plus the spec-§4 export refactor, allowed by bait #7). Provenance log (cmd 6)
   shows the mechanism only from host landing d56037d7 + PB-CH-2 commits.
2. Zero adapter-name/schema-name if-branches — PASS. Grep clean. kind→tab policy lives in
   config/drafting/workstate-tab-kinds.yaml (read via loadWorkstateTabKindMapping);
   surface membership via `deps.surfaces.get(id) === null` only; verb live in the YAML
   operations list (`operations: [compose-workstate]`). FormDraftService.ts diff EMPTY.
3. Projection-only is DATA — PASS. No `projectionOnly` anywhere. `writes:[]` because
   stage() creates nothing. Store-spy test exists and asserts the ONLY create/update are
   `create:form-draft`/`update:form-draft`; canonical set-equality test asserts no
   non-draft record appears. workstateCompile.ts has zero .create/.update/.delete.
4. Mint leak / tier discipline — PASS. workstateCompile imports the EXPORTED
   LOCAL_TIERS/isMintAffordance from ../ai/compileWorkspaceAction.js; not re-implemented.
   fakeSpine appends `{curie:'', tier:5, source:'mint', ...}` to EVERY resolve; the
   `mint-only candidate never binds` test would fail (UNMAPPABLE, not UNRESOLVED) without
   the guard — so the guard is genuinely exercised.
5. exactOptionalPropertyTypes — PASS. Optional sites use conditional spread
   (FormDraftService harness `...(activeTab !== undefined ? {activeTab} : {})` in tests);
   workstateCompile always emits concrete strings; `activeTabId` is `string | null` and
   emits `null` (test asserts toBeNull). Server tsc set-identical to trunk.
6. requestId — PASS. workstate-intent.schema.yaml declares `requestId`; the pure harness
   injects it; the lifecycle goes through the real injection at FormDraftService.ts:106
   (line 106 confirmed: `intent.requestId = `${draft.id}-${draft.revision}``), which runs
   BEFORE stage().
7. compileWorkspaceAction.ts diff EXPORT-ONLY — PASS. Diff shows only `const LOCAL_TIERS`
   → `export const LOCAL_TIERS` and `function isMintAffordance` → `export function
   isMintAffordance` plus comments. No logic change. tsc set-identical; drafts suite green.
8. Accept is a response body, no SSE/stream, no session-route changes, no ledger capture —
   PASS. draftRoutes.ts EMPTY diff; workspace-session.ts/workspace-session/ EMPTY diff;
   test asserts no `journal` path under var/ and that only the actor-bound form-draft
   record carries the projection.
9. Report claims vs code — PASS, with one exception (Defect 1). Every test-matrix row
   maps to a real test that asserts what the report says (I opened both test files and
   counted: pure 16 `it`s, lifecycle 13 `it`s). Item 5's "API receipt" is openly labelled
   PENDING-RESTART in the report, so it is not a false claim — but it is an unmet
   deliverable (Defect 1).
10. Deviation audit — PASS. Dev 1: `canonicalReadStore` returns an object exposing only
    get/exists/list/validate/lint (lines 193-199); `create`/`update`/`delete` are absent
    (calling them would be a TypeError), and it reads through ctx.repoAdapter (read-only)
    + parseRecord. No mutation path reachable. Dev 2: tier-1 kind set is
    `Object.keys(loadWorkstateTabKindMapping())` — from the mapping YAML, not hardcoded.
    Dev 3-5 are consistent with the code.
11. Ports/data — PASS. No :3001/:5174 evidence; tests use mkdtemp tmp dirs.

Additional independent checks: schema/workflow/lab-session.schema.yaml tab `kind` enum
includes run/project/record-edit/protocol-review (all mapping tabKinds valid);
workstate-intent.schema.yaml is $id-consistent and loaded by the recursive loader in both
test harnesses (loaded.errors toEqual []). 39/39 green; server typecheck 26 == trunk 26.

================================================================================
DEFECTS
================================================================================

DEFECT 1 — MAJOR — real-path /api/session byte-unchanged proof and API receipts are absent.
Path: .hermes/plans/PB-CH-2-report.wip-l2t2155.md:103-134 (section
"## /api/session byte-hash pair + API receipts — PENDING-RESTART").
Rule violated: spec acceptance criterion 5 ("reject changes nothing (prove /api/session
byte-unchanged before/after)"); spec Verification §6 (API receipts from :3093); spec
Worker contract ("report … MUST contain … the /api/session byte-hash pair, the accept-body
excerpt"); spec Reviewer bait ("The /api/session byte-unchanged proof: must hash the REAL
lane-data-dir session file in the API receipt (a tmp-dir unit test alone is necessary, not
sufficient)").
Evidence: the committed report provides only the BEFORE half of the pair
(`sha256sum var/sessions/USR-BRAD/main.yaml` -> 8107ef6e…; `GET /api/session` ->
43d245a2…) and an accept-body excerpt generated by the tmp-store unit harness, not by
:3093. The AFTER half, the real accept body, the unresolved-variant receipt and the
cross-actor 403 receipt are all listed as post-restart commands for someone else to run.
The unit test (WorkstateDraftAdapter.test.ts:225-246) genuinely exercises the byte-identity
semantics against a real WorkspaceSessionStore, but the spec explicitly rules a tmp proof
necessary-but-not-sufficient.
Required change direction: after the new schema + mapping YAML land, restart the lane
backend (:3093) and capture (a) the BEFORE/AFTER sha256 pair of the real lane-data-dir
`var/sessions/<user>/main.yaml`, (b) the `GET /api/session` before/after hash pair,
(c) the real compile/accept JSON with `writes:[]`, (d) the cross-actor 403 receipt, and
paste all of them into the report. Do not mark PB-CH-2 done until that evidence exists.

MINOR OBSERVATIONS (not counted as defects; flagged for the record)
- workstateCompile.ts:405/424 — `tabIdByRecordId` is a Map keyed by recordId. If two
  proposed tabs resolve to the SAME recordId, the Map collapses them, and an `activeTab`
  index pointing at the second collapses to `null` silently instead of erroring. Edge case,
  not exercised by any acceptance criterion; worth a dedup guard if duplicate tabs become
  legal.
- workstateCompile.test.ts:166-171 — the "ontology-resolved term" case models a canonical
  CURIE as a fake tier-0 candidate. With the REAL composed spine a canonical ontology TERM
  surfaces at tier 2 (oak, remote:false) / tier 3 (ols4, remote), both excluded by
  localOnly/LOCAL_TIERS, so the real path would yield UNRESOLVED_TERM, not the asserted
  UNMAPPABLE_RECORD_KIND. The assertion still holds for the code path it targets (a
  non-local CURIE candidate), and deviation 3's outcome is reached in practice for local
  term records with unmapped kinds; this is a fixture-fidelity note, not a code defect.

================================================================================
SUMMARY
================================================================================
All eleven reviewer-bait obligations are satisfied by the code and the committed tests;
my own runs reproduce 39/39 drafts tests green, server typecheck set-identical to trunk
(26), and all forbidden-path diffs EMPTY. The single blocking gap is evidentiary, not
code: acceptance criterion 5's required real-lane-data-dir /api/session byte-hash pair and
the :3093 API receipts are missing from the report (openly marked PENDING-RESTART). The
item cannot be declared done without them.

VERDICT: fix
