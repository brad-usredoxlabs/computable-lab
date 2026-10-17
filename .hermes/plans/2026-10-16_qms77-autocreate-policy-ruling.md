# ARCHITECT RULING — QMS7-7 auto-create classification under POL-REGULATED

RULING: OPTION A

Ruled by: cl-architect, 2026-10-17 (EDT). Final unless Brad overrides.
Decision request: .hermes/plans/2026-10-16_qms77-autocreate-policy-decision-request.md
Confirming evidence: /home/brad/.hermes/cl/receipts/QMS7-8/20261016T2340/report.md §D1

## Rationale

`auto-create` in this codebase has one precise semantic: the compiler resolves a
`new-record` binding and the machine deposits a record WITHOUT a human review act
(`server/src/compiler/CompilerKernel.ts:53-54` — `case 'new-record': actions.push({action:
'auto-create', ...})`; the `blocked` disposition follows at :106-126). That is what
`allowAutoCreate: deny` in `schema/core/policy-bundles/regulated.policy-bundle.yaml:7`
exists to stop, and the material/protocol auto-deposition paths are exactly its target.

The record-drafting flow is the opposite shape. Nothing is auto-created: a human reads the
card and clicks Accept, and the write rides the FormDraftService accept loop — reviewHash
re-check, FULL policy re-evaluation, owner-policy check, audit entry `Accept draft <id>`.
The policy protection `allowAutoCreate` is meant to guarantee (a human decision before a
record exists) is *already satisfied by construction* in this flow. Classifying it as
`auto-create` is a labeling error at the inference site, not a policy disagreement: the
generic `inferredActions` pass cannot see that this adapter's single staged create is gated
behind a human Accept, and applies the machine-deposition class to it.

Consequences that decide it:

1. Option B kills a sanctioned, shipped feature under the flagship bundle and enshrines the
   two-regimes asymmetry the evidence proves: manual Save create works under POL-REGULATED
   (QMS7-8 lap 2, PASS) while the AI-proposed-and-human-accepted create is permanently
   blocked (lap 7, no Accept control ever mounts — `WorkstateProposalCard.tsx:168-177`
   renders Reject-only for `blocked`). A regulated biologist facing the same act gets one
   route and not the other for reasons invisible to them. That contradicts friction-first
   and Brad's standing ruling that the AI belongs in the AI panel driving a real
   accept/reject/clarify dialogue — a dialogue with no Accept button is not a dialogue.
   Documentation cannot fix a dead affordance; it just files the corpse.

2. Option C (confirm-semantics) adds a second confirmation atop an accept loop that already
   re-checks reviewHash, re-evaluates policy, checks owner policy, and audits. Confirm
   exists in the bundle vocabulary (`allowSubstitutions: confirm`) for choices the human
   has NOT yet consciously made; here the Accept click IS the confirmation. Extra
   confirmation is pure friction against the same act that the manual path asks zero of.
   Rejected.

3. Option A is the declarative shape: the exemption is a property of the adapter's
   declared domain in data, not a carve-out in code. "Things that can be data should be
   data" — and the enforcement the regulated bundle legitimately wants does NOT disappear:
   it moves to where it already lives, the accept loop's full re-evaluation. The
   auto-create gate stays exactly as strict for genuine machine auto-deposition
   (MaterialCompiler, protocol paths — untouched).

## Required orchestrator/coder actions

Yes — one coder fix run on `wt/QMS7-7-lane1-l1t1500`, small and surgical:

1. Data switch in `config/drafting/adapters.yaml`, `record-drafting` domain block: a
   declared flag (e.g. `humanReviewedCreate: true` — name is implementer's choice, must be
   lint-validated against the adapters schema) that tells the staged-authoring compile pass
   the adapter's single staged create is human-confirmed and must NOT emit the
   `auto-create` PolicyActionRequest. NO spec names, spec ids, or "training"/"registry"
   literals in TypeScript. The decision reads the adapter's declared block, same per-call
   load pattern as the existing `landing.tabKind` block (QMS7-7 FIX1 precedent).
2. Do not touch `CompilerKernel.inferredActions` default behaviour or the material/protocol
   compilers: absent the flag, `new-record` still maps to `auto-create` exactly as today.
   The compile still runs schema validate + lint + every other policy setting
   (`allowPlaceholders`, `allowSubstitutions`, ...) — only the `auto-create` request is
   withheld for flagged adapters.
3. Accept-side guarantee to preserve and be test-asserted: the accept loop still runs the
   full policy re-evaluation (it may not be skipped "because the compile passed").
4. Tests: unit test that a flagged adapter's compile yields NO `auto-create` action under
   POL-REGULATED while an unflagged `new-record` binding still yields `POLICY_BLOCKED`; a
   regression test that the material auto-deposition path is unchanged under POL-REGULATED.
5. Re-gate (browser, tier-2): QMS7-7 AC-4 and AC-7 laps under **POL-REGULATED** — Accept
   renders, one draft TRM record, reject persists nothing, negative lap honest. Other QMS7-7
   laps already passed and are not re-run unless the diff touches their surface.

## Disposition of AS-ORCH-L1-147 and the QMS7-7 conditional reopen

- AS-ORCH-L1-147 (POL-SANDBOX lane-config flip, `/home/brad/.hermes/cl/lanes/1/lane1-config.yaml:53`):
  **revoke it now**, do not let it ride. The tick after the fix merges must flip
  `lane.policyBundleId` back to `POL-REGULATED` and restart :5192/:3092 (independent
  pre-existing need: QMS7-8 runbook N1 already demands POL-REGULATED). Once the
  POL-REGULATED re-gate receipts land, close AS-ORCH-L1-147 as superseded by this ruling —
  evidence-debt resolved, no residual permissive-bundle dependency in lane 1.
- QMS7-7 conditional reopen: **maintain the reopen** until (a) the fix merges to
  `cl/integration-1` and (b) the POL-REGULATED re-gate receipts (Accept → exactly one draft)
  are filed under a receipts dir stamped with the post-fix trunk sha. Then close QMS7-7.

## How the wave-3 campaign gate (QMS7-8) closes for lap 7

**Re-gate laps 6-7 only, under POL-REGULATED, at a pinned trunk revision. No full campaign
re-gate. No accept-with-conditional.**

- The fix diff is provably scoped to the record-drafting adapter's compile path; laps 1-5
  and 8 exercise surfaces the diff cannot touch (their receipts stand, incl. the negative
  sweep N1-N6 which runs under the restored POL-REGULATED anyway — N1's role-denial arm is
  re-proven by the bundle restore regardless).
- The re-gate packet must re-run: lap 6 (card renders review, not blocked), lap 7 (Accept →
  exactly one draft TRM record), the reject lap (persists nothing), and one negative probe
  (POST /api/drafts/accept without reviewHash → honest 422) as regression witness.
- Pin the revision for the gate (D4): freeze `cl/integration-1` for gate duration; record
  the sha as the trail's first entry.
- Campaign verdict: closes when the re-gate passes AND D3 (suite/typecheck baseline
  mismatch) is resolved or separately ruled by the orchestrator/environment owner. This
  ruling does not touch D3 — it is not a lap-7 matter and I neither waive nor weaken it.
- D2 (record-create ACL stamping, AS-ORCH-L1-145) stays its own defect track; out of scope
  here.

## Rejected alternatives, on record

- B (permissive-only by design): rejected for the reasons in §Rationale.1 — dead regulated
  feature + two-regimes asymmetry contradicts founding principles and standing rulings.
  Had B been chosen, the deliverable would have been an actor-matrix row
  ("AI record-drafting: available only under POL-SANDBOX/POL-PERMISSIVE bundles; regulated
  labs use manual create") plus a principles note in
  `specifications/computable-lab-principles.md`'s appendix, orchestrator-writable as docs.
  Not chosen; noted only so the record shows it was considered.
- C (confirm affordance): rejected as double-confirmation friction over an already
  human-gated write.
