# L2-JOURNEY-NOUN-CREATE-1 — unit capguard (lane 2)

Item: L2-JOURNEY-NOUN-CREATE-1 · unit: capguard (1 of 2) · tier: consequential
Worktree: /home/brad/cl-wt/L2-JOURNEY-NOUN-CREATE-1-capguard-lane2 · branch: cl/lane2-noun-create-capguard-0401
Base: d2e5100a57c0dc3f4267196ab8a5a2ef0f5c252f

## Governing line (quoted, .hermes/plans/architect-context-l2.md)

- §2.5 (owner `schema/workflow/capability-descriptor.schema.yaml`): "**Proposal ≠ commitment.** Nothing is
  written before an accept; a staged draft never satisfies a committed-record port."
- §3 (measured 2026-11-13 against trunk 73507b4b, quoted): "So a journey still cannot MINT anything through
  the catalogue; it is declared, not enabled. Any task that claims creation 'works' must show `available_now`
  true and a receipt, not a descriptor."
- Scenario: none. `config/journey/declarations/noun-create.yaml:82` records the canon carries no
  corpus-manifest id, so there is no scenario id to grade against. Acceptance for this unit is the dispatch
  refusal below, not a corpus scenario. No scenario was invented.

## What changed (3 files, 162 insertions; report excluded from the budget)

1. `server/src/compiler/journey/journeyDispatch.ts` (+27): rule constant
   `RULE_DISPATCH_CAPABILITY_UNAVAILABLE = 'journey_dispatch_capability_unavailable'` and one exported
   predicate `refuseUnavailableCapability(capability: CapabilityDescriptor, stepId: string):
   JourneyEnvelopeDiagnostic | undefined`.
   - Returns `undefined` when `capability.status.available_now === true`.
   - Treats a MISSING `status` object as NOT available (`available_now !== true`): the schema
     (`schema/workflow/capability-descriptor.schema.yaml:104` `required: [declared, implemented, available_now,
     browser_certified]`) makes `status` required, so an absent `status` is a malformed descriptor and must not
     read as permission — only exactly `true` passes. Stated in the predicate's doc comment.
   - Returns ONE diagnostic whose message names the capability id, `available_now: false`, and the step id.
   - NOT called from inside `guardJourneyDispatch`. No `PolicyDecisionRecord` is fabricated: the refusal is a
     precondition diagnostic, and `record` is required by the guard's return type, so inventing one would claim
     a policy set was evaluated when none was.
2. `server/src/api/routes.ts` (+10/-1): in the `/journey/dispatch` handler, immediately after `capability` is
   resolved (the sibling 403 for an unadmitted descriptor) and BEFORE `loadPolicySetsDir`, it calls the
   predicate; on refusal returns `reply.code(403).send({ ok: false, diagnostics: [refusal] })` — the same shape
   and status as the sibling 403s, NO `record` key. The existing policy path is otherwise unchanged; the
   `result.allowed ? 200 : 403` line is untouched.
3. `server/src/compiler/journey/journeyDispatch.test.ts` (+125/-3): unit legs (predicate) + route legs, reading
   the SHIPPED descriptors from `config/journey/capabilities/` (never hand-copied).

### Absence proof (measured at base d2e5100a, before this unit)
`grep -rn "available_now" server/src --include=*.ts | grep -v test` → NO product module read the field; only
test fixtures referenced it. (After the change, the ONLY product reader is `journeyDispatch.ts:219`;
`routes.ts:434` is a comment line only — verified below.)

### Prohibited set — all clean (verified `git diff d2e5100a --name-only`)
`server/src/compiler/journey/journeyCompiler.ts` and its test, `config/journey/**`, `app/**`, `schema/**`, and
`server/src/compiler/journey/capabilityCatalogue.ts` are UNTOUCHED (empty diff). The readiness
(READY/NOT_READY) vocabulary was not touched; no descriptor was flipped to `available_now: true`.

## The human-step caveat (stated, not "fixed")
THE CHANGE #1 directs the refusal to fire on a step naming the shipped `journey.material-create` descriptor.
The shipped noun-create declaration's own step `choose-creation-path`
(`config/journey/declarations/noun-create.yaml:38-44`) is `interaction_mode: human_in_the_loop`; the envelope
guard (`server/src/compiler/journey/journeyEnvelope.ts:80`) refuses a human step at 400 (`journey_envelope_human_step`)
BEFORE capability resolution — a human step is never pre-compiled into an envelope. So a literal dispatch of the
shipped document at `step_id: "choose-creation-path"` cannot reach the availability check. The route leg therefore
dispatches a lint-valid AUTOMATIC step that names the SAME shipped descriptor (`journey.material-create`, read from
`config/journey/capabilities/material-create.yaml`); the descriptor under guard is the shipped one either way.
This is the only place availability can be exercised through the route without also mutating the (prohibited)
declaration. The predicate's unit legs name the exact step id `choose-creation-path` for the message.

## RED (before the product change) — raw summary
Command: `cd server && npx vitest run src/compiler/journey/journeyDispatch.test.ts`
Base (d2e5100a): 9 passed (9). After adding the test legs, before the product code:
```
 ❯ src/compiler/journey/journeyDispatch.test.ts  (16 tests | 6 failed)
   FAIL  ... refuseUnavailableCapability > (i) a missing status object is NOT available ...
       TypeError: refuseUnavailableCapability is not a function
   FAIL  ... refuseUnavailableCapability > (i) a status object with available_now missing is NOT available either ...
       TypeError: refuseUnavailableCapability is not a function
   FAIL  ... POST /api/journey/dispatch > (j) a step naming the shipped journey.material-create is refused BEFORE policy: 403, the named rule, no record key
       AssertionError: expected 200 to be 403
 Test Files  1 failed (1)
      Tests  6 failed | 10 passed (16)
```
The route leg failing with `expected 200 to be 403` is the load-bearing RED: with the policy set ALLOWING
`domain_mutation`, a pre-change route would hand the declared-but-not-enabled `journey.material-create` step on
to execution (200) instead of refusing it.

## MUTATION PROBE (both reverted before commit)
- Mutation 1 — predicate pass-condition `availableNow === true` → `availableNow !== false`:
  `2 failed | 14 passed (16)`. Exactly the two malformed-status legs went RED (absent `status` and absent
  `available_now` no longer refused) — proving those legs exist and are the discriminators.
- Mutation 2 — route call neutralized (predicate kept exported, `if (false && refusal !== undefined)`):
  `1 failed | 15 passed (16)`. The AC1 route leg went RED (`expected 200 to be 403`) while the predicate unit legs
  stayed green — proving the route call is the mechanism, and no other mechanism already refuses.
Both reverted; `git diff d2e5100a --name-only` shows only the 3 owned product/test paths dirty.

## VERIFY (final state, all measured at the final commit)
- `cd server && npx vitest run src/compiler/journey/journeyDispatch.test.ts`
  → `Tests 16 passed (16)` (was 9/9 at base d2e5100a: +7 new, all green; AC3).
- `cd server && npx vitest run src/compiler/journey/journeyCompiler.test.ts`
  → `Tests 10 passed (10)`. Base number recorded at d2e5100a (10 passed); ZERO edits to that file — the
  readiness vocabulary was not touched.
- `cd server && npx tsc --noEmit` — base error count at d2e5100a = 6 (all pre-existing, in
  `AIHandlers.ts`/`AiIngestionHandlers.ts`/`ExtractProtocolHandler.ts`/`sequenceRoutes.ts`, none in journey files).
  Final = 6, and `diff tsc-base.txt tsc-final.txt` is EMPTY: no NEW error. The `routes.ts` call is type-clean.
- `grep -rn "available_now" server/src --include=*.ts | grep -v test` → the only product READER is
  `server/src/compiler/journey/journeyDispatch.ts:219` (the predicate). `routes.ts:434` and `journeyDispatch.ts:206,223`
  are comment/message strings, not readers. One product reader, no second authority.
- `git -c core.fileMode=false status --short` → clean at exit (report + product committed; the `server/node_modules`
  and `server/schema` symlinks are gitignored — see infra note).

## Infra note (repro)
This worktree shipped with NO `server/node_modules` and NO `server/schema` (both untracked/gitignored and
absent on a fresh worktree; `package.json` md5 identical to sibling lane-2 worktrees). To run the mandated
verification without an install (which is barred by the brief), I symlinked:
- `server/node_modules -> /home/brad/cl-wt/L2-CHECKPOINT-cpd1fix-lane2/server/node_modules`
- `server/schema -> ../schema`
Both are gitignored (`git check-ignore` → 0) and never enter the diff, so `git status` is clean. If a fresh
checkout is used, replicate both symlinks before running vitest/tsc.

## Changed files (real diff stat vs base d2e5100a)
```
server/src/api/routes.ts                           |  11 +++++-- (10+,1-)
server/src/compiler/journey/journeyDispatch.ts     |  27 ++++++++++++++ (27+,0-)
server/src/compiler/journey/journeyDispatch.test.ts| 128 ++++++++ (125+,3-)
3 files changed, 162 insertions(+), 4 deletions(-)
```
Line budget: files = 3 (two product + one test; report not counted), lines = 162 (≤180). PASS.

## Decisions / next actions
- Decisions: (a) availability is a PRECONDITION, evaluated ahead of policy by the route, never inside
  `guardJourneyDispatch` and never via a fabricated `PolicyDecisionRecord` (false-authority bait closed);
  (b) `available_now !== true` (including absent `status`) is treated as NOT available — declared ≠ enabled
  (declared-as-enabled bait closed); (c) the compiler READY/NOT_READY vocabulary was left alone deliberately.
- Next action: unit 2 of this item (the other unit) is independent and out of scope here.
- Owner/resume: no blockers. Re-verify from a clean checkout with the two symlinks in place.
