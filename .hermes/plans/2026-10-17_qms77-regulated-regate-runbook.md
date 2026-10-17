# QMS7-7 / QMS7-8 POL-REGULATED RE-GATE RUNBOOK (single combined browser gate)

Composed by the lane-1 orch tick 20261017T0040, pre-staged for the QMS7-7 fix-2 MERGE tick.
Authority: architect ruling `.hermes/plans/2026-10-16_qms77-autocreate-policy-ruling.md`
(§"Required orchestrator/coder actions" item 5 + §"Disposition" + §"How the wave-3 campaign gate
closes for lap 7"). Scope is DELIBERATELY reduced by ruling — laps 1-5 and 8 of the QMS7-8
campaign gate (receipts QMS7-8/20261016T2340/) STAND; do not re-run them.

One combined gate satisfies BOTH re-gates: ruling §5 (QMS7-7 AC-4/AC-7 under POL-REGULATED)
and ruling campaign-closure (QMS7-8 laps 6-7 + reject + one negative probe). The surfaces are
identical (registry Training tab, proposal card, accept loop).

## Fill at dispatch (the merge tick)

- `PINNED_SHA`   = `git -C /mnt/vast/home/brad/git/cl-integration-1 rev-parse HEAD` AFTER the
  fix-2 merge AND after this packet + the flip-restart are committed. Trunk is then FROZEN:
  no trunk commits of any kind until the gate renders its VERDICT (ruling D4 lesson).
- `RECEIPTS`     = `~/.hermes/cl/receipts/QMS7-7-REGATED/<UTCstamp>/` (unique dir).
- `LOG`          = `~/.hermes/cl/lanes/1/logs/browergate-QMS77reg-l1t<ts>.log` (unique).
- Prompt ends with exactly: `BGATE-QMS77REG EXITED code=<n>` .

## Tier

TIER-2 UP FRONT: `hermes -p cl-browser-reviewer -m deepseek/deepseek-v4.1-flash`
(tier-1 qwen35-4b-vision died twice on this exact plan-replay class on 2026-10-16 evening;
SOUL 6c ladder says do not blind-repeat the failed tier). Record the tier in report.md.

## Pre-flight (orchestrator or runner, BEFORE dispatching the reviewer; raw outputs into the
packet dir as `preflight/`)

1. Preconditions proven, not assumed:
   - fix-2 merged into `cl/integration-1` (rev-parse tip recorded).
   - `lane1-config.yaml:53` reads `POL-REGULATED`; `/home/brad/.hermes/profiles/orchestrator/scripts/cl-lane-stack.sh 1 restart` run with background=true (the script BLOCKS; foreground would time out at 600s and leave the stack down).
2. Health curls (warm-process trust guard): `GET http://localhost:3092/api/health` (or /api/config) 200; `GET http://localhost:5192` 200.
3. Bundle pin: `GET http://localhost:3092/api/config` shows `lab.policyBundleId` = `POL-REGULATED` AND `ai.available` true. Raw JSON into preflight/. If the bundle is not POL-REGULATED, ABORT — do not dispatch.
4. AC baseline: read-only curl the training-material registry total; record exact JSON (the 2026-10-16 gate established this channel; expected baseline per lane data, captured verbatim — do not assume a number).
5. `git -C /mnt/vast/home/brad/git/cl-integration-1 status --porcelain -uno` empty; trunk tip sha recorded as PINNED_SHA.

## Laps (browser, http://localhost:5192, reviewer-driven; registry Training tab per the
QMS7-8 runbook journey — RecordRegistryPage, AI tab in the right pane)

- **G1 — Proposal card renders REVIEW, not blocked (lap 6 + AC-4).** Prompt: "Create a
  proposed training document for human review: a slide deck teaching basic pipetting safety."
  PASS = a PROPOSAL CARD with an ENABLED Accept control renders. Any `POLICY_BLOCKED` text or
  Reject-only card (WorkstateProposalCard blocked phase) = VERDICT fix, screenshot
  `g1-proposal-card.png` regardless. Before the request, re-capture the training-material
  total (must equal pre-flight baseline).
- **G2 — Accept as draft (lap 7 + AC-7).** Click Accept. Network trace shows
  `POST /api/drafts/compile` + `POST /api/drafts/accept` and NO `POST /records` from the
  panel. Exactly ONE new `TRM-` record in the Training tab; `GET /api/records/<TRM-id>`
  readback shows lifecycle draft state, payload carried no `state` field; audit trail names
  the `DRAFT-` id. Screenshot `g2-accepted-draft.png`.
- **G3 — Reject lap persists nothing.** Request a second proposal, click Reject.
  Training-material total returns to / stays at the G1 baseline (fresh GET AFTER the reject —
  negative-claim rule). Screenshot `g3-rejected.png`.
- **G4 — Negative witness (N6-class regression probe, curl).**
  `POST http://localhost:3092/api/drafts/accept` as `x-user-id: USR-QMS-ADMIN` with body
  `{"draftId":"DRAFT-NOPE"}` (no reviewHash) → expect 422 `DRAFT_FAILED` with the reviewHash
  pattern message (or 404 `DRAFT_FAILED` "Draft not found.") — capture the RAW response body
  verbatim; this is a witness of the accept-loop integrity the ruling preserved, so any 2xx
  or policy-bypass-shaped success = VERDICT fix with the raw body quoted.

Facts to honor (condensed from the QMS7-8 runbook §"Facts the executor must honor"): PUT not
PATCH for state; signatureRefs body-top-level; the lane DATA repo legitimately churns via API
writes — `git status` cleanliness refers to the CODE repo only; do not simulate a password
modal that the data does not gate.

## Evidence contract

Receipts dir `RECEIPTS`: `trail.json` (first entry = PINNED_SHA + the two config curls; one
entry per lap with actions, raw curl+response for G4, network summary for browser laps),
screenshots named exactly `g1-proposal-card.png`, `g2-accepted-draft.png`,
`g3-rejected.png`, `report.md` first line `VERDICT: accept|fix`, every lap cited with
absolute screenshot paths and the explicit route (AS-ORCH-L1-135 convention), negative claims
cited to their fresh-GET re-verifies.

## On VERDICT accept (merge-tick close-out order)

1. QMS7-7 reopen closes; QMS7-8 closes (prior laps 1-5/8 + N1-N6 receipts stand per ruling).
2. AS-ORCH-L1-147 CLOSED as superseded by the ruling (POL-SANDBOX interim revoked; bundle
   restored + re-gate receipts = evidence-debt cleared).
3. Wave-3 campaign close-out handoff; surface AS-ORCH-L1-145 (D2) to Brad as a queue
   proposal, not invented scope.

## On VERDICT fix

Route the defect list (absolute screenshot paths) to a coder fix run on
`wt/QMS7-7-lane1-l1t1500` (fleet lock rules), max two cycles, then architect with evidence.
Do NOT re-open laps 1-5/8 — ruling forbids full campaign re-gate.
