# SH-QC-1-OQ1 — coder report (l2t1730 lane 2) — server held-intent clear-on-cancel

Worktree: /mnt/vast/home/brad/git/wt/SH-QC-1-OQ1-lane2-l2t1730
Branch: cl/SH-QC-1-OQ1-lane2-l2t1730 · base 4feb3f5078683858ceafb313ae2eaddc35c94e48 (trunk tip)
Spec: .hermes/plans/2026-10-16_1750-SH-QC-1-OQ1-held-intent-clear-on-cancel-spec.md

## What was built (smallest honest mechanism, per spec)

1. `server/src/ai/shorthandChat.ts` — exported `clearHeldShorthandIntent(key): boolean`
   beside `takeHeldShorthandIntent`: deletes the ONE conversation's entry, returns
   whether one existed. The take/fold path is byte-unchanged.
2. `server/src/api/handlers/AIHandlers.ts` — exported module-level `shorthandCancel`
   handler + `ShorthandCancelBody` type + `shorthandCancel?` member on the
   `AIHandlers` interface; wired into BOTH shipped factories
   (`createAIHandlers`, `createDeterministicOnlyAIHandlers`). The handler validates
   the body with the sibling `/ai/*` INVALID_REQUEST shape (the warmContext
   `context is required` pattern), rebuilds the editorContext with assistStream's
   defaults, re-derives the conversation key with `deriveContextCacheKey` (the
   orchestrator's own derivation — no second key scheme), and calls
   `clearHeldShorthandIntent`. Touches nothing else (no stream abort, no state
   beyond heldIntents).
3. `server/src/api/routes.ts` — `POST /ai/shorthand/cancel` registered in the
   existing `aiHandlers` block beside `/ai/assist/stream` and `/ai/context/warm`,
   same bind pattern. `(aiHandlers.shorthandCancel ?? shorthandCancel)` so the
   route exists on the shipped server even when server.ts wires its delegating
   facade (see Assumptions A3).
4. New test file `server/src/api/handlers/AIHandlers.shorthandCancel.test.ts`
   (R1, R1-route, R2, R3, body-validation, R4 regression pin). Stubbed model +
   stubbed store; ZERO real model calls; fixtures reused from src/ai/fixtures.

ZERO YAML changes. ZERO app/ changes. No client wiring (per spec — the call-site
folds into the next UI-gated item).

## Bar 1 — RED evidence (before the fix, verbatim)

`cd server && npx vitest run src/api/handlers/AIHandlers.shorthandCancel.test.ts`
against base 4feb3f50 (fix stashed; captured twice — once pre-implementation,
once via `git stash push` of the three code files):

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  ... > R1: cancel clears the held intent for the conversation — take after cancel is null
TypeError: handlers.shorthandCancel is not a function
 FAIL  ... > R1-route: POST /ai/shorthand/cancel is REGISTERED on the shipped route table (RED baseline: 404)
AssertionError: expected 404 to be 200 // Object.is equality
 FAIL  ... > R2 leak proof: cancel between a needs-clarification turn and a later answer — the answer does NOT fold the cancelled intent
TypeError: handlers.shorthandCancel is not a function
 FAIL  ... > R3: cancel is idempotent and conversation-scoped — unknown/cleared conversation is cleared:false, siblings untouched
TypeError: handlers.shorthandCancel is not a function
 FAIL  ... > body validation matches the sibling /ai/* INVALID_REQUEST shape
TypeError: handlers.shorthandCancel is not a function
 Test Files  1 failed (1)
      Tests  5 failed | 1 passed (6)
```

The 1 passing test at base is the R4 regression pin BY DESIGN (the answer-path
fold must already work at base; it pins that the fix does not break it). The
R1-route 404 is the leak's route-level proof: no cancel/clear route existed.

## Bar 2 — GREEN (after the fix, verbatim)

`cd server && npx vitest run src/api/handlers/AIHandlers.shorthandCancel.test.ts`

```
 ✓ src/api/handlers/AIHandlers.shorthandCancel.test.ts  (6 tests) 395ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
```

Touched test family (new file + every existing suite that exercises
heldIntents/take sites/AIHandlers/routes):

```
 ✓ src/api/handlers/AIHandlers.attachments.test.ts  (4 tests) 6ms
 ✓ src/ai/shorthandChat.cueCascade.test.ts  (12 tests) 179ms
 ✓ src/ai/AgentOrchestrator.repeatEcho.test.ts  (9 tests) 248ms
 ✓ src/ai/AgentOrchestrator.shorthandChat.test.ts  (19 tests) 399ms
 ✓ src/api/handlers/AIHandlers.shorthandCancel.test.ts  (6 tests) 520ms
 Test Files  5 passed (5)
      Tests  50 passed (50)
```

repeatEcho P8/D4 guards (retry arm never touches heldIntents) are inside the
9 passing repeatEcho tests — green. R2 asserts the cancelled conversation's
follow-up turn carries NO held-intent fold (no `CLARIFICATION ANSWERS for your
previous shorthand document` / `Held document:` re-extraction block; the model
path runs instead). R4 asserts the NOT-cancelled fold still takes with ZERO
model calls. All model calls in these tests are scripted stubs
(`stubModel` — same convention as AgentOrchestrator.shorthandChat.test.ts);
zero real model calls, no :3093/:5193 or any running stack touched.

## Bar 3 — typecheck (base measured first, zero NEW errors)

Base (4feb3f50, before any edit): `npm run typecheck -w server` →

```
src/ai/AgentOrchestrator.ts(347,18): error TS2339: Property 'id' does not exist on type 'ResolvedRecordTarget | ResolvedOntologyTarget | ResolvedSequenceTabTarget | ResolvedSequenceRecordTarget'.
1
```

(the single known pre-existing AgentOrchestrator TS2339).

After the fix:

```
src/ai/AgentOrchestrator.ts(347,18): error TS2339: Property 'id' does not exist on type 'ResolvedRecordTarget | ResolvedOntologyTarget | ResolvedSequenceTabTarget | ResolvedSequenceRecordTarget'.
1
```

ZERO new errors. (An intermediate iteration that made `shorthandCancel` a
REQUIRED interface member produced a NEW server.ts facade error TS2741 —
reverted by making the member optional; see Assumptions A3. The final run is
byte-identical to the base error list.)

## Bar 4 — diff stat (owned files only)

`git -c core.fileMode=false diff --stat 4feb3f50..HEAD` (see commit sha below):

```
 server/src/ai/shorthandChat.ts                  | 17 ++++++++
 server/src/api/handlers/AIHandlers.ts           | 79 +++++++++++++++++++++++++++
 server/src/api/routes.ts                        |  7 ++++
 server/src/api/handlers/AIHandlers.shorthandCancel.test.ts | (new file)
```

ZERO YAML, ZERO app/ files, only the three owned files + the new test file.

## Full-suite drift check (context, not a bar)

Full `npx vitest run` on this worktree AFTER the fix:

```
 Test Files  110 failed | 617 passed | 9 skipped (736)
      Tests  179 failed | 5850 passed | 70 skipped (6316)
```

Full `npx vitest run` on the SAME worktree with the fix stashed (base):

```
 Test Files  111 failed | 615 passed | 9 skipped (735)
      Tests  179 failed | 5831 passed | 70 skipped (6297)
```

Fail-file comm (sorted FAIL-file lists, base vs after) — the ONLY difference
is base-only:

```
comm -3 base after  ->  src/foundry/FoundryCoderPatch.test.ts
```

i.e. ZERO new fail-files from this change. That one file is a base-run flake:
it failed at SUITE load with `ENOENT ... schema/registry/prompt-templates/test-missing-var.yaml`
— a file PromptTemplateRegistry.test.ts writes temporarily (a parallel-file
race over the shared registry directory), unrelated to heldIntents. It passes
in isolation on the fixed tree:

```
 ✓ src/foundry/FoundryCoderPatch.test.ts  (13 tests) 4ms
 Test Files  1 passed (1)
      Tests  13 passed (13)
```

The 110 shared fail-files are the known trunk/lane-exclusion drift
(ZymoCampaignNegatives suite-level failure from the lane-excluded
`schema/core/datatypes/revision-ref.schema.yaml` plus the lane-excluded
untracked server sources listed in
`/home/brad/.hermes/cl/lanes/2/lane-exclude-a6fix-l2t0430` — the worktree was
seeded with those untracked-but-present files from cl-integration-2 so the
suite could even load; they are git-excluded and appear in NO diff). Raw logs:
/tmp/shqcoq1-fullsuite-after.txt, /tmp/shqcoq1-fullsuite-base.txt.

## Assumptions

A1 — Conversation-key derivation (the load-bearing one). The orchestrator
computes `conversationKey = deriveContextCacheKey(surface, context)` at
AgentOrchestrator.ts:1223, and BOTH take sites (:1267, :1751) use it. The
cancel route therefore takes `{ surface?, context }` in the body — the same
identity the assist request sends — and re-derives with the SAME
`deriveContextCacheKey` from systemPrompt.ts. No raw key is accepted and no
second key scheme exists. The handler builds the EditorContext with
assistStream's exact defaults (`labwares: []`, `eventSummary: ''`,
`vocabPackId: 'general'`, `availableVerbs: []`, then `...context`) — the same
mirror discipline warmContext documents ("Mirror assistStream byte-for-byte…
Any drift here is a silent KV-cache miss") — because the held key was derived
from the context the orchestrator RECEIVED (defaults applied), not the raw
client JSON. A cancel whose surface/context differs from the assist's derives
a different key and clears nothing (cleared:false) — same idempotence shape as
an already-clear conversation.

A2 — Idempotence semantics. `clearHeldShorthandIntent` returns
`Map.delete`'s boolean. The route answers 200 `{ cleared: boolean }` always:
`true` when an entry existed, `false` when the conversation was already clear
or never held. No 404, no throw. Scope is exactly one key — R3 pins that a
cancel on conversation A leaves conversation B's hold takeable.

A3 — `shorthandCancel` is OPTIONAL on the `AIHandlers` interface. server.ts
(:1337) constructs its own delegating facade object typed `AIHandlers`
(outside owned files); a REQUIRED member would add a NEW typecheck error
there (observed TS2741 during development, then eliminated). Both shipped
factories always provide the handler, and routes.ts registers the route as
`(aiHandlers.shorthandCancel ?? shorthandCancel)` — the exported shared
implementation — so the shipped server always has the route regardless of
facade composition, and no bind-of-undefined is possible. exactOptionalPropertyTypes
is respected: the member is absent-or-value, never `undefined`-valued.

A4 — Auth. The sibling `/ai/*` registrations carry no route-level auth hook;
the new route matches them exactly (no new policy invented).

A5 — Environment. The worktree had no node_modules; it was wired to
cl-integration-2's (identical package-lock sha256 6068d633…) via symlinks,
and the lane-excluded untracked server sources + `server/schema` symlink were
seeded from cl-integration-2 so the suite/typecheck could run at all. All of
these are git-excluded (core.excludesFile lane-exclude-a6fix-l2t0430) and
appear in NO diff.

## Stop-boundary check

No fold/take semantics changed (AgentOrchestrator.ts untouched; take sites and
the OQ1 mandatory fold arm byte-identical). No client change made. No YAML.
No widening.

SHQCOQ1 DONE 6c65d8c2b0a4a38b7894a32ec5c364729d2285c3
