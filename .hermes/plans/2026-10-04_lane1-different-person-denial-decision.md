# DECISION — declaratively distinguish the "different-person" lifecycle denial (QMS-6B defect D4)

Decision by: architect profile · lane 1 · 2026-10-04
Responds to: `.hermes/plans/2026-10-04_lane1-different-person-denial-decision-request.md`
Verified against: trunk `cl/integration-1` @ e4c76142 (all cited lines opened directly).

## Chosen option: (B) — per-guard declarative `denialMessage` in the lifecycle YAML

Ruled: the guard→denial-message mapping is **DOMAIN POLICY, not presentation**. It is the
authoritative answer to "why did the system refuse to let this person push this record forward" —
a 21 CFR Part 11-relevant QMS fact. CLAUDE.md:145 ("Code never makes policy decisions — it follows
the rules declared in data") and the QMS-1A precedent (`LifecycleEngine.ts:33-34`: "no guard→action
mapping is invented in TS (the mapping lives in YAML only)") both forbid option (C). Option (A) is
the same mechanism as (B) with an extra TS constant-table step; (B) keeps the entire string in data.

The orchestrator's recommendation (B-first) is adopted **with one correction to the option framing**
(see "Evidence correction" below): (B) alone — middleware "passes it through" — is underspecified,
because today the middleware genuinely cannot know WHICH guard failed. (B) therefore REQUIRES the
engine to report the first failing guard; that piece is option (A)'s mechanism. The composite
(engine reports the failing guard's declarative facts; middleware returns its YAML `denialMessage`
verbatim) is what is decided here, and it is still called (B) because the message text is 100% data.

## Evidence correction (the request's evidence is verified, but option (C) as framed is broken)

- All cited anchors are correct: `lifecycleMiddleware.ts:66-68` collapses every `!matching.allowed`
  to the role sentence; `LifecycleEngine.ts:39-60` is a pure pass-through of guard facts;
  `DocumentControlBar.tsx:37` has `differentPersonThan?`; the receipt
  (`~/.hermes/cl/receipts/QMS-6B/2026-10-04_181022/api/d4-denial-message.txt`) confirms the 422 with
  generic wording and unchanged state.
- The correction: option (C)'s trigger — "middleware inspects `matching.requires?.differentPersonThan`
  and … returns a distinct message" — cannot work. `requires` comes from `describeGuardFacts`, which
  reports which guards are **DECLARED**, not which **FAILED**. For `document-controlled-signing`
  approve, the actor may satisfy the different-person guard yet fail `requires_signature`; a
  middleware branch on `differentPersonThan` presence would then issue a FALSE different-person
  denial. The different-person document-control transition carries BOTH guards on the same transition.
  **Whatever option is taken, the engine must report which guard actually failed.** Option (C) is
  rejected on correctness grounds in addition to the no-policy-in-TS rule.

## Exact declarative shape to add

### 1. Meta-schema — `schema/core/lifecycle.meta.schema.yaml`

Guard items (`properties.transitions.items.properties.guards.items.properties`, lines 57-87): add one
optional property. Backward compatible (guards already `additionalProperties: true`, so no existing
spec changes validity):

```yaml
              denialMessage:
                type: string
                description: >-
                  Optional human-readable denial reason surfaced when THIS guard fails.
                  Pure pass-through data; absent => the server's generic denial wording.
```

### 2. Spec type — `server/src/lifecycle/types.ts`

Inside the guard object (after `signatureAction?`, line 32):

```ts
      /** Optional YAML-declared denial reason surfaced when this guard fails. */
      denialMessage?: string
```

### 3. Engine — `server/src/lifecycle/LifecycleEngine.ts`

Replace the boolean-only `guardsPass` with a first-failing-guard locator; `guardsPass` becomes a
one-line wrapper so `canTransition`'s fail-closed semantics are untouched (`default: return false`
for unknown guard types MUST be preserved):

```ts
  /** Returns the first guard that fails for this context, or undefined when all pass.
   *  Fail-closed: an unknown guard type counts as failed (QMS-1A). */
  private firstFailingGuard(
    guards: NonNullable<LifecycleSpec['transitions'][number]['guards']>,
    context: LifecycleContext
  ): LifecycleSpec['transitions'][number]['guards'][number] | undefined {
    return guards.find(guard => !this.guardPasses(guard, context))
  }

  private guardsPass(guards: ..., context: LifecycleContext): boolean {
    return this.firstFailingGuard(guards, context) === undefined
  }
```

with `guardPasses(guard, context)` holding today's per-type `switch` body verbatim (all seven cases
plus `default: return false`).

Surface the failed guard declaratively in `TransitionInfo` (no message text in TS):

```ts
export interface TransitionRequirements {
  signatureRequired: boolean
  signatureAction?: string
  differentPersonThan?: string
  /** YAML denialMessage of the guard; keyed so the middleware can map guard -> message without policy. */
  denialMessages?: { differentPerson?: string; signature?: string }
}

export interface TransitionInfo {
  // ... existing fields unchanged ...
  requires?: TransitionRequirements
  /** Present only when the transition matched but was denied: the first failing declared guard. */
  failedGuard?: { type: string; than?: string; field?: string; signatureAction?: string; denialMessage?: string }
}
```

`getValidTransitions` sets `failedGuard` from `firstFailingGuard(transition.guards ?? [], context)`
when `allowed === false && transition.guards?.length` (the `guards.length` check is what preserves
legacy behavior for unguarded transitions). `describeGuardFacts` additionally copies each guard's
`denialMessage` into `requires.denialMessages` — pure pass-through, same pattern as
`signatureAction`/`than`.

### 4. Middleware — `server/src/lifecycle/lifecycleMiddleware.ts` (lines 66-68)

```ts
  if (!matching.allowed) {
    return {
      allowed: false,
      // Denial wording is declarative: the failing guard's YAML `denialMessage` verbatim.
      // No message text or guard→wording mapping is invented here.
      error:
        matching.failedGuard?.denialMessage ??
        'You do not have the required role for this transition.',
    }
  }
```

That generic constant remains ONLY as the fallback for (a) transition-role failures (no
`failedGuard`) and (b) guards with no `denialMessage` — i.e., exact legacy behavior. Widening the
role-failure wording to YAML too is deferred (below), keeping this repair minimal.

Both denial callers — `RecordHandlers.ts:786-791` and `MaterialLifecycleHandlers.ts:595-602` —
already forward `lifecycleResult.error` verbatim as `message` on
`422 LIFECYCLE_TRANSITION_DENIED`. **No handler change.** The client (`DocumentControlBar.tsx:118`,
`describeApiError`) surfaces the server message untouched; the client type at
`DocumentControlBar.tsx:34-38` / `client.ts:4144` MAY optionally gain
`denialMessages?: { differentPerson?: string; signature?: string }` for pre-click hints —
client-visible behavior is NOT required for D4 closure.

### 5. Lifecycle YAML — the three files carrying `requires_different_person`

`schema/core/lifecycles/document-controlled-signing.lifecycle.yaml` (line 49),
`schema/core/lifecycles/document-control.lifecycle.yaml` (line 49),
`schema/core/lifecycles/lab-vocabulary-control.lifecycle.yaml` (line 46) — add to the guard:

```yaml
  - type: requires_different_person
    than: author
    denialMessage: "This transition requires a different person than the author. As the author you may not perform it — the document's state did not change."
```

(Exact wording is the spec author's to tune; the two binding properties are: it names the
different-person reason, and it contains no role/password wording.) Add it to NO other guard in
this repair — see scope.

## Scope ruling: IN-SCOPE lane-1 repair — no Brad amendment needed

Rationale: (1) the meta-schema change is a backward-compatible optional property (no existing YAML
changes validity; `required: [type]` untouched); (2) the `LifecycleSpec`/`TransitionInfo` additions
are optional-field extensions of the merged QMS-1A guard-facts contract, same pass-through pattern;
(3) no new behavior exists for any transition that lacks the new YAML key — zero blast radius
outside the different-person denial path; (4) it directly serves acceptance criterion 6 of the
already-approved QMS-6 campaign. The message TEXT is new domain data, which is exactly what YAML is
for under "things that can be data should be data". If Brad later wants the *role-failure* wording
declarativized too, that is a separate amendment — deferred below.

## Constraints that MUST be preserved (verification contract)

1. **QMS-1A fail-closed**: `guardPasses` keeps `default: return false` for unknown guard types;
   `guards.every(...)` semantics are identical to `firstFailingGuard(...) === undefined` (same
   predicate, first-false is irrelevant to the boolean). `requires_signature` without
   `signatureAction` still returns false. Fixing D4 changes the denial *message* only — the 422,
   the `LIFECYCLE_TRANSITION_DENIED` code, and the unchanged record state are untouched.
2. **Legacy behavior**: transitions WITHOUT a different-person guard are unchanged — a missing
   `denialMessage` (or a missing guard, or a role-only failure) falls back to the exact current
   generic sentence; unguarded transitions never get `failedGuard`; no-lifecycle / not-loaded /
   no-state-change early-returns are untouched.
3. **Existing tests**: `AuditEventService.test.ts:268`, `governanceStrictness.test.ts:265/279/349`,
   `RecordHandlers.lifecycle.test.ts` assert the `error` CODE (`LIFECYCLE_TRANSITION_DENIED`), not
   the message — they stay green only if the middleware change stays message-only. Do not "fix"
   these tests; they are the regression fence for constraint 1.
4. **The D4 falsifier is a guard-failure report, not a `requires` presence check** (see Evidence
   correction): a unit test must show that on the `document-controlled-signing` approve transition
   as the author WITHOUT a signature, `failedGuard.type === 'requires_different_person'` (it is
   first in YAML order), and that with a valid signature but as the author the failure still
   reports the different-person guard — while a non-author lacking a signature reports
   `requires_signature`, NOT a different-person message.
5. **Docs**: `docs/qms-actor-matrix.md` documents denial "M2" as covering both role and guard
   failures; the implementation should update that row/matrix alongside the fix so the docs don't
   lie after the change.

## Explicitly deferred (do not widen this repair)

- `denialMessage` on `requires_signature` guards (the signed path already gets client-side
  instruction handling via `signatureRejectionInstruction`).
- Declarativizing the transition-ROLE failure sentence (QMS-1A open-question territory; needs its
  own task/amendment).
- Client pre-click hint consumption of `denialMessages`.

DECIDED /mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-04_lane1-different-person-denial-decision.md — option B (per-guard YAML denialMessage, with mandatory engine first-failing-guard report; option C rejected as factually broken)
