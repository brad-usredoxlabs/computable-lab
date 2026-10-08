# QMS-1A spec — Expose declarative guard metadata in the lifecycle transitions preview

Campaign: light-qms-records-browser. Authorized by Brad 2026-10-03 ("extend the preview
payload with guard metadata per transition"). Resolves the QMS-1 item **(g)** `requires-rescope`
(`.hermes/plans/handoffs/2026-10-02_qms-1-integration-contract-complete.md`). Unblocks
QMS-3 (typed preview wrapper) and QMS-6 (transition flow).

## Goal

Let a client distinguish, from DATA alone, why a transition is not currently allowed —
specifically **"a signature with action X is required"** vs **"this user lacks the role"**.
Today both collapse to `allowed: false` with no machine-readable reason, so the sign-off UI
cannot render a signature-gated transition. The fix is to pass through guard facts the engine
ALREADY loads from lifecycle YAML; it is not new policy and must add none.

## Existing contracts (verified — cite these, do not re-derive from prose)

- `server/src/lifecycle/LifecycleEngine.ts:5-11` — `TransitionInfo = { event, targetState,
  label, role, allowed }`. No guard metadata. **This is the gap.**
- `server/src/lifecycle/LifecycleEngine.ts:109-130` — `getValidTransitions()` iterates
  `spec.transitions` and has `transition.guards` **in scope**; it currently drops them.
- `server/src/lifecycle/LifecycleEngine.ts:69-99` — `guardsPass()` is the only place guard
  `type` values are interpreted. `requires_signature` fails CLOSED when `signatureAction` is
  missing (`:89`). Guard types seen: `requires_different_person`, `requires_field_set`,
  `requires_active_policy`, `requires_policy_disposition`, `requires_authority`,
  `requires_role`, `requires_signature`.
- `server/src/lifecycle/types.ts:18-32` — the declarative guard union; `signatureAction?: string`.
- `server/src/api/handlers/LifecycleHandlers.ts:60-69` — calls `getValidTransitions(..., {
  presentedSignatures: [] , enforceTransitionRoles: false })` and returns `{ lifecycleId, state,
  transitions }`. Because `presentedSignatures` is always `[]`, every signature-gated transition
  evaluates `allowed: false` even for a fully authorized user.
- `server/src/api/routes.ts:594` — `GET /lifecycle/:lifecycleId/transitions`.
- `schema/core/lifecycles/document-controlled-signing.lifecycle.yaml:47-59` — the declaring YAML
  (`in_review → approved` has `requires_different_person(than: author)` +
  `requires_signature(signatureAction: approved)`).

## Contract to implement

In `LifecycleEngine.ts`, extend the type and populate it in `getValidTransitions` from
`transition.guards` ONLY:

```ts
/** Declarative guard facts, copied from the lifecycle YAML guards — never inferred in TS. */
export interface TransitionRequirements {
  /** A requires_signature guard is present (transition is signature-gated). */
  signatureRequired: boolean
  /** The YAML `signatureAction` for that guard. Absent => the engine fails closed today. */
  signatureAction?: string
  /** requires_different_person guard: the role whose assignee must differ from the actor. */
  differentPersonThan?: string
}

export interface TransitionInfo {
  event: string
  targetState: string
  label: string
  role: string
  allowed: boolean
  /** Present only when the transition declares guards. Absent otherwise. */
  requires?: TransitionRequirements
}
```

Rules:
- Derive `requires` purely by scanning `transition.guards` for the two types above. Do NOT add a
  hardcoded policy table, a lifecycle-id branch, or any guard→action mapping — that mapping lives
  in YAML only (matches `guardsPass():89`'s fail-closed comment).
- `signatureRequired` is `true` whenever a `requires_signature` guard exists, **even if
  `signatureAction` is absent** (the UI must be able to tell "gated but mis-declared" from "not
  gated").
- **Do not change `allowed`.** The preview is permissive/`presentedSignatures: []` BY DESIGN
  (governance handoff notes it explicitly — do not "fix" it). This task adds metadata only.
- `LifecycleHandlers.ts` should need NO functional change (it returns `transitions` wholesale).
  Touch it only if typing forces it.

## Tests (RED first)

- `server/src/lifecycle/LifecycleEngine.test.ts` (style of the existing suite):
  - For `document-controlled-signing` at `in_review`: the `IN_REVIEW→APPROVED`-style transition
    (event `APPROVE`) carries `requires.signatureRequired === true`,
    `requires.signatureAction === 'approved'`, `requires.differentPersonThan === 'author'`.
  - A transition with NO guards (e.g. `draft → in_review`) has `requires === undefined`.
  - A synthetic spec whose `requires_signature` guard omits `signatureAction` yields
    `signatureRequired: true` with `signatureAction === undefined`.
- Regression: all existing lifecycle tests (`LifecycleEngine.test.ts`,
  `LifecycleEngine.roles.test.ts`) still pass unchanged — `allowed` semantics untouched.

## Acceptance criteria

1. `npm run typecheck -w server` exit 0.
2. `npm run test:run -w server` — lifecycle suites green; the ONLY permitted failure is the
   pre-existing `test/api/settings.test.ts` hook timeout (attributed, not fixed).
3. A real `curl` (or an API test) against a loaded `document-controlled-signing` lifecycle shows
   the new field on a signature-gated transition: `requires.signatureAction === 'approved'`.
4. No `app/` change (the client typing bump belongs to QMS-3).

## Boundaries

- EDIT (worktree only — product code, shared main checkout is Brad's live tree):
  `server/src/lifecycle/LifecycleEngine.ts`, `server/src/lifecycle/LifecycleEngine.test.ts`.
- MAY touch if typing forces it: `server/src/api/handlers/LifecycleHandlers.ts`.
- MUST NOT touch: anything under `app/` (QMS-3), `RecordRegistryPage.tsx`, schema YAML,
  or any governance/role-grant file.
- Do NOT commit in the shared tree; isolate in a git worktree.

## Open questions (do not silently assume)

1. Should `requires` also expose the other guard types (`requires_role`, `requires_field_set`,
   …) now, or only signature + different-person as needed by the sign-off flow? (Recommend:
   only these two now; widen when a consumer needs more.)
2. Should `TransitionRequirements` ever be present-but-empty? (Recommend: `requires` present iff
   the transition declares ≥1 guard.)

## Report back

- Absolute paths changed + the diff.
- The exact test command and its output (exit code, counts).
- The curl/API evidence showing the new field.
- Any `requires-rescope` surprise.
