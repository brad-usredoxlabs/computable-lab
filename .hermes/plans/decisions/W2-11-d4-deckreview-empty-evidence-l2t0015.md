# W2-11 D4 deck-review-empty — measurement packet for architect ruling (orch l2t0015, 2026-10-13T01:45 EDT)

Trunk a28d9789. Question: the D4 gate leg's deck-review gate renders 0 labware
checkboxes (w2-11-campaign-demo.spec.mjs:866). Is the fix fixture-side or product-side?

## Evidence (all first-hand this tick)

1. PRODUCER EXISTS (corrects the run-4 handoff claim that the one-shot path has
   no candidateLabwares producer): `lower_protocol_intent` maps
   `intent.resources.labwareInstances -> candidateLabwares`
   (ProtocolIntentLowering.ts:204-223, 305); normalizeScientistIntent builds
   labwareInstances from symbolic source/target/labware labels
   (normalizeScientistIntent.ts:324-351). Headless probe on the lane backend
   (:3093 POST /api/intent/compile, tiny transfer intent naming 'probe plate'):
   outcome complete, `labwareAdditions: [{recordId:'probe plate', reason:
   'ProtocolIntent source labware resource probe plate'}]` (tmp-orch/
   probe-compile-labware-l2t0015.py + /tmp/probe-resp2.json).
2. resolve_labware emits an ADDITION only on the ZERO-MATCH arm
   (ChatbotCompilePasses.ts:1550-1552, 1641-1675); a hint that MATCHES a lab
   record lands in resolvedLabwares, NOT additions.
3. compileScientistIntent puts additions on terminalArtifacts ONLY when
   non-empty (compileScientistIntent.ts:292-293). labwareRequirements is
   NEVER set on the scientist-intent pipeline (grep: the only writers are the
   raw event_graph path).
4. deriveDeckLabware (ProtocolLocalizationThread.tsx:108-110) folds ONLY
   additions + requirements -> resolvedLabwares are invisible to the deck
   review. If the macro's hints all match the seeded lab rows, the review list
   is EMPTY by construction while the run still compiled.
5. The zymo macro replays non-deterministically: today's full ask/answer
   round-trip through POST /api/intent/compile-from-prompt (fixture frozen
   draft + rack answer) landed on 422 needs-clarification (zero-artifact bar);
   run 4 (23:45 EDT) completed with events. So run-4's empty list rode the
   complete branch with empty additions -> consistent with cause (4): either
   everything resolved against the seed rows, or every hint was unresolvable
   and something else zeroed additions. The one non-determinism gap: run-4's
   exact localMacro is not captured (thread holds it client-side).

## Options for the ruling
(a) FIXTURE-SIDE: make the D4 macro keep >=1 labware the lab does NOT have
    (drop one seeded lab row, or assert on additions for an unmatched hint) —
    zero product change; the accept gate then opens honestly.
(b) PRODUCT: deck review should also offer resolvedLabwares for placement
    (deriveDeckLabware gains the resolved fold + accept-side payload) — larger,
    touches the shared localization thread + accept contract.
(c) Both, staged: (a) now to unblock W2-11 D4 + A5e; (b) as its own item.

Constraints: do NOT weaken the >=1-placement assertion (spec-pinned accept
gate; AS-LANE2-W28-A5D-ACCEPT-GATE-BY-DESIGN). Do NOT seed labware speculatively.
A5e (W2-8 accept leg) rides the same ruling.

Write the decision to decisions/W2-11-d4-deckreview-empty-decision.md (same
dir as this file), with verdict (a)/(b)/(c), rationale, and the exact resume
condition.
