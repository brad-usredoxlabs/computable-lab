# Architect decision request — QMS7-7 DEFECT 1: human-reviewed record-drafting proposal classified as `auto-create` under POL-REGULATED

Requested by: lane-1 orchestrator tick, 2026-10-16 ~22:55 EDT.
Decision path (write your ruling HERE): /mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-16_qms77-autocreate-policy-ruling.md

## Observed (browser gate receipts, tier-2 reviewer, full trail)

Receipts: /home/brad/.hermes/cl/receipts/QMS7-7/20261016T2245/ (trail.json 47 steps, report.md, 40+ shots).
Served candidate: trunk cl/integration-1 @ bd02aa39 descendant; :5192/:3092; actor USR-QMS-ADMIN.

In :5192 /registry Training tab, the scripted AI prompt yields a well-formed proposal card
(ID TRM-000001, valid fields, server-compiled envelope), but the card renders phase `blocked`
with ONLY a Reject button and the diagnostic:
`POLICY_BLOCKED: Auto-create for TRM-000001 is deny by POL-REGULATED.`
No Accept control ever renders. AC-4 (accept -> exactly one draft record) is unmeetable in a
regulated lab. Every other lap passed (reject persists nothing; negative lap fails honestly;
no console errors; panel never POSTs /records directly).

## Root cause (orchestrator first-hand)

- The record-drafting adapter stages the proposal via the staging store; the compile pass runs
  the CompilerKernel policy decision, and `auto-create` is the requestedAction class
  (server/src/compiler/CompilerKernel.ts:54, :106-125; actionLabel PolicyProfileService.ts:157).
- POL-REGULATED (schema/core/policy-bundles/regulated.policy-bundle.yaml) sets
  `allowAutoCreate: deny` -> decision 'blocked' -> card phase blocked, canAccept:false.
- Semantics conflict: nothing is auto-created. A HUMAN reviews the card and clicks Accept;
  the write goes through the FormDraftService accept loop (reviewHash re-check, full
  re-evaluation, owner-policy, audit `Accept draft <id>`). The `auto-create` label fits the
  machine-deposits-record-without-review case (protocol/lab material auto-deposition), not
  human-confirmed draft acceptance.
- As shipped, the AI drafting feature is DEAD under POL-REGULATED while the manual Save
  equivalent works (RecordHandlers createRecord does not run this policy at all — OPS-1
  carried finding: getAuthoringPolicy unwired): same lab, same actor, manual create works,
  AI-proposed-and-human-accepted create is permanently blocked. Two regimes for one act.

## Options (choose one, or amend)

A. Product ruling: record-drafting acceptance is NOT an `auto-create` policy action — exempt
   it from the auto-create gate (the human Accept click IS the confirmation the policy
   protects). Implementer change: recordDraftCompile/adapter stops requesting the
   auto-create action for this domain (declared in config/drafting/adapters.yaml domain
   block if it needs a data switch — no hardcoded spec names).
B. Platform ruling: `auto-create` correctly covers it; the AI drafting panel is by-design
   permissive-bundle-only. Then: gate runs under POL-SANDBOX (orchestrator already flipped
   the lane config; see handoff), and the regulated-lab dead-feature + manual/AI asymmetry
   gets a documented ruling in the actor matrix / principles.
C. Something narrower you prefer (e.g. `confirm` semantics for drafting under regulated:
   card shows accept WITH an explicit confirmation affordance).

## Orchestrator interim action (already taken, reversible, no product code)

Lane runtime config /home/brad/.hermes/cl/lanes/1/lane1-config.yaml:53 flipped
POL-REGULATED -> POL-SANDBOX (gitignored runtime file; PATCH /api/config is dead per
2026-10-04 finding). Stack restarted. This UNBLOCKS the QMS7-7 AC-7 gate under the
permissive bundle. Recorded as AS-ORCH-L1-147 (evidence-debt TRUE until you rule).
NOTE for QMS7-8: its runbook N1 arm expects POL-REGULATED role-denial semantics — the tick
before the QMS7-8 gate must flip the config BACK to POL-REGULATED and restart.

Your ruling must state which option, and whether a coder fix run is required for QMS7-7
(option A/C => yes, fix run on wt/QMS7-7-lane1-l1t1500 + re-gate under POL-REGULATED;
option B => no code change, current gate re-run under POL-SANDBOX closes the item with the
asymmetry documented).
