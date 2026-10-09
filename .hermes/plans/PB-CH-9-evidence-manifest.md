# PB-CH-9 Evidence Manifest — integrated campaign browser gate (Half A) ↔ verified-by clauses

Status: PRE-REGISTERED at worker claim (2026-10-09, tip f9eba9cf / code tip c74c5214). Half A is
ORCHESTRATOR-AUTHORED (deterministic-script gate on :3093/:5193, single vision slot, serial); the
worker authored NO gate script and touched NO stack. This manifest maps EVERY planned gate
artifact (legs 0-8) to the verbatim verified-by clause it proves, pins the claim-time facts, and
reserves the disposition slots. Gate-run trail entries (receipts dir
`/home/brad/.hermes/cl/lanes/2/receipts/PB-CH-9/<ts>/`) fill the artifact columns when the gate
runs; a slot without an artifact is NOT RUN-BLOCKED, never silently passed.

Verified-by source: task-list PB-CH-9 block (:1959-1968), quoted verbatim in the spec
(`.hermes/plans/2026-10-07_1550-PB-CH-9-integrated-gate-runbook.md:40-49`).

## Claim-time facts (re-measured by this worker unless marked carried)

| Fact | Value | How measured |
| --- | --- | --- |
| Session pin baseline (USR-BRAD main.yaml) | `406bd1c6710c02f863f50d8a809f7dd31efb6df813f3d6abf3d8e4431b465d36` | `sha256sum /home/brad/.computable-lab-lane2/worktrees/main/var/sessions/USR-BRAD/main.yaml` at 2026-10-09 00:0x EDT. SUPERSEDES the composition pin 8107ef6e… (PB-CH-8 gate accept legs moved it legitimately — handoff 2026-10-08_2350 :52-57). |
| Pin three-way semantics (spec OQ2 answer) | (a) pre-gate baseline; (b) INVARIANT within pending/rejected legs (2/3 byte-identity anchor); (c) teardown-restore target (restore snapshot copy + paste final sha == baseline). Legs 1/5/6/7 LEGITIMATELY move main.yaml — that is the feature; "you broke the pin" vs "the feature pushed" is defused by this three-way reading. | Spec :425-432; carried ruling. |
| PB-CH-8 merge ancestor | `55319ef2` IS an ancestor of HEAD (f9eba9cf); code tip c74c5214 IS an ancestor | `git -c core.fileMode=false merge-base --is-ancestor` re-run by this worker. PB-CH-8 gate closure of record: task-block DONE + `receipts/PB-CH-8/2026-10-08_ledgerfixed{,2c}` (legs 2c+6 green, orch-judged, handoff ac31a23e) + gate-run-8 legs 1/3/4/5 — carried from handoff 2026-10-08_2350 :118-120. |
| Leg-8 REUSE receipts (present on disk) | `/home/brad/.hermes/cl/receipts/PB-CH-6/2026-10-08_orchgate2/generic-literature-proposal.png` (116575 B) and `generic-literature-action.png` (116575 B) | `ls -la` re-run 2026-10-09. Same product build lineage; PB-CH-6 OQ1 ruling fixes `<approved-surface-id> = literature` (`PB-CH-6-report.md:17`). |
| Restart-after-PB-CH-8 obligation | Satisfied and continuously held (stack serving current tip; journal policy re-read per call, no pending YAML obligation) | Carried from handoff 2026-10-08_2350 :25-26; worker performed NO restart (hard rule). |
| Leg-0 preflight | GREEN early at 23:38 EDT (health 200, served-module assert, ancestor checks, session hash) | Orchestrator-run (spec claim-gate item 5); carried. Worker re-ran only the ancestor asserts. |
| Budget | 5 sends (legs 1,2,3,4,5) + leg 7 conditional 6th; leg 8 = REUSE (0 sends). Cap: 6 sends total; >6 = invalid gate regardless of shots. `retryUntilVisible` plan-data waits absorb waiting WITHOUT extra sends (`~/.hermes/cl/browser-receipts/harness/capture.ext.spec.ts`). | Spec :207-210, :414-415. |

## Leg-by-leg mapping: artifact -> verbatim verified-by clause

### Leg 0 — preflight (0 sends)
- Proves: gate validity precondition (served-checkout assert, PB-CH-6 precedent; run-8 lesson —
  a stale serving checkout yields an INVALID verdict, not a defect).
- Artifacts: trail.json preflight block — `GET :3093/api/health` 200 (never probe `/`);
  `GET :5193/src/shared/ai/useWorkstateProposalFlow.ts` served-module grep assert; ancestor
  checks; `GET :3093/api/session` (x-user-id USR-BRAD) hash == claim-time pin (on-disk file hash
  is the pin, not the wire serialization — handoff :58-59).
- Failure => VERDICT: blocked at preflight, zero budget spent.

### Leg 1 — "tier-1 arrival" + "unsaved-work preservation" (1 send)
- Clauses: "tier-1 arrival" and "unsaved-work preservation" (verbatim).
- Run surface `/runs/RUN-2026-09-19-run-vwr8` (App.tsx:190 route). Seed unsaved value (persist
  its selector in trail); fresh thread; tier-1 navigation ask. Asserts: tab appears in tab strip
  (rect/testid), context header reflects new working focus, unsaved value SURVIVES, exactly one
  `PUT /api/session` follows.
- Screenshot: **final-run-focus.png** (exact name).
- ALSO satisfies the carried **run-channel-regression re-run obligation** (see disposition slots):
  this leg IS the clean re-run of the run-channel arm on the integrated gate.

### Leg 2 — "unresolved no-op" (1 send)
- Clause: "unresolved no-op" (verbatim).
- Ask an unregistered surface/term. Asserts: visible compile diagnostic (trail names the exact
  selector probed — never `.chat-page__msg`), ZERO tab movement: tab-strip DOM identical,
  `GET /api/session` byte-identical before/after (paste both hashes).

### Leg 3 — "pending/rejected no-push" (1 send)
- Clause: "pending/rejected no-push" (verbatim).
- compose_workstate turn on the run surface; card renders (data-testid `workstate-card`,
  WorkstateProposalCard.tsx:78; accept :128, reject :131). While PENDING: `/api/session` hash
  unchanged (pin invariant (b)); after Reject: hash STILL unchanged, tab store DOM unchanged.
- Screenshot: **final-pending-unchanged.png** (pending state, before the click — exact name).

### Leg 4 — "revision recompiles" (1 send)
- Clause: "revision recompiles" (verbatim).
- Measurement, not screenshot, per verified-by: SECOND `POST /api/drafts/compile` with advanced
  draft revision (draftId continuity in the capture — FormDraftService.ts:71/:78 semantics), card
  re-renders recompiled content. Trail entries both sides (network window pasted).

### Leg 5 — "analysis acceptance" + "zero accept-time AI calls" (1 send)
- Clauses: "analysis acceptance" and "zero accept-time AI calls" (verbatim).
- `/analysis` (App.tsx:206; AnalysisChatPanel data-testid `analysis-chat-panel`, :72), fresh
  thread, analysis composition ask; composition/ViewRenderer region measured before/after.
- Network-capture window FROM Accept-click TO settled state (reviewer MUST paste it; absent
  capture = unproven = not accepted): exactly ONE `POST /api/drafts/accept`, ZERO
  `POST /api/ai/assist/stream`, exactly ONE `PUT /api/session` within ~1.5 x PUSH_DEBOUNCE_MS
  (500 ms, useSessionSync.ts:24/:154). A leg showing an assist/stream hit is INVALID, not a defect.
- Screenshots: **final-analysis.png** and **final-accepted-A.png** (exact names; same measurement,
  second pane crop).

### Leg 6 — "BOTH workstate classes prove accept-in-A => visible-in-B with network evidence on the existing push/attach path" (0 sends)
- Clause: verbatim (both classes = the tier-1 opened tab AND the tier-2 accepted tab).
- Context B on :5193; focus event triggers ATTACH (`GET /api/session` only). Network evidence: B
  performs GET only (NO PUT from B, no assist/stream near the attach); B's DOM reflects A's state:
  tab strip contains BOTH the Leg-1 tier-1 tab AND the Leg-5 tier-2 tab(s).
- Screenshot: **final-attached-B.png** (exact name).

### Leg 7 — "(if unblocked) historical reattachment" (0-1 send) — UNBLOCKED at claim
- Clause: "(if unblocked) historical reattachment" (verbatim). UNBLOCKED: PB-CH-8 merged
  (55319ef2 ancestor, re-verified) AND its gate at accept (ledgerfixed/2c receipts, orch-judged).
  If any merged shape is missing at gate time, record NOT RUN-BLOCKED with the exact missing
  artifact — never as passing.
- Instantiate from the MERGED shape (runbook §7): ask the seeded fixture batch (RUN-2026-09-19-run-vwr8)
  in the run chat; expect the `ledger_answer` frame (assistStream.ts:265) with `capturedAt`
  disclosure wording "as captured at" (ledgerQuery.ts:377-380 — NEVER "as of"), `asOf?`/
  `capturedAt?` optional-by-contract, and the SAME tier-2 card (`workstate-card` testid;
  server-built `ServerBuiltWorkstateEnvelope`, ledgerQuery.ts:95, emitted AgentOrchestrator.ts:2443).
  Journal seeding per runbook §8 (real policy-passing PUTs, >30 s apart; never hand-written files).
- Screenshot: **ledger-final-reattach.png** (exact name).

### Leg 8 — "+ approved generic-surface shot" (0 sends — REUSE path chosen)
- Clause: "the PB-CH-6 approved consumer" / "approved generic-surface shot" (verified-by) +
  spec OQ3 recommendation (reuse the accepted PB-CH-6 receipt; it is exactly that evidence).
- REUSE artifacts (present, verified above): `receipts/PB-CH-6/2026-10-08_orchgate2/`
  **generic-literature-proposal.png** + **generic-literature-action.png** (`/literature?view=build`,
  PdfProtocolBuilder — the ONE generic consumer mount, PdfProtocolBuilder.tsx:137). Cited into
  this manifest with their receipts path; NO new send. Fallback (1 send, only if a leg was
  skipped and budget remains): fresh context, one ask, screenshot `final-generic-surface.png`
  (name it so in the manifest if the orchestrator renames).
- Note carried honestly: `literature` is NOT a registered surface id (surfaces.yaml 10 ids,
  :19-:83); a model proposing `knowledge` from this pane is registry-mapping, recorded not failed.

## Suite outputs (verbatim clause: "run compiler, draft, session, streaming, analysis, and ledger suites")

All commands re-baselined at gate time by the orchestrator; bar = FILE-SET identity vs claim-time
capture (comm -3 empty), NOT pass counts. surfacesAjv excluded by scoping (gitignored symlink
into Brad's tree, 5 known fails — NEVER "fix").

| Suite | Command | Claim-time baseline (carried unless noted) |
| --- | --- | --- |
| Compiler | `cd server && npx vitest run src/compiler` | fail-file SET 17 at 96a68195; RE-MEASURE at gate tip (SPINE-6 goldens may add green files) — handoff 2026-10-08_2350 :91-92 |
| Draft | `cd server && npx vitest run src/drafts` | zero NEW failures vs claim capture |
| Session (server) | `cd server && npx vitest run src/workspace-session src/api/routes` | 11 files / 116 tests / 0 failed @ 3b9e2a18 (spec pin; re-measure) |
| Session (app) | `cd app && npx vitest run src/shared/session` | 7 files / 70 tests / 0 failed |
| Streaming | `cd app && npx vitest run src/event-editor/right-pane/ai` | set-diff vs claim set; src/ai-adjacent fail-set 10/21 carried (handoff :111) |
| Analysis | `cd server && npx vitest run src/analysis` + `cd app && npx vitest run src/analysis` | zero NEW failures |
| Ledger | `cd server && npx vitest run src/workspace-session` | post-PB-CH-8: WorkstateJournal/ledgerQuery suites green-by-definition once merged — paste counts |
| Typecheck server | `npm run typecheck -w server` | spec pin 26 error lines / 6-file SET identity; handoff measures 15 msgs/6 files MESSAGE-NORMALIZED at c74c5214 (`/tmp/l2t2230-tsc-server.txt`) — the SET identity is the gate, both conventions recorded |
| Typecheck app | `cd app && npx tsc --noEmit` | 47 out-lines == 34 error-lines convention (AS-LANE2-APP-TSC-PIN-47-24, 24-file SET identity) |
| Full app | `cd app && npx vitest run` | failing-FILE-SET set-identical to claim-time capture (spec composition pin: 53 files) |

Worker honesty note: this worker did NOT run any suite (docs-only item; worktree has no
node_modules bootstrap by design). Baselines above are carried from the spec pin table + handoff
2026-10-08_2350 baseline facts; the orchestrator re-measures them at gate time.

## Red-before-green + defect handling

- PB-CH-9 changes no behavior; the clause "New defects get failing tests before fixes" is a gate
  OUTPUT: any gate-found defect gets a defect entry naming its RED test BEFORE any fix dispatch
  (separate coder dispatch, fleet lock), then the affected leg re-runs green post-fix. Paste both.
- Every 404/blank claim re-verified via API + reload before entering the report (two
  false-positive incidents on record). Every negative claim names the exact selector probed.
- exactOptionalPropertyTypes note for any fix dispatch: backend optional fields mean
  absent-never-undefined (lane header rule).

## Disposition slots (OWED AT CLOSE — worker does NOT close them)

1. **run-channel-regression arm — RE-RUN OBLIGATION (open until the integrated gate proves it clean).**
   History: INCONCLUSIVE at PB-CH-6 close-gate (stream unsettled in 140 s window; send reached
   backend req-3k; deck card path separately proven via orchgate5/6) — carried to PB-CH-9, NOT
   claimed as passing (handoff 2026-10-08_1600 :23-25, :57). The integrated gate must re-run it
   clean; Leg 1 (run surface, tier-1 arrival, final-run-focus.png + one-PUT measurement) is the
   re-run vehicle. Slot closes only when the gate trail shows the settled run-channel evidence.
2. **AS-LANE2-PBCH6-ANR-UISPEC-GAP — EVIDENCE DEBT, DISPOSITION OWED AT PB-CH-9 CLOSE.**
   Substance: ANR-000002 -> `UI_SPEC_NOT_FOUND` for `analysis-run.schema.yaml` — no `.ui.yaml`
   triplet companion exists at c74c5214 (verified by find: only
   `schema/knowledge/analysis-run.schema.yaml`). Evidence:
   `receipts/PB-CH-6/2026-10-08_l2t1535close/analysis-visible-in-B.png` (present, 66006 B,
   re-listed) + handoff 2026-10-08_1600 :54-56. The runbook documents the missing triplet as
   known-unsupported (runbook §10). DISPOSITION (accept as known-unsupported / dispatch a
   triplet-fix item / other) belongs to the orchestrator + architect AT CLOSE — this worker
   files it and does NOT close it. Marked: **OWED AT CLOSE**.
3. Wave-note milestone slot: if the gate downgrades to wave-1 scope (trigger conditions, spec
   :331-337), wave-1 (PB-CH-1..4) acceptance reports as its own milestone; Leg 7 +
   ledger-final-reattach.png + the ledger runbook section drop to NOT RUN-BLOCKED; campaign
   completion stays blocked on the ledger. At claim time the UNBLOCKED reading holds (fact table
   above), so the FULL gate is the default.

## Screenshot inventory (verbatim names — any rename/merge/omission = invalid gate)

| Name | Leg | Status at manifest authoring |
| --- | --- | --- |
| final-run-focus.png | 1 | reserved (gate-owned) |
| final-pending-unchanged.png | 3 | reserved (gate-owned) |
| final-accepted-A.png | 5 | reserved (gate-owned) |
| final-analysis.png | 5 | reserved (gate-owned) |
| final-attached-B.png | 6 | reserved (gate-owned) |
| ledger-final-reattach.png | 7 | reserved (leg unblocked at claim) |
| approved generic-surface shot = generic-literature-proposal.png + generic-literature-action.png (REUSE) | 8 | EXIST + verified on disk (paths above) |
