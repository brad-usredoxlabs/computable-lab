# SPEC DRAFT — QMS7-6: Archive affordance via declared transitions + archived browsing (D3)

Composer: cl-spec-composer, 2026-10-16T10:45 lane tick (l1t1045). Draft — pending orchestrator review; NOT canonical until promoted.
Campaign: QMS registry unification wave 3. Trunk `cl/integration-1` @ **c892847d8e7bc4633c677283fca46306a4c7f187** (all path:line cites measured against this sha in /mnt/vast/home/brad/git/cl-integration-1; live-API probes run against the lane stack :3092 today).
Task block: /home/brad/.hermes/cl/lanes/1/task-list.md:4394-4419. Intake (Brad-approved "as is"): ~/.hermes/specs/intake/2026-10-15_qms-registry-unification-wave3/wave3-append-blocks.md:195-219.
Docs read: docs/qms-manual-testing-cheatsheet.md (lane table :215-217, lane fixtures :224-235, spoof header :6), schema/core/lifecycles/registry-ops.lifecycle.yaml.

## Goal (one sentence)

Deliver the "A" of CRUA with zero new transition machinery: the Archive button already comes from getValidTransitions data alone (verified live @ c892847d — see first check), so the work is (1) pin the archive affordance + PUT-only/role-denial/consistency behaviors with RED-first tests, (2) add a data-driven archived-browsing toggle to the registry list that hides terminal-state records by default, and (3) prove archived records open read-only with references resolving and no delete affordance exists anywhere on /registry.

## First targeted check (run this before writing any code)

The single command that proves the approach early — the Archive affordance is already 100% data (measured live on :3092 @ c892847d, do NOT re-archiving anything):

```
curl -s 'http://localhost:3092/api/lifecycle/registry-ops/transitions?recordId=EQP-QUANTSTUDIO5' -H 'x-user-id: USR-QMS-ADMIN'
```

Actual measured output (2026-10-16):

```json
{"lifecycleId":"registry-ops","state":"active",
 "transitions":[{"event":"ARCHIVE","targetState":"archived","label":"Archive","role":"approver","allowed":true}]}
```

No `requires` key → no signature guard → DocumentControlBar's visibility rule `(t.allowed || t.requires?.signatureRequired === true)` (app/src/components/registry/DocumentControlBar.tsx:160) renders the button labeled "Archive" and `commitTransition` (:94-124) issues `apiClient.updateRecord` = **PUT /records/:id** with body-top-level `state: "archived"`, no `signatureRefs` (app/src/shared/api/client.ts:2445-2459 — the only mutation verb; there is no `deleteRecord` method anywhere in client.ts, verified by grep @ c892847d). And for the archived fixture:

```
curl -s 'http://localhost:3092/api/lifecycle/registry-ops/transitions?recordId=EQC-QUANTSTUDIO5' -H 'x-user-id: USR-QMS-ADMIN'
```
→ `{"lifecycleId":"registry-ops","state":"archived","transitions":[]}` (terminal, no declared exits — matches registry-ops.lifecycle.yaml:21-24 `archived … terminal: true` and transitions block :25-33; there is NO unarchive transition and there must never be one).

If the first curl does NOT return the ARCHIVE row at the coder's tip, that is a DEFECT to report with evidence, not code to absorb (orchestrator ruling).

## Why the archive half is verify+tune, not build (measured facts)

- Lifecycle data: schema/core/lifecycles/registry-ops.lifecycle.yaml — states draft(:14-17,initial)/active(:18-20)/archived(:21-24, `terminal: true`); transitions draft→active role author label "Activate" (:26-29), [draft,active]→archived role approver label "Archive" (:30-33). No `guards`/signature block on Archive (yaml :30-33) — confirmed live by the missing `requires` in the transitions payload. So the verified-by clause "single password modal when required" is **vacuously satisfied for this lifecycle** — the modal machinery exists (DocumentControlBar.tsx:126-136 → SignaturePasswordModal) and fires only from `requires.signatureRequired`; the spec must state this honestly (evidence in report), not fake a signature lap.
- Preview endpoint: GET /lifecycle/:lifecycleId/transitions (server/src/api/routes.ts:608 → LifecycleHandlers.ts:29-70) runs PERMISSIVE (`enforceTransitionRoles: false`, :65) — allowed:true does not mean the write will pass; role denial surfaces as a write-time 422 (handler doc-comment :21-27 calls this "the designed behavior").
- Server write-path guards, measured live at c892847d (EQP-QUANTSTUDIO5 still `active` after each probe):
  - Role denial: `PUT /api/records/EQP-QUANTSTUDIO5` as `x-user-id: USR-BRAD` (no registry-ops grant) → **422 `LIFECYCLE_TRANSITION_DENIED`**, message "You do not have the required role for this transition." (thrown by the lifecycle check, RecordHandlers.ts:1042-1069). EQP stayed `active` — denial persists nothing.
  - **Archived content edit (the verified-by token — EXACT, measured):** state-preserving content change on archived EQC-QUANTSTUDIO5 (`PUT {"payload":{"kind":"equipment-class","id":"EQC-QUANTSTUDIO5","displayName":"…","lifecycleId":"registry-ops","state":"archived"}}`) → **409 `CONTROLLED_RECORD_LOCKED`** (RecordHandlers.ts:1075-1076; the server's locked-state list at :1075 already includes 'archived'). Use THIS token+status in the spec's criterion.
  - Ordering nuance the coder must not trip: the lifecycle-transition check runs BEFORE the controlled lock (RecordHandlers.ts:1042 before :1075), so a PUT that drops or changes `state` on an archived record is 422 `LIFECYCLE_TRANSITION_DENIED` ("Transition from 'archived' to 'undefined'…", measured) — 409 CONTROLLED_RECORD_LOCKED requires a state-preserving body. Test fixtures must mirror probe body A above.
  - ARCHIVED_TARGET_ASSIGNMENT (422, RecordHandlers.ts:687/:696 create, :1109/:1119 update) fires for new ASSIGNMENT refs into terminal targets (archivedTargetAssignmentDenial :262-296, driven by schema/registry/registry-kinds.registry.yaml archiveGuard :22-24) — NOT for the archived-target content edit. Do not cite it as the content-edit token.
- List payload carries the filter's raw data, measured: `GET /api/records?kind=equipment-class&limit=100` rows include `payload.state` AND `payload.lifecycleId` per row; archived rows (EQC-QUANTSTUDIO5, EQC-LIVEGATE-QMS73) are returned today — the list handler (RecordHandlers.ts:415-431) and ListRecordsQuery (server/src/api/types.ts:64-81) have **no state filter** (verified). Note: EQP payload carries BOTH `state: "active"` and `status: "active"` — filter on `state` (lifecycle state), NEVER `status` (the conflation trap the server itself calls out, RecordHandlers.ts:289-291).
- No delete affordance exists: DELETE /records/:id is a server route (routes.ts:238) but app/src/shared/api/client.ts has no delete method (grep @ c892847d) and RecordRegistryPage.tsx + components/registry/*.tsx contain zero delete affordances (grep @ c892847d). The item ADDS nothing and must not REMOVE the server route (out of scope) — it PINS UI absence with tests.

## Scope

### Files in scope (ownership — the diff stays inside these)
- `app/src/pages/RecordRegistryPage.tsx` — the archived-browsing toggle + list filter + (per OQ-2 ruling) archived read-only wiring. Anchors @ c892847d: refreshRecords :95-114 (per-tab `listRecordsByKind(kind, 100)` :101), list render block :370-403, `contentLocked` :265-268, DocumentControlBar mount :464-470. WARNING: QMS7-5 edits this same file (Create button, CsvImportModal mount :497-506 deletion) — after its merge ALL line anchors shift; locate every site BY CONTENT (comment markers, JSX structure), not by line number.
- `app/src/components/registry/DocumentControlBar.test.tsx` — surface-check additions ONLY (see AC-1/AC-2 tests).
- `app/src/components/registry/DocumentControlBar.tsx` — **surface check only; expected diff: ZERO.** If a registry-surface label tune is genuinely needed (e.g. the terminal readout at :172-174 reads oddly for registry docs), it must be label-only and justified in the report. Pre-existing hardcoded `['superseded', 'archived']` at :140 (isTerminal caption) is existing reviewed behavior — DO NOT widen, DO NOT "fix" it here.
- NEW `app/src/pages/RecordRegistryPage.archiveBrowsing.test.tsx` — the RED-first suite (design below).
- `app/src/shared/api/client.ts` — touch ONLY if OQ-1 lands (a typed method for the lifecycle-facts route). Expected diff: none without an OQ-1 ruling.
- Server: **ZERO by default.** Only if the orchestrator rules OQ-1 as the transitions-payload/server-fact option does the diff extend to `server/src/api/handlers/LifecycleHandlers.ts` (+ its test, + possibly routes.ts wiring). That is an OQ for the orchestrator, NOT a coder decision.

### Explicitly OUT of scope
- `schema/core/lifecycles/registry-ops.lifecycle.yaml` and `schema/registry/registry-kinds.registry.yaml` — declarative surfaces FROZEN. Any YAML demand mid-implementation = platform-gap stop-boundary: STOP, return requires-rescope.
- Any new transition, any unarchive path, any DELETE affordance, removal of the server DELETE route, server RecordHandlers guards (QMS7-4 shipped, untouched), `docs/qms-manual-testing-cheatsheet.md`, the lane stack (:3092/:5192 belong to the orchestrator's gate; coder does not restart it unless OQ-1 lands a server change — then flag it in the handoff, the orchestrator restarts).
- QMS7-5's surfaces (Create button, CSV deletion): same file, disjoint concern; expected post-merge overlap is fine.

## Acceptance criteria — verbatim verified-by, mapped 1:1

Task verified-by (task-list.md:4411-4417, verbatim):
> Browser: archive an active plain record — network trace shows PUT (NEVER DELETE); transition honors the declared role/signature guard (single password modal when required); denied / cancelled / signature-failed paths leave displayed state consistent with the server. Archived record vanishes from the default list, appears under archived browsing, opens read-only, references from it resolve. Direct API content edit on archived still fails. No delete button exists. cl-browser-reviewer VERDICT: accept.

| AC | Clause | Component-test state (RED-first) | Browser-gate state (:5192/:3092, fixtures below) |
|----|--------|----------------------------------|--------------------------------------------------|
| AC-1 | Archive affordance is pure data (basis for "archive an active plain record") | DocumentControlBar.test.tsx addition: with getValidTransitions mocked to the EXACT measured payload (event ARCHIVE, targetState archived, label "Archive", role approver, allowed true, NO requires), the bar renders a button whose text is "Archive" and clicking it calls `updateRecord` with `state: "archived"` and NO signatureRefs. RED at base only in the sense the pin is new; if it lands green immediately, that's the point — it's a pin, note it as pin-green-not-RED in the report. | see AC-2 gate lap |
| AC-2 | Network trace shows PUT (NEVER DELETE) | Same test asserts `updateRecord` (PUT verb lives in client.ts:2445-2459) is the only client call; no fetch with method DELETE anywhere in the page spy | Gate lap 2: archive EQP-QUANTSTUDIO5 with DevTools network open — a PUT /api/records/EQP-QUANTSTUDIO5 200 appears; ZERO DELETE requests; UI chip flips to "Archived" and bar shows "No transitions" + terminal caption |
| AC-3 | Declared role/signature guard honored (single password modal WHEN required) | Test: transitions payload WITHOUT requires → no SignaturePasswordModal mount (pin the vacuous-for-registry-ops fact). Second test: payload WITH `requires.signatureRequired` (doc-control-style fixture, existing pattern in DocumentControlBar.test.tsx) → exactly one modal mount — machinery pin | Gate lap 3 (denial): re-issue an Archive attempt as a NON-grant user is NOT available in the UI (browser session is USR-QMS-ADMIN) — denial is pinned component-side (updateRecord rejects with the measured 422 body) AND evidenced by the recorded curl (USR-BRAD 422 LIFECYCLE_TRANSITION_DENIED, EQP stays active) — report cites both. Signature lap: N/A-for-lifecycle with yaml :30-33 + transitions-curl evidence |
| AC-4 | Denied / cancelled / failed paths leave displayed state consistent | Tests: (a) updateRecord rejects → transition-error text renders (`data-testid="transition-error"`, DocumentControlBar.tsx:180-184) and `getValidTransitions` is refetched (refetch :86-92) — displayed state does NOT optimistically flip; (b) modal cancel path (existing component behavior) → no updateRecord call | Gate lap 4: after the denial curl, reload :5192 → EQP still shows Active in list until the archive lap; post-archive, chip reads Archived and refreshSelectedRecord (RecordRegistryPage.tsx:298-311) re-lists |
| AC-5 | Archived vanishes from default list | `RecordRegistryPage.archiveBrowsing.test.tsx`: mock listRecordsByKind returning one row with `lifecycleId: "registry-ops", state: "archived"` (+ terminal-facts source per OQ-1 ruling) → row ABSENT by default; toggle ON → row PRESENT. This is THE RED test (fails at base: no toggle exists — grep confirms no 'archived'/toggle handling in RecordRegistryPage.tsx @ c892847d) | Gate lap 5: after archiving, EQP-QUANTSTUDIO5 gone from Equipment tab default view; toggle "Show archived" ON → it appears |
| AC-6 | Opens read-only, references from it resolve | Test: selecting an archived row (per OQ-2 ruling) → editor disabled / Save not offered; DocumentControlBar shows terminal caption with ZERO action buttons. Reference pin: RelatedRecordsCard still mounts for the archived record (component receives recordId, no error state) | Gate lap 6: open EQP-QUANTSTUDIO5 (archived) → editor content read-only (no Save), forward ref `equipmentClassRef → EQC-QUANTSTUDIO5` resolves (EQC GET 200, measured); open EQC-QUANTSTUDIO5 (archived) → RelatedRecordsCard renders its measured related rows (EVT-16E7238BC0C74CFB, EVT-59AE879BB1AB4C31 — measured @ c892847d; audit-events, exemptKinds) and ECP-QUANTSTUDIO5 (whose payload carries equipmentClassRef → EQC-QUANTSTUDIO5, measured) GETs 200 — historical referenceability intact (ruling B, RecordHandlers.ts:255) |
| AC-7 | Direct API content edit on archived still fails | Not a component test — cite the measured probe; optionally a server-pin note that RecordHandlers.ts:1075-1076 already ships this (QMS7-4). No new server code | Gate lap 7 verbatim curl (state-preserving body!): expect **409 `CONTROLLED_RECORD_LOCKED`** on :3092 for EQC-QUANTSTUDIO5; and 422 `LIFECYCLE_TRANSITION_DENIED` if state is dropped (report records both, criterion is the 409) |
| AC-8 | No delete button exists | Test: /registry page render + every list row + archived-open state → zero buttons matching /delete/i, zero DELETE fetches spied | Gate sweep: DOM scan on /registry default view, archived toggle ON, and archived record open — no delete affordance anywhere; grep note that client.ts carries no delete method |
| AC-9 | No undeclared unarchive path | Test: archived record's DocumentControlBar with transitions=[] mock renders NO buttons (only the terminal caption); grep pin: nothing in app/ PUTs `state: "draft"` onto an archived target from the registry surface | Gate: archived EQC shows no actionable transition button (measured transitions [] ) |

## Design decision — the archived-browsing filter (the one genuinely new surface)

Data the list rows actually carry (measured @ c892847d, `GET /api/records?kind=…`): full `RecordEnvelope[]` — `payload.state`, `payload.lifecycleId` present on every governed row; archived rows included; server has NO state param (ListRecordsQuery types.ts:64-81; handler RecordHandlers.ts:415-431 passes only kind/schemaId/idPrefix/limit/offset to `store.list`).

Policy-free rule the design must satisfy: TS may not contain the literal `"archived"` in a filter predicate. The terminal fact lives in YAML (registry-ops.lifecycle.yaml:23 `terminal: true`) and the server engine already reports it data-driven (`LifecycleEngine.terminalStates()` server/src/lifecycle/LifecycleEngine.ts:119-127 — "A plain read-only report of YAML facts — NO terminal-state list is invented in TS"). The client currently has NO way to read that fact (no route exposes it — verified: routes.ts exposes only `/lifecycle/:lifecycleId/transitions` :608; client.ts has no lifecycle-spec method; live probes: GET /api/lifecycles → 404, GET /api/lifecycle/registry-ops → 404). See OQ-1.

## Open questions (recommendations included; OQ-1/OQ-2 are stop-boundaries — do NOT absorb silently)

- **OQ-1 — Where does the client read "terminal" from? (needs orchestrator ruling BEFORE coding AC-5)** Options:
  (A) RECOMMENDED — extend the existing transitions response: LifecycleHandlers.getTransitions adds `terminalStates: [...]` to its body (a 1-line read-only echo of `engine.terminalStates(lifecycleId)`, same precedent as specFor/terminalStates, LifecycleEngine.ts:109-127). The page derives the filter: collect distinct `payload.lifecycleId` values from loaded rows, call getValidTransitions ONCE per lifecycleId WITHOUT recordId (the route already supports recordId-less calls, LifecycleHandlers.ts:44-54 — preview runs from state 'draft'; the ADDED terminalStates field is lifecycle-scoped, not record-scoped), then hide a row iff `terminalStates(lc).has(row.payload.state)`. Cost: one small server handler change + test; client stays free of state strings.
  (B) Enrich `GET /records` rows with a server-computed `terminal` boolean (RecordHandlers list loop). More server surface, pollutes a generic endpoint with lifecycle semantics — not recommended.
  (C) Zero-server: N+1 `getValidTransitions?recordId=` per row; hide rows whose preview is `[]`. Zero policy strings (emptiness-of-transitions is derived from declared YAML) but O(rows) calls per tab and it conflates "no grants visible" edge cases; not recommended.
  (D) Hardcode `"archived"` in the page predicate — REJECTED by convention (hardcoded policy in TS); listed only for completeness.
  If the orchestrator rules (A): server diff is LifecycleHandlers.ts + its test (assert the field equals the YAML-declared terminal set for a REAL loaded lifecycle, W25RegulatedLifecycle.test.ts:50 pattern for loading schema/core/lifecycles) + a client.ts typed accessor; coder flags the stack restart need in the handoff.
- **OQ-2 — Archived read-only enforcement in the editor.** Today `contentLocked` (RecordRegistryPage.tsx:265-268) hardcodes `state === 'approved' || 'effective'` — an archived record currently shows an editable editor whose Save dies at 409 server-side. Options: (A) RECOMMENDED, contingent on OQ-1(A): define read-only = `row is lifecycle-bearing AND terminalStates(lc).has(state)` via the same single data-driven predicate (one mechanism, zero new strings; note this intentionally does NOT extend to approved/effective — leave those to the existing branch). (B) Fallback if OQ-1 rules zero-server: extend the existing hardcoded chain with 'archived' (mirrors the server's own shipped locked-list at RecordHandlers.ts:1075) — policy-string duplication, reviewer bait; only with an explicit orchestrator blessing. (C) Do nothing UI-side (409-on-save only): fails the gate's "opens read-only" pin; not viable.
- **OQ-3 — Draft-copy button on an archived record.** contentLocked-style branches offer "Create draft revision" (RecordRegistryPage.tsx:414-420, draft-copy route routes.ts:227 is DECLARED machinery). If OQ-2(A) lands, archived rows hit the same branch and would show draft-copy. That is NOT an unarchive (it creates a NEW record id; server copies payload with fresh id, RecordHandlers.ts:390-393) — orchestrator: keep (consistent with QMS-6 D6 pattern) or hide on terminal? RECOMMENDATION: keep, and have the gate record the button as evidence-but-not-an-unarchive. Coder implements whichever way the ruling goes; do not decide solo.
- **OQ-4 (minor, resolved locally — no action):** EQC's /related shows only audit-events, not ECP-QUANTSTUDIO5 (measured) — "references resolve" is therefore pinned as: forward refs FROM the opened archived record resolve (EQP→EQC GET 200) AND the referrer ECP GETs 200 while its target is archived (reverse ref readability), per ruling B readability (RecordHandlers.ts:255). If the orchestrator wants ECP listed in EQC's related card, that is a related-records-handler gap — separate item, NOT QMS7-6.

## Files-ownership summary

| File | Change | Expected diff |
|------|--------|---------------|
| app/src/pages/RecordRegistryPage.tsx | toggle + data-driven filter (+ OQ-2 read-only wiring) | yes (core) |
| app/src/pages/RecordRegistryPage.archiveBrowsing.test.tsx | NEW RED-first suite | yes |
| app/src/components/registry/DocumentControlBar.test.tsx | surface-check pins added | yes (tests only) |
| app/src/components/registry/DocumentControlBar.tsx | surface check ONLY | ZERO expected |
| app/src/shared/api/client.ts | only if OQ-1(A) | none by default |
| server/src/api/handlers/LifecycleHandlers.ts (+test) | only if OQ-1(A) | none by default — OQ-gated |
| schema/**, RecordHandlers.ts, routes.ts, docs/** | FROZEN | ZERO |

## Verification commands (complete; expected outputs)

RED first (rule 5): create `RecordRegistryPage.archiveBrowsing.test.tsx` and the DocumentControlBar pin additions BEFORE any product change; RED must show as "no archived-browsing toggle / row not hidden by default" (and the Archive-button pin may land green — it's a pin; say so honestly).

```
# 1. RED gate
pnpm --filter app exec vitest run src/pages/RecordRegistryPage.archiveBrowsing.test.tsx src/components/registry/DocumentControlBar.test.tsx
# expected at base: FAIL on the archived-browsing cases (toggle absent)

# 2. GREEN + no app regressions (after implementation; include QMS7-5's suites — same file)
pnpm --filter app exec vitest run src/pages/RecordRegistryPage src/components/registry
# expected: all PASS (createSearch / qms6e / .test / .archiveBrowsing / DocumentControlBar suites)

# 3. typecheck both workspaces
npm run typecheck          # = tsc --noEmit for server and app
# expected: exit 0 (exactOptionalPropertyTypes sites below)

# 4. server suite — run ALWAYS; if OQ-1(A) landed, the new LifecycleHandlers test must be in the green set
pnpm --filter server exec vitest run src/api/handlers

# 5. live data-fact pins (orchestrator runs post-merge; coder may read-only probe :3092):
curl -s 'http://localhost:3092/api/lifecycle/registry-ops/transitions?recordId=EQC-QUANTSTUDIO5' -H 'x-user-id: USR-QMS-ADMIN'
# expected: state archived, transitions []
curl -s -X PUT 'http://localhost:3092/api/records/EQC-QUANTSTUDIO5' -H 'x-user-id: USR-QMS-ADMIN' -H 'content-type: application/json' \
  -d '{"payload":{"kind":"equipment-class","id":"EQC-QUANTSTUDIO5","displayName":"Archived Probe Edit","lifecycleId":"registry-ops","state":"archived"}}'
# expected: HTTP 409 {"error":"CONTROLLED_RECORD_LOCKED", …}
```

## Worker contract

- Branch: `wt/QMS7-6-lane1-l1t<ts>` off `cl/integration-1` tip AFTER **QMS7-5 has merged** (dispatch gate: QMS7-4 AND QMS7-5 DONE + fleet lock free; task-list.md:4401). Branch off the post-QMS7-5 tip — RecordRegistryPage.tsx line anchors in this spec are @ c892847d and WILL shift; locate by content.
- Worktree: `/mnt/vast/home/brad/git/wt/QMS7-6-lane1-l1t<ts>` (node_modules symlinked per fleet convention). Orchestrator dispatches; fleet coder lock.
- Deliverable: commit(s) on the branch + report `/home/brad/.hermes/cl/lanes/1/qms7-6-report-l1t<ts>.md` + handoff under `.hermes/plans/handoffs/`. End line: `QMS7-6 DONE <sha>`.
- Commit discipline: RED test files land first (or same commit clearly labeled RED-first with the failing output in the message body, per createSearch.test.tsx precedent).
- Never mark done; the orchestrator merges + runs the cl-browser-reviewer gate.
- Rules: no hardcoded policy in TS; declarative/data-driven only; OQ-1/OQ-2 are ruling-gated — if unanswered when coding reaches the filter, STOP and return needs-decision; any YAML demand = platform-gap stop (requires-rescope).
- Lane data discipline: the coder must NOT archive anything on :3092 — EQP-QUANTSTUDIO5 must reach the browser gate still `active` (the gate performs the archive). Read-only curls only.

## Browser-gate flow (orchestrator → cl-browser-reviewer, :5192 / :3092, lane data dir /home/brad/.computable-lab-lane1; NEVER touch :5174/:3001)

Fixtures (all lane-only, verified live @ c892847d): EQP-QUANTSTUDIO5 `state: active, lifecycleId: registry-ops` (SACRIFICIAL — archived during this gate; do NOT plan to reverse it, there is NO unarchive); EQC-QUANTSTUDIO5 already `archived` (terminal, readable); ECP-QUANTSTUDIO5 carries `equipmentClassRef → EQC-QUANTSTUDIO5`; GRANT-QMS7-REGOPS2 is USR-QMS-ADMIN's working registry-ops grant (author+approver; per handoff 20261016T0945). Browser session spoof: `x-user-id: USR-QMS-ADMIN` (cheatsheet :6).

1. Open :5192/registry. Assert zero console errors; Equipment tab default list shows EQP-QUANTSTUDIO5; archived EQC-QUANTSTUDIO5 ABSENT from Equipment-class rows by default (AC-5). No delete affordance in DOM (AC-8 baseline).
2. Pre-denial evidence (recorded, non-destructive — measured to persist nothing): denial curl as USR-BRAD → 422 LIFECYCLE_TRANSITION_DENIED; reload shows EQP still Active (AC-3/AC-4 denial-path consistency).
3. Archive lap: Equipment tab → EQP-QUANTSTUDIO5 → bar shows chip "Active" + button "Archive" (label from transitions DATA, no password modal appears — signature lap is N/A for registry-ops; record yaml :30-33 + curl evidence). Click Archive with network trace open: exactly ONE `PUT /api/records/EQP-QUANTSTUDIO5` 200; ZERO DELETE requests (AC-2). Chip → "Archived"; bar shows "No transitions" + terminal caption; NO unarchive/delete button (AC-9).
4. Post-archive browsing: EQP-QUANTSTUDIO5 vanishes from the default Equipment list (AC-5); toggle archived-browsing ON → it reappears; open it → read-only (no Save; editor fields disabled per OQ-2 ruling), forward reference equipmentClassRef → EQC-QUANTSTUDIO5 resolves (AC-6); RelatedRecordsCard renders without error.
5. Historic fixture: toggle ON → EQC-QUANTSTUDIO5 listed → opens read-only; `GET :3092/api/records/ECP-QUANTSTUDIO5` → 200 (its ref into an archived target still reads — ruling B) (AC-6).
6. Direct-API negative (exact, AC-7): the state-preserving PUT in verification block 5 → **409 CONTROLLED_RECORD_LOCKED** (record the body verbatim; the drop-state variant's 422 is bonus evidence, not the criterion).
7. Sweep: archived toggle ON and OFF, record open and closed — DOM has NO delete button anywhere on /registry (AC-8); code repo `git -C /mnt/vast/home/brad/git/cl-integration-1 status --porcelain -uno` empty. Then VERDICT: accept / fix with defects.
Post-gate state note for QMS7-8 planning: EQP-QUANTSTUDIO5 will be archived (terminal) after this gate — wave-3's later gates must not assume it active.

## Reviewer bait (edge errors likely for THIS item — pre-empt in diff AND report)

1. **The `"archived"` string literal in a TS filter predicate is the #1 bait.** The gate and reviewer will grep the diff for state strings in RecordRegistryPage.tsx. Design under OQ-1(A)/OQ-2(A) → predicate is `terminalSet.has(state)`, zero state literals. UI *copy* ("Show archived") is label text, not policy — but never branch on it.
2. **`state` vs `status` conflation:** equipment payloads carry BOTH (EQP has `status: "active"` too, measured). Lifecycle filter MUST read `payload.state` only. Server precedent: RecordHandlers.ts:289-291.
3. **Wrong negative token:** citing ARCHIVED_TARGET_ASSIGNMENT for the content-edit criterion is wrong (that's assignment-guard, :687/:1109). The content-edit token is 409 CONTROLLED_RECORD_LOCKED and REQUIRES a state-preserving PUT body (drop-state variants hit 422 LIFECYCLE_TRANSITION_DENIED first due to check ORDER, :1042 before :1075 — measured both).
4. **exactOptionalPropertyTypes sites:** the measured transitions row has NO `requires` key. Test fixtures typed against the Transition type (DocumentControlBar.tsx:27-39) must OMIT `requires` entirely — `requires: undefined` is a tsc error under exactOptionalPropertyTypes; follow the existing conditional-spread idiom (client.ts:2454-2456).
5. **YAML-reload trap:** `terminal: true` is read at server boot from registry-ops.lifecycle.yaml. Tests must read the fact through the engine/endpoint (W25RegulatedLifecycle.test.ts:50 loads the real lifecycles dir — use that pattern), never a duplicated TS list. If OQ-1(A) lands, the coder edits NO YAML (a YAML touch would require the orchestrator to restart the stack — handoff flag, not a coder action).
6. **Toggle-vs-refresh race:** refreshRecords uses a request-sequence token (RecordRegistryPage.tsx:90-114) that DROPS stale responses; the archived toggle is render-level state — make sure toggling does not desync when an in-flight tab refresh lands (apply the filter at render time over whatever `records` state holds; do not refetch on toggle).
7. **Optimistic-state lie:** nothing may display "Archived" before the PUT resolves — the bar refetches transitions AFTER success (DocumentControlBar.tsx:103-104) and error paths refetch too (:120); pin it.
8. **QMS7-5 anchor drift:** every line cite here is @ c892847d; the post-QMS7-5 file will differ (CSV mount :497-506 gone, Create button added). Locate by content; a merge-conflict-driven "re-add CsvImportModal" is an instant reject.
9. **Scope creep toward the server:** editing RecordHandlers/lifecycle YAML to "make archive nicer" violates the zero-new-machinery ruling; transitions curl already proves data-complete affordance. If it renders wrong on surface, that's a defect report, not a server patch.

---

## ORCHESTRATOR REVIEW + RULINGS (20261016T1220, tick l1t1212) — PROMOTED, canonical

Anchors re-verified first-hand at post-QMS7-5 trunk 5082ac9b (draft measured @ c892847d):
- transitions curl live again: EQP-QUANTSTUDIO5 => ARCHIVE->archived role approver allowed:true NO requires. EQC/LIVEGATE rows carry payload.state: archived in the list payload. /api/lifecycles => 404. LifecycleEngine.terminalStates exists at :119.
- contentLocked now sits at RecordRegistryPage.tsx:394-397 (post-QMS7-5 drift, exactly as warned — locate by content).
- page has ZERO 'archived' occurrences today (RED premise holds on the merged file).

OQ RULINGS:
- OQ-1: OPTION (A) APPROVED. LifecycleHandlers.getTransitions adds a lifecycle-scoped `terminalStates: string[]` (read-only echo of engine.terminalStates(lifecycleId), same precedent class as specFor). Additive field; recordId-less calls MUST work (page calls once per distinct lifecycleId of loaded rows, no recordId). Server diff = LifecycleHandlers.ts + test (assert against the REAL loaded registry-ops lifecycle per W25RegulatedLifecycle.test.ts:50 pattern) + client.ts typed accessor. This is the ONLY server surface authorized; anything more = stop.
- OQ-2: (A) APPROVED, contingent on OQ-1(A): editor read-only iff row is lifecycle-bearing AND terminalStates(lc).has(payload.state). Zero new state strings. Do NOT touch the existing approved/effective contentLocked branch.
- OQ-3: KEEP draft-copy on archived records (new record id, never an unarchive); the gate records it as evidence-but-not-an-unarchive.
- OQ-4: accepted as-is (forward-ref + referrer-readability pin); ECP-in-EQC related-card = separate item, not QMS7-6.

CORRECTION to draft fact :46 / :150: client.ts DOES contain DELETE methods (removeGroupMember :2032-2036, deleteAiProfile :3357-3362) — the accurate claim (verified by orch grep) is: NO DELETE exists for RECORDS (no deleteRecord; the record-mutation verb is updateRecord PUT only). AC-8 stays "no delete affordance on /registry + zero DELETE fetches spied" — the sweep pin is unchanged, but do not repeat the false 'no delete method anywhere' claim in tests/comments.

CODER NOTE: server diff landed => orchestrator restarts the lane stack post-merge; coder never restarts :3092/:5192. Coder must NOT archive anything on :3092 (EQP-QUANTSTUDIO5 stays active for the gate).
