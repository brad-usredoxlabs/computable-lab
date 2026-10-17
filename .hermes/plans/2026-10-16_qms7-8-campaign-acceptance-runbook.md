# QMS7-8 CAMPAIGN ACCEPTANCE RUNBOOK — PROMOTED (composer l1t1550 retry; orch-promoted 2026-10-16 ~19:35 EDT)

Status: PROMOTED with the orchestrator rulings at the bottom. Dispatch still gated on QMS7-7 merge + lane restart.

## ORCHESTRATOR RULINGS (2026-10-16T1935 tick)

- OQ-1 RULED: seed EQP-QMS8-JOURNEY (Step B/C) + EQC-QPCR substitution for lap 3 is SANCTIONED as the canonical pairing. Basis: archived is terminal in registry-ops.lifecycle.yaml (orch first-hand: `terminal: true` at :23); all records are test data (Brad standing ruling); orch live probes 19:28 confirm EQP/EQC-QUANTSTUDIO5 archived, EQC-QPCR active, EQP-QMS8-JOURNEY absent (seed branch needed).
- OQ-2 RULED: lap-5 draft-copy button VISIBLE + click honestly 422s DRAFT_COPY_UNSUPPORTED = PASS-with-evidence (report the 422 verbatim). Consistent with the QMS7-6 OQ-3 KEEP ruling: the button is not an unarchive affordance and an honest server refusal is correct behavior.
- OQ-3 RULED: no minting. USR-BRAD = the true 422 role-denial arm; USR-NOTGRANT held as the 401 UNAUTHENTICATED arm.
- TOKEN PIN STATUS (AS-ORCH-L1-137 evidence-debt): orch spot-checked live 19:28 — states above, terminalStates served, `?kind=training-material` total 0, ai.available true (model qwen/qwen3.8-flash), DOC-DEMO-SOP state=effective lifecycle document-controlled-signing, guards at document-controlled-signing.lifecycle.yaml:49 (requires_different_person, denialMessage verbatim matches N2 text) and :52/:63 (requires_signature, signatureAction approved) — ORDER confirms the different-person guard fires first, exactly as N2 pins. STILL OPEN as evidence-debt (the negative sweep itself pins them at gate time; run them, do not assume): the pure no-signature branch message for a non-author reviewer (UPV), and the CONTROLLED_RECORD_LOCKED witness on DOC-DEMO-SOP specifically (branch certain at RecordHandlers.ts:1075-1076). Cleared when the sweep captures them verbatim in trail.json.
Item: QMS7-8 "Campaign acceptance: clean restart + end-to-end CRUA journey", lane 1 list.
Token provenance: every expected error token below is (M) = measured live against :3092 in the preserved recon dump (qms78-composer-recon-dump-l1t1830.txt, ~16:45–17:50 EDT today), (L) = live re-probed read-only by this composer at ~19:00 EDT, or (UPV) = UNVERIFIED-PIN with a file:line to check. No token is invented.

## Purpose

One sentence: after a cold restart of the lane-1 stack, a single browser journey plus a curl negative sweep proves the QMS registry behaves as ONE coherent surface across routing (QMS7-1), create (QMS7-5), lifecycle (QMS7-3/4), archive + archived browsing (QMS7-6), and the AI training-draft proposal path (QMS7-7) — with no warm-dev-process trust and no code-repo writes.

## Dispatch gate & worker contract

- dispatch_gate (task list, verbatim): all seven predecessors (QMS7-1..QMS7-7) DONE + fleet lock free. QMS7-7 is IN PROGRESS at this writing (resume run) — the orchestrator must not dispatch before its merge AND a lane restart carrying the sanctioned adapters.yaml block (YAML-reload trap: tsx --watch does not reload YAML; the restart in §Restart is what loads it).
- Executor: cl-browser-reviewer (vision tier-1) with an orchestrator-composed prompt lifted lap-by-lap from §Journey and §Negative sweep. The restart is done by the runner/orchestrator, NOT the executor.
- Branch/worktree: the executor runs NO branch and writes NO code. The witness of "what was tested" is the trunk sha: `git -C /mnt/vast/home/brad/git/cl-integration-1 rev-parse HEAD` (cl/integration-1 tip; branch-name pattern wt/QMS7-8-lane1-* is N/A — no coder leg) recorded as the first trail.json entry.
- Unique deliverable: receipts dir `~/.hermes/cl/receipts/QMS7-8/<UTCtimestamp>/` (§Evidence contract). Report end-line per orchestrator convention; report first line `VERDICT: accept|fix`.
- NEVER: commit to cl/integration-1, hand-edit records YAML or the lane data repo (/home/brad/.computable-lab-lane1 is API-only; all contents are TEST DATA, sacrificial fixtures sanctioned), touch :3001/:5174, restart the stack from the executor seat.
- Browser identity: set `cl.currentUserId = USR-QMS-ADMIN` (AS-ORCH-L1-136: ACL visibility differs under USR-BRAD; QMS7-6 attempt-2's blank list was an identity gap). USR-QMS-ADMIN is the privileged actor (author+approver+reviewer grants present; GRANT-QMS8-ADMIN in the data repo).

## Restart (runner does this)

```
cd /mnt/vast/home/brad/git/cl-integration-1 && bash cl-lane-stack.sh 1 restart
# usage witness: cl-lane-stack.sh <1|2> start|stop|restart|status  (M)
curl -s http://localhost:3092/api/health | head -c 300   # expect {"status":"ok",...}
curl -s http://localhost:5192/api/health  | head -c 300  # expect ai.available:true, model qwen/qwen3.8-flash (M 17:57 + 18:31Z)
```
Post-restart, confirm the backend serves the LANE data dir (log line `Data dir:` /home/brad/.computable-lab-lane1 — OPS-1 witness). The AI lap requires `ai.available:true`; if false, QUEUE the gate (QMS7-7 OQ-3 ruling), never stub.

## First targeted check (proves the approach early, read-only)

```
curl -s -H 'x-user-id: USR-QMS-ADMIN' 'http://localhost:3092/api/lifecycle/registry-ops/transitions?recordId=<SEED-ID>'
```
Expected (L, shape measured for EQP-QUANTSTUDIO5 pre-archive): `{"lifecycleId":"registry-ops","state":"draft|active","transitions":[...],"terminalStates":[...]}` — one command proves routes resolve, data-dir is live, the terminalStates field (QMS7-6 OQ-1(A)) is served, and the seeded fixture exists. Companion: `curl -s -H 'x-user-id: USR-QMS-ADMIN' 'http://localhost:3092/api/records?kind=training-material'` → `{"records":[],"total":0}` (L 19:00 — the AC baseline for the AI lap).

## Fixture pre-flight (MANDATORY — post-gate drift is REAL, measured)

Measured ~19:00 EDT (L): **EQP-QUANTSTUDIO5 and EQC-QUANTSTUDIO5 are BOTH `archived`** (QMS7-6 gate attempt-2 archives, sanctioned). `GET /api/lifecycle/registry-ops/transitions?recordId=EQP-QUANTSTUDIO5` → `{"state":"archived","transitions":[],"terminalStates":["archived"]}`. ECP-QUANTSTUDIO5 exists, payload carries `equipmentClassRef → EQC-QUANTSTUDIO5` (M) — it is the historical-reference witness and must NOT be disturbed.

Key fact: **registry-ops has NO archived→active transition (archived is `terminal: true`, schema/core/lifecycles/registry-ops.lifecycle.yaml)** — a "re-activation" of the QUANTSTUDIO5 pair is IMPOSSIBLE via declared transitions. The pre-flight therefore uses the seed branch (orchestrator ruling OQ-1 pending). Do NOT hand-edit YAML — API only.

Step A — read current states (record raw output in trail.json):
```
for id in EQP-QUANTSTUDIO5 EQC-QUANTSTUDIO5 ECP-QUANTSTUDIO5 EQC-QPCR EQC-HEATER-SHAKER EQC-WATER-BATH; do
  echo "== $id"; curl -s -H 'x-user-id: USR-QMS-ADMIN' "http://localhost:3092/api/lifecycle/registry-ops/transitions?recordId=$id"; echo; done
curl -s -H 'x-user-id: USR-QMS-ADMIN' 'http://localhost:3092/api/records?kind=user' | head -c 400
```
(L 19:00 users: USR-BRAD, USR-GATE-NONADMIN-2335, USR-LOCAL-ADMIN, USR-QMS-ADMIN — all active. USR-NOTGRANT does NOT exist in the store: it resolves to 401 UNAUTHENTICATED (L) — see OQ-3.)

Step B — seed a sacrificial journey fixture (always run; guarantees an ACTIVE plain record for the archive lap regardless of drift):
```
curl -s -X POST http://localhost:3092/api/records -H 'x-user-id: USR-QMS-ADMIN' -H 'content-type: application/json' \
  -d '{"schemaId":"https://computable-lab.com/schema/computable-lab/equipment.schema.yaml","payload":{"kind":"equipment","id":"EQP-QMS8-JOURNEY","title":"QMS7-8 Journey Fixture Autoclave"}}'
# expect 201/200 with record; QMS7-3 stamp-at-create gives lifecycleId registry-ops, state draft (server/src/api/handlers/RecordHandlers.ts:568-595)
curl -s -H 'x-user-id: USR-QMS-ADMIN' 'http://localhost:3092/api/lifecycle/registry-ops/transitions?recordId=EQP-QMS8-JOURNEY'
# NOTE: there is NO /records/:id/lifecycle route (verified @ routes.ts:226-238,608) — state/transitions come ONLY from /api/lifecycle/:lifecycleId/transitions?recordId= (L: the :id/lifecycle form 404s).
# NOTE: the preview's allowed:true is PERMISSIVE (enforceTransitionRoles:false preview, LifecycleHandlers.ts:19-27) — it never proves a role grant; the write path can still 422.
```
Step C — activate it (declared transition draft→active, role author = creator): PUT /api/records/EQP-QMS8-JOURNEY with `{"payload":{...current payload with "state":"active"...},"message":"QMS7-8 pre-flight activate"}` → expect 200, then transitions call shows `state:"active"` with an ARCHIVE transition offered (role approver, allowed:true — M shape at EQP-QUANTSTUDIO5 pre-archive).
If the seed already exists (rerun), GET it; if `active`, skip C; if `archived`, seed `EQP-QMS8-JOURNEY-2`.
Promotion-lap target (lap 3): if EQC-QUANTSTUDIO5 is archived (expected), substitute **EQC-QPCR** (active, registry-ops, M/L) as the seeded EQC the journey edits+saves. Record the substitution in the report; do not archive EQC-QPCR.

## Journey (one browser session, :5192/registry; screenshot per lap; one trail.json entry per lap with lap id, actions, network summary)

Lap 1 — shell + tabs + AI pane (QMS7-1). Open http://localhost:5192/registry. Assert GlobalNavbar, workspace tab strip, universal RightPane render; the 9 registry internal tabs cycle without duplicate workspace tabs; refresh + back/forward keep the registry tab; selecting a record updates the AI-pane context (no stale target). Screenshot `lap1-registry-shell.png`.
Lap 2 — Create a person or equipment draft (QMS7-5). On the People (or Equipment) tab click Create (no failed-search prerequisite) → editor shows the ui-projected draft (readOnly id slot seeded from the schema-declared id pattern) → fill title → Save → row appears without reload; `GET /api/records/<id>` shows `lifecycleId: registry-ops, state: draft`. Screenshot `lap2-create-draft.png`.
Lap 3 — Edit + save a seeded EQC record (promotion). Open the pre-flight ACTIVE EQC (EQC-QPCR if EQC-QUANTSTUDIO5 is archived) → edit a free-text field → Save SUCCEEDS (exactly one PUT /api/records/<id> 200) → hard reload → reopen → edit persisted. `git -C /mnt/vast/home/brad/git/cl-integration-1 status --porcelain -uno` → empty (data writes land in the LANE data repo only). Screenshot `lap3-promotion-saved.png`.
Lap 4 — Archive it. On the pre-flight ACTIVE **EQP-QMS8-JOURNEY** (the sacrificial record — NOT the lap-3 EQC): bar shows chip Active + button "Archive" (label from transitions DATA). Click Archive with network trace: exactly ONE `PUT /api/records/EQP-QMS8-JOURNEY` 200, ZERO DELETE, NO password modal (registry-ops Archive has NO signature guard — a VACUOUS signature lap here is honest and expected, do not fabricate one). Chip → Archived; "No transitions" + terminal caption; NO unarchive/delete affordance. Screenshot `lap4-archived.png`.
Lap 5 — Browse archived + follow a historical reference (QMS7-6). EQP-QMS8-JOURNEY vanishes from default list; toggle "Show archived" ON → reappears → opens READ-ONLY (no Save). Then the historic pair: EQC-QUANTSTUDIO5 listed → opens read-only; `GET /api/records/ECP-QUANTSTUDIO5` → 200 and its `equipmentClassRef → EQC-QUANTSTUDIO5` resolves (ruling B — archived stays historically referenceable); RelatedRecordsCard renders without error. The draft-copy button on archived is EXPECTED per the QMS7-6 OQ-3 ruling (KEEP) and is NOT an unarchive affordance — record it as evidence-but-not-an-unarchive; on an equipment-class target the server click answers 422 DRAFT_COPY_UNSUPPORTED (M; see OQ-2). Screenshots `lap5-show-archived.png`, `lap5-archived-readonly.png`, `lap5-historical-ref.png`.
Lap 6 — Request an AI-proposed training document (QMS7-7). Training tab → right-pane AI tab → scripted prompt: "Create a proposed training document for human review: a slide deck teaching basic pipetting safety." Expect a PROPOSAL CARD (never an instant record). Before accept, read-only curl `?kind=training-material` total must be UNCHANGED (baseline 0, L) — captured in trail. Screenshot `lap6-proposal-card.png`.
Lap 7 — Accept as draft. Click Accept (request carries ONLY {draftId,revision,reviewHash}; network trace shows POST /api/drafts/compile + POST /api/drafts/accept and NO POST /records from the panel). Training tab shows exactly ONE new TRM-... record; lifecycle read = draft (document-control initial; payload carries NO `state` field — QMS7-7 CRITICAL correction); `GET /api/records/<TRM-id>` readback; audit trail names the DRAFT-... id. Screenshot `lap7-accepted-draft.png`.
Lap 8 — Dead-affordance sweep + repo cleanliness. With archived toggle ON and OFF, record open and closed: DOM has NO button matching /delete/i anywhere on /registry (accurate claim: client.ts has NO deleteRecord — DELETE methods exist for groups/AI-profiles but none for records); zero DELETE fetches spied all journey. `git -C /mnt/vast/home/brad/git/cl-integration-1 status --porcelain -uno` → empty. Screenshot `lap8-delete-sweep.png`.

Negative sweep (curl against :3092, after the browser journey; each result captured verbatim in trail.json + a report line). PUT semantics facts: state changes ride **PUT /api/records/:id** (never PATCH); full payload round-trip: GET the record, modify `state`/field, PUT `{"payload":<full payload>,"message":"<why>"[,"signatureRefs":[...]]}` — signatureRefs is BODY-TOP-LEVEL, not inside payload. Draft-copy route: `POST /api/records/:id/draft-copy`.

N1 unauthorized role — archive attempt by a non-approver. PUT EQC-QPCR payload with `state:"archived"` as **USR-BRAD** → expect 422 `LIFECYCLE_TRANSITION_DENIED`, message "You do not have the required role for this transition." (M ×3 @ EQP-BALANCE / EQP-PIPETTE / EQC-QPCR; policy enforceTransitionRoles:deny is set in the lane data repo). Readback must show state unchanged (active). Companion arm (L): same curl as `x-user-id: USR-NOTGRANT` → 401 `UNAUTHENTICATED` "A valid local user is required" — pin as an unauthenticated arm, not a role denial (OQ-3).
N2 missing signature — approve without signatureRefs. Take an in_review controlled-document authored by USR-QMS-ADMIN (M: DOC-QMS8-GATE-233535, DOC-CB8491EEFD03473D exist; if none, lap 7's flow cannot make one — create via Create on Documents tab + submit as a sweep fixture) → PUT `state:"approved"` as USR-QMS-ADMIN with NO signatureRefs → 422 `LIFECYCLE_TRANSITION_DENIED`, message "This transition requires a different person than the author..." (M @ DOC-QMS8-GATE-233535; the requires_different_person guard fires first). The pure no-signature branch message for a non-author reviewer is UNVERIFIED-PIN — the guard itself is real: `requires_signature` (signatureAction: approved) at schema/core/lifecycles/document-controlled-signing.lifecycle.yaml:52 (approve) and :63; check guard ORDER vs requires_different_person (:48ff) and the denialMessages.signature text in the guard translation (lifecycleCompiler.ts / middleware that consumes denialMessages) — run the curl as a non-author reviewer (USR-BRAD holds a reviewer grant per GRANT-DEMO-REVIEWER if lap-7 fixture is unavailable) and record what actually fires. Bogus ref arm (M): `signatureRefs:["SIG-DOES-NOT-EXIST"]` → 422 `INVALID_SIGNATURE_REF` "SIG-DOES-NOT-EXIST is not a signature record".
N3 locked-content write — edit an approved/effective record in place. PUT DOC-DEMO-SOP (effective, L via dump msg 50) as USR-QMS-ADMIN with a changed title (controlled content) → expect 409 `CONTROLLED_RECORD_LOCKED` "Create a new draft to edit an approved or effective document." (M as measured on an archived/effective locked record @ msg 93; the guarded branch is server/src/api/handlers/RecordHandlers.ts:1075-1076 — states list ['approved','effective','superseded','archived'], token certain; the exact effective-doc witness on DOC-DEMO-SOP itself is UNVERIFIED-PIN at that line — run it, do not assume).
N4 governance stripping — drop the lifecycle. PUT EQC-QPCR as USR-QMS-ADMIN with `lifecycleId` REMOVED from the payload → expect 409 `LIFECYCLE_IMMUTABLE` "A controlled record cannot discard its lifecycle." (M @ EQC-QPCR).
N5 archived operational assignment — new ref onto an archived target. POST /api/records as USR-QMS-ADMIN, new equipment `id:"EQP-QMS8-NEGPROBE"` with `equipmentClassRef {"kind":"record","type":"equipment-class","id":"EQC-QUANTSTUDIO5"}` (archived) → expect 422 `ARCHIVED_TARGET_ASSIGNMENT` "EQC-QUANTSTUDIO5 is archived under the registry-ops lifecycle and cannot receive new assignments." (M; record readback afterwards must be 404 — nothing persisted).
N6 AI direct-write attempt — bypass the trust boundary. POST /api/drafts/accept as USR-QMS-ADMIN with a payload-resubmit body (no reviewHash / wrong shape, e.g. `{"draftId":"DRAFT-NOPE"}`) → expect 422 `DRAFT_FAILED` "/reviewHash: Must match pattern: ^[a-f0-9]{64}$" (M) or 404 `DRAFT_FAILED` "Draft not found." (M); a compile with unknown adapter → 422 `DRAFT_FAILED` "Unknown form draft adapter." (M — if this STILL fires at lap-6 time, QMS7-7's adapter is not loaded: that is a restart/merge blocker, not a journey defect). Whole-journey witness: zero POST /records or POST /api/drafts/accept from AI-panel traffic except the human Accept click.
Negative-claim rule: every "nothing happened" assertion (404 readback, total still 0, unchanged state) is re-verified by a fresh GET AFTER the denial, captured in the same trail entry.

## Suites gate (after the journey, orchestrator or runner)

```
cd /mnt/vast/home/brad/git/cl-integration-1/server && npx vitest run
cd /mnt/vast/home/brad/git/cl-integration-1/app    && npx vitest run
cd /mnt/vast/home/brad/git/cl-integration-1        && npm run typecheck -w app   # exit 0 (app baseline 0 errors)
```
Baselines: app full-suite carries 6 PRE-EXISTING failures (AS-ORCH-L1-102, at eafd8442) — the bar is ZERO NEW failures, report the delta; server tsc baseline is NOT exit-0 (23 pre-existing event-editor errors, QMS7-5 gate precedent) but server is not in this gate's typecheck command — vitest only. `npm run typecheck -w app` IS exit-0. git status check: `git -C /mnt/vast/home/brad/git/cl-integration-1 status --porcelain -uno` → empty (lap 8 re-checks).

## Evidence contract

Receipts dir `~/.hermes/cl/receipts/QMS7-8/<UTC timestamp>/`: `trail.json` (one entry per lap/negative: actions, exact curl + raw response for negatives, network summary for browser laps, trunk sha first, pre-flight raw outputs), one screenshot per named lap (filenames exactly as in §Journey; negatives need none — raw responses are the evidence), `report.md` with first line `VERDICT: accept|fix`, each lap/AC cited with absolute screenshot paths and the route explicitly recorded (AS-ORCH-L1-135 convention), negative claims cited to re-verify reads. No dead affordance may appear in the packet unaddressed.

## Facts the executor must honor (condensed)

PUT not PATCH for state; signatureRefs body-top-level; draft-copy = POST /records/:id/draft-copy (new id, never an unarchive); USR-QMS-ADMIN privileged, USR-BRAD/USR-GATE-NONADMIN-2335 for denials; USR-NOTGRANT = 401 arm only; Archive on registry-ops has NO signature guard (vacuous lap honest — do not simulate a modal); archived opens read-only; draft-copy on archived EXPECTED, not unarchive (OQ-3 ruling); no delete button exists anywhere; `git status --porcelain -uno` on the CODE repo is the cleanliness check (the lane DATA repo legitimately churns via API writes — that is not a finding); "Show archived" is label copy, never policy text.

## Reviewer bait / honesty guards for this runbook

1. Faking the signature lap: registry-ops Archive is signature-free BY DATA — a report claiming a password modal at lap 4 is fabricated.
2. Stale-fixture assumptions: the journey targets were QUANTSTUDIO5 in earlier specs; the pre-flight substitution is mandated — running the old text verbatim against archived records is the known drift trap.
3. Token drift: DRAFT_COPY_UNSUPPORTED on archived equipment-class (M, RecordHandlers.ts:379 restricts draft-copy to protocol/controlled-document) vs the OQ-3 "keep the button" ruling — report which the UI actually does; do not silently score either way (OQ-2).
4. "No delete method anywhere" is FALSE (client.ts has removeGroupMember/deleteAiProfile); the pin is no RECORD delete affordance on /registry + zero DELETE fetches.
5. Warm-process trust: any lap result taken before the restart completes is void; health curls first.

## Open questions (orchestrator rules; composer checked each)

- OQ-1: The task text says re-activate or seed; registry-ops archived is TERMINAL — no transition can unarchive. The pre-flight uses the seed-equipment branch (Step B/C) and promotes EQC-QPCR as the lap-3 promotion target when EQC-QUANTSTUDIO5 is archived (measured archived ~19:00). Checked: registry-ops.lifecycle.yaml (transitions draft→active, [draft,active]→archived only; archived terminal:true); live transitions probes both records. Need: ruling that seed-fixture + EQC-QPCR substitution is sanctioned as the canonical lap-3/lap-4 pairing.
- OQ-2: QMS7-6 OQ-3 ruling KEEPS the draft-copy button on archived records, but the server rejects draft-copy for non-protocol/controlled-document kinds with 422 DRAFT_COPY_UNSUPPORTED (RecordHandlers.ts:379; live-probed on archived equipment-class, dump msg 111). Lap-5 expectation: button visible + click honestly fails = PASS, or button visible + click = defect? Composer recommends PASS-with-evidence (consistent with "evidence-but-not-an-unarchive").
- OQ-3: The 15:45 handoff and QMS7-6 attempt-2 prompt reference a "USR-NOTGRANT denial curl", but USR-NOTGRANT is not in the user store (L: 401 UNAUTHENTICATED; users live: USR-BRAD, USR-GATE-NONADMIN-2335, USR-LOCAL-ADMIN, USR-QMS-ADMIN). Runbook uses USR-BRAD for the true role-denial (422) + USR-NOTGRANT as a 401 arm. Need: confirm, or mint USR-NOTGRANT via API pre-gate if a grant-less registered user is wanted.
COMPOSER DONE QMS7-8 20330
