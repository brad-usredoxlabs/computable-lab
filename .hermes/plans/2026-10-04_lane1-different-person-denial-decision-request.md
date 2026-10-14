# Decision request — declaratively distinguish the "different-person" lifecycle denial (QMS-6B defect D4)

To: architect · lane 1 · from: orchestrator tick 20261004T2200
Decision output path (unique):
  /mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-04_lane1-different-person-denial-decision.md

## Task
QMS-6B attempt 8 `VERDICT: fix`, defect D4 (MAJOR): the author-as-actor approve denial renders the
GENERIC role sentence, not a different-person reason. Acceptance criterion 6 requires the
different-person denial to be DISTINCT from the password/role messages. Decide the declarative shape
of the fix.

## Evidence (orchestrator-verified on trunk e4c76142)
- `server/src/lifecycle/lifecycleMiddleware.ts:66-68`: `if (!matching.allowed) return { allowed:false,
  error: 'You do not have the required role for this transition.' }` — EVERY guard failure collapses
  to the role sentence. The middleware cannot tell WHY the transition was disallowed.
- `server/src/lifecycle/LifecycleEngine.ts:39-60` already surfaces declarative guard facts into
  `TransitionInfo.requires` (`signatureRequired`, `signatureAction`, `differentPersonThan`) — pure
  pass-through from the lifecycle YAML guards, no policy in TS.
- Client already consumes the metadata: `app/src/components/registry/DocumentControlBar.tsx:37` has
  `differentPersonThan?`. So the missing piece is the SERVER surfacing WHICH guard failed + a message
  that is not TS-invented policy.
- Receipt: ~/.hermes/cl/receipts/QMS-6B/2026-10-04_181022/api/d4-denial-message.txt
  (PUT state->approved as the author → 422 LIFECYCLE_TRANSITION_DENIED, generic message; state unchanged).

## Options
- (A) Engine surfaces the FAILED guard declaratively (extend the check result / TransitionInfo with
  e.g. `failedGuard: 'requires_different_person' | 'requires_signature' | ...`), and the middleware
  maps guard→message where the message TEXT is sourced from YAML (not hardcoded in TS). Preserves the
  "policy in YAML" rule; needs a small lifecycle-guard message declaration.
- (B) Add a per-guard declarative `denialMessage` in the lifecycle YAML; the engine passes it through
  and the middleware returns it verbatim. Simplest; the message lives entirely in data.
- (C) Minimal: middleware inspects `matching.requires?.differentPersonThan` and, when present and the
  actor is the required role's assignee, returns a distinct constant message. Smallest diff but puts
  the wording in TS — conflicts with the no-policy-in-TS rule unless the wording is treated as
  presentation, not policy.

## Recommendation
(B) if the lifecycle schema can carry a guard-level message without new product scope; else (A).
Both keep the wording in data. (C) only if the architect rules the denial wording is presentation.

## Exact uncertainty
Whether guard→denial-message mapping is (i) domain policy that MUST live in YAML (=> A/B, schema
change) or (ii) presentation the middleware may own (=> C). This is the one line I will not cross
without a decision. Ruled in-scope or needs a Brad amendment?

## Constraint
The fix must not weaken the fail-closed guard semantics (QMS-1A) and must keep legacy behavior for
transitions without a different-person guard.
