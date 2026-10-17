# SPEC — QMS-6F: distinct "different-person" lifecycle denial (QMS-6B defect D4)

Task: QMS-6F (lane 1, campaign light-qms-records-browser)
Class: QMS-6A (server lifecycle) — NO app/ edits.
Base: `cl/integration-1` @ d69b7e67 (write the branch off the current trunk at dispatch time).
Authoritative decision: `.hermes/plans/2026-10-04_lane1-different-person-denial-decision.md`
  (architect, option B — IN-SCOPE lane-1 repair, no Brad amendment). Read it END TO END first; it is
  the word of record for the shapes below.
Receipts of the defect: `~/.hermes/cl/receipts/QMS-6B/2026-10-04_181022/` (report.md;
  `api/d4-denial-message.txt`) — the same-person approve 422 currently returns the GENERIC role
  sentence, not a different-person reason.

## Goal
Make the "different-person" lifecycle denial distinct and declarative. Today every guard failure —
including `requires_different_person` — collapses to the generic sentence at
`lifecycleMiddleware.ts:67`. The engine already surfaces `requires.differentPersonThan`, but that
reports which guards are DECLARED, not which FAILED, so the middleware cannot honestly know the
different-person guard was the one that failed. The fix adds (a) an optional per-guard YAML
`denialMessage`, (b) a first-failing-guard report from the engine, and (c) message-only consumption
in the middleware. The denial MESSAGE changes; the 422, the `LIFECYCLE_TRANSITION_DENIED` code, and
the unchanged record state are untouched.

## Verified anchors on this trunk (orchestrator read every line directly at 20261004T2340)
- `server/src/lifecycle/LifecycleEngine.ts`
  - `TransitionRequirements` interface: lines **6-13** (`signatureRequired`, `signatureAction?`,
    `differentPersonThan?`).
  - `TransitionInfo` interface: lines **15-23** (`event,targetState,label,role,allowed,requires?`).
  - `describeGuardFacts(...)`: free function, lines **39-60** (finds the signature + different-person
    guards, returns `requires` only when guards.length>0).
  - `checkEventInSpec`: line **87** `if (!this.guardsPass(transition.guards ?? [], context)) return false`;
    role enforcement follows at **93-97**.
  - `guardsPass(...)`: private method, lines **112-142** — `guards.every(guard => { switch ... })`;
    the seven cases; `requires_signature` returns false when `!guard.signatureAction` (**132**);
    `default: return false` (**138-139**).
  - `getValidTransitions(...)`: lines **152-175** — builds `requires` at **164**, pushes TransitionInfo
    at **165-172** (`allowed` computed at 162 via `canTransition`).
- `server/src/lifecycle/types.ts`
  - `LifecycleSpec.transitions[].guards[]` item type: lines **18-33** (union of 7 `type`s; optional
    `field, role, than, disposition, authority, signatureAction`).
  - `LifecycleContext`: lines **38-56**. `TransitionInfo`/`TransitionRequirements` are NOT here — they
    live in `LifecycleEngine.ts` (above).
- `server/src/lifecycle/lifecycleMiddleware.ts`
  - denied branch: lines **66-68** — `if (!matching.allowed) { return { allowed: false, error: 'You do
    not have the required role for this transition.' } }`. (The missing-transition branch at 62-64 is
    separate and unchanged.)
- `schema/core/lifecycle.meta.schema.yaml`
  - guard items: `required: [type]`, **`additionalProperties: true`** (line **62**), properties block
    lines **63-86** (`type` enum of 7, `field, role, than, disposition, authority, signatureAction`).
    Adding an optional `denialMessage` is backward-compatible — no existing YAML changes validity.
- Lifecycle YAMLs carrying `requires_different_person` (all three confirmed):
  - `schema/core/lifecycles/document-controlled-signing.lifecycle.yaml` — approve transition
    (from in_review→approved, role reviewer), guard block at lines **49-51**, and it ALSO carries
    `requires_signature` (line 51) on the SAME transition (this is the transition the decision's
    falsifier #4 targets).
  - `schema/core/lifecycles/document-control.lifecycle.yaml` — approve transition, guard at **49-50**
    (different-person only).
  - `schema/core/lifecycles/lab-vocabulary-control.lifecycle.yaml` — activate transition, guard at
    **46-47**.
- Test fences — do NOT edit these; they guard constraint 1 (verified line-by-line by the orchestrator):
  - `server/src/governance/governanceStrictness.test.ts:265, :279, :349` assert the CODE
    (`expect(...error).toBe('LIFECYCLE_TRANSITION_DENIED')`).
  - `governanceStrictness.test.ts:266` asserts the MISSING-TRANSITION message
    (`toContain("not allowed by the document-control lifecycle")`) — that is the `!matching` branch at
    `lifecycleMiddleware.ts:63`, which this repair does NOT touch; leave it green.
  - `governanceStrictness.test.ts:282` asserts only `String(message).length).toBeGreaterThan(0)` — your
    change keeps the message non-empty, so it stays green.
  - `server/src/governance/AuditEventService.test.ts:268` asserts the CODE (same, plus the it() at :261).
  - `server/src/api/handlers/RecordHandlers.lifecycle.test.ts` does NOT assert the denial at all — it
    mocks `checkLifecycleTransition` (lines 15-20) and checks actor wiring. Unaffected.
  - Lifecycle unit harness to MIRROR for new tests: `server/src/lifecycle/LifecycleEngine.test.ts` and
    `LifecycleEngine.roles.test.ts` (real `loadLifecycle` + `getValidTransitions`/`canTransition`).

## Changes (follow the decision file's shapes verbatim)

1. `schema/core/lifecycle.meta.schema.yaml` — inside the guard item properties (after
   `signatureAction`, ~line 86) add:
   ```yaml
   denialMessage:
     type: string
     description: >-
       Optional human-readable denial reason surfaced when THIS guard fails.
       Pure pass-through data; absent => the server's generic denial wording.
   ```
   Keep `additionalProperties: true` and `required: [type]` as-is.

2. `server/src/lifecycle/types.ts` — inside the guard item (after `signatureAction?`, line 32) add:
   ```ts
   /** Optional YAML-declared denial reason surfaced when this guard fails. */
   denialMessage?: string
   ```

3. `server/src/lifecycle/LifecycleEngine.ts`
   - Add `denialMessage?: string` to the `TransitionRequirements`/guard fact surface and add
     `failedGuard?: { type: string; than?: string; field?: string; signatureAction?: string;
     denialMessage?: string }` to `TransitionInfo` (see decision §3).
   - Split `guardsPass` into a first-failing-guard locator + a one-line wrapper:
     `firstFailingGuard(guards, context)` returns `guards.find(g => !this.guardPasses(g, context))`
     (fail-closed preserved: unknown type → failed); `guardsPass` becomes
     `return this.firstFailingGuard(guards, context) === undefined`. Move the current switch body into
     `guardPasses(guard, context)` VERBATIM (all seven cases + `default: return false`). Do not change
     any case's semantics.
   - In `getValidTransitions`, set `failedGuard` from `firstFailingGuard(transition.guards ?? [], context)`
     only when `allowed === false && transition.guards?.length` (the `guards.length` check preserves
     legacy behavior for unguarded transitions). Extend `describeGuardFacts` to also copy each guard's
     `denialMessage` into `requires.denialMessages` (`{ differentPerson?, signature? }`) — pure
     pass-through, same pattern as `signatureAction`/`than`.

4. `server/src/lifecycle/lifecycleMiddleware.ts:66-68` — replace the literal with:
   ```ts
   if (!matching.allowed) {
     return {
       allowed: false,
       error:
         matching.failedGuard?.denialMessage ??
         'You do not have the required role for this transition.',
     }
   }
   ```
   The generic constant stays ONLY as the fallback (transition-role failures, or guards with no
   `denialMessage`) = exact legacy behavior. No handler change: `RecordHandlers.ts:786-791` and
   `MaterialLifecycleHandlers.ts:595-602` already forward `lifecycleResult.error` verbatim as the
   `message` on `422 LIFECYCLE_TRANSITION_DENIED`.

5. The three lifecycle YAMLs above — add to the `requires_different_person` guard:
   ```yaml
   denialMessage: "This transition requires a different person than the author. As the author you may not perform it — the document's state did not change."
   ```
   Wording is yours to tune; the two binding properties: it names the different-person reason, and it
   contains NO role/password wording. Add to NO other guard in this repair (scope below).

6. Per decision constraint 5: update `docs/qms-actor-matrix.md` so the denial row/matrix no longer
   claims role+guard failures share one generic message (it currently documents denial "M2" as
   covering both).

## RED-FIRST (load-bearing — write failing tests BEFORE the implementation)
Mirror `LifecycleEngine.test.ts` / `LifecycleEngine.roles.test.ts` (real specs through the real
engine). Cover at minimum:
- On `document-controlled-signing` approve as the AUTHOR with NO signature:
  `failedGuard.type === 'requires_different_person'` (it is first in YAML order) and the denial
  `error` equals the YAML `denialMessage`.
- Non-author lacking a signature on that same transition reports `failedGuard.type ===
  'requires_signature'` (NOT a different-person message).
- `document-control` approve as the author → different-person message.
- Legacy fence: a transition with NO guards / no `denialMessage` → denial falls back to the EXACT
  generic sentence and `failedGuard` is absent.
- Fail-closed preserved: an unknown guard type still fails (`guardsPass` false), and
  `requires_signature` without `signatureAction` still fails.
- One middleware-level test proving the 422 `error` CODE `LIFECYCLE_TRANSITION_DENIED` is unchanged
  (and that the MESSAGE is the guard's `denialMessage`) via the real `checkLifecycleTransition`.

## Verification (self, with real output tails — paste them)
- Targeted suites: `npm run test:run -w server -- <paths of touched/new suites>` GREEN, and the two
  fences above stay green.
- Full baseline delta: `npm run test:run -w server` — the trunk baseline is already RED; measure the
  failing-FILE set BEFORE and AFTER and prove **ZERO new failures** (compare against a pristine
  d69b7e67 checkout if needed).
- `npm run typecheck -w server` — report the delta (baseline is already RED; expect ZERO new errors in
  files you touch).
- No `app/` edits. Do NOT restructure the switch semantics; do NOT add policy/message text to TS.

## Files you OWN
- `schema/core/lifecycle.meta.schema.yaml`
- `server/src/lifecycle/types.ts`
- `server/src/lifecycle/LifecycleEngine.ts`
- `server/src/lifecycle/lifecycleMiddleware.ts`
- `schema/core/lifecycles/{document-controlled-signing,document-control,lab-vocabulary-control}.lifecycle.yaml`
- `docs/qms-actor-matrix.md`
- your new test file(s) under `server/src/lifecycle/` and/or `server/src/governance/`.
NO other handler, NO app/, NO ui.yaml.

## Stop boundary / hard rules
- If the correct fix needs a change to any OTHER handler, the projection response shape, a new
  middleware consumer, or the client — STOP and report it (do not absorb).
- `default: return false` (QMS-1A fail-closed) MUST be preserved; the denial CODE and unchanged record
  state MUST be preserved; legacy wording for unguarded/no-`denialMessage` transitions MUST be
  byte-identical.
- No policy in TypeScript: the message text is 100% YAML data.
- RED-first; never weaken a gate or a test to pass. Commit on your branch when green. Do NOT merge.
  Do NOT edit the task list. Do NOT run git commit/add/checkout/stash outside your own worktree branch.
- ENV: node_modules are symlinked and the lane-excluded untracked source files are copied in — if a
  package is genuinely missing, STOP and report; do NOT run pnpm/npm install (lockfile drift).

## Report (write EXACTLY this path — do NOT write any canonical name)
`/home/brad/.hermes/cl/lanes/1/qms-6f-report-20261004T2345.md`
Include: STATUS done|blocked; branch + commit sha; RED output verbatim; GREEN output verbatim; the
server failing-file before/after sets; the tsc delta; every consequential assumption; and (if blocked)
the structured blocker fields (blocker_kind/owner/portion/evidence/completed/independent_work/
recommendation/resume_condition).

## Assumptions block
(none at spec time — empty is valid)

## Handoff note for the orchestrator (context only)
This spec was authored by the lane-1 tick 20261004T2340 while the lane was at its 2-worker cap
(QMS-6B-FIX-A + QMS-6E live). DISPATCH is deferred until a lane-1 slot frees. This repair is
independent of D1 (signature subject) and of D3/D5 (QMS-6E, app/) — no file overlap.
