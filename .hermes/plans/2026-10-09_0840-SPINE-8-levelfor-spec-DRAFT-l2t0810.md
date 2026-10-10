# SPEC DRAFT — SPINE-8-LEVELFOR (lane 2) — composed 2026-10-09 ~08:40 EDT by cl-spec-composer (l2t0810)

Status: DRAFT — orchestrator reviews and promotes; never dispatch a coder on this until promoted.
Base examined: trunk `cl/integration-2` @ 24b43bca (docs tip 19b52edc), git ALWAYS `-c core.fileMode=false`.
Ruling (binding, full acceptance shape): `~/.hermes/cl/lanes/2/decisions/SPINE-6-wells-seam-reachability-decision.md` § "New product item 2 — SPINE-8-LEVELFOR".
Task block: `~/.hermes/cl/lanes/2/task-list.md` id SPINE-8-LEVELFOR (status todo, deps SPINE-6 met — merged e830cffb).

## 0. SEQUENCING GATE (read first)

SPINE-7-ROLES-SEAM is being coded IN PARALLEL in its own worktree and IT ALSO EDITS
`schema/scientist-intent/scientist-intent-vocabulary.yaml` (required address arg) AND re-blesses
the SPINE-6 golden manifest (its acceptance item 4). SPINE-8 MUST NOT branch until SPINE-7 is
MERGED: claim gate = task list shows SPINE-7 done AND the coder captures the trunk sha at claim
and records it in the report. Consequences:

- Every "N tests" / manifest-sha number in this spec was measured at 24b43bca (pre-SPINE-7).
  The coder RE-MEASURES every baseline on ITS OWN base; this spec's numbers are reference, the
  SET-identity discipline is the gate.
- Expected manifest collision: SPINE-7's merge will have already changed the
  `scientist-intent-vocabulary.yaml` sha256 line in
  `server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` (and possibly added fixture
  entries). SPINE-8's vocabulary `level:` edit changes that sha AGAIN → re-bless is EXPECTED
  and legitimate; the report carries a before/after manifest diff vs the SPINE-7-merged tip,
  naming exactly which lines SPINE-8 changed (SPINE-6 §11.5/§11.9 discipline: bless once, on
  the final content, never over pending wording).
- If a git conflict on MANIFEST.yaml or the vocabulary appears at worktree-cut time, the trunk
  (post-SPINE-7) wins; SPINE-8 re-blesses on top.

## 1. Goal (one sentence)

Land the production supplier of `EngineDeps.levelFor` — a `(verb, argument) -> MaterialLevel`
mapping DECLARED AS VOCABULARY DATA on the arg contracts in
`schema/scientist-intent/scientist-intent-vocabulary.yaml` and consumed when the resolve_nouns
pass builds `engineDeps` — so the engine's wantLevel/level-mismatch arm
(`resolutionEngine.ts:94-111`) is reachable through the real
POST /intent/compile-from-prompt route, and re-home the material-level-mismatch golden into the
SPINE-6 suite against that shipped rule.

## 2. Verified state at the trunk (composer's own reads, not scout output)

No cl-scout output is cited anywhere in this spec; every line below was read first-hand at
24b43bca (note: the dispatch brief's `pipeline/passes/resolveNounsPass.ts` path is WRONG — the
file is under `compiler/resolution/`).

- Engine arm EXISTS and is correct: `server/src/compiler/resolution/resolutionEngine.ts:94-111`
  `levelFilter` (wantLevel absent → no-op; `!isWellReadyLayer(materialLayerOf(wantLevel))` →
  no-op; else concept/unknown candidates are dropped with a `level-mismatch: <curie> ...`
  TRACE line — a trace, never a dedicated clarification reason). `:265`
  `const wantLevel = deps.levelFor?.(verb, contract.name);` and `:275` conditional-spreads it
  onto the request. `:244` is the doc-level scalar door (SPINE-7 owns widening it — not here).
- Supplier is ABSENT: `EngineDeps.levelFor` is declared
  `server/src/compiler/resolution/types.ts:122` (comment "SPINE-4's profile-derived seam");
  `ResolutionRequest.wantLevel` at `types.ts:37-38` (comment "SPINE-4 supplies via
  deps.levelFor" — aspirational, confirmed). Production supplier grep at 24b43bca:
  `grep -rln levelFor server/src` => `ResolveSpine.ts` (unrelated `wantLevel` param of
  `scoreCandidate`-style bonus, :229/:232), `adapters.ts:83` (passes `req.wantLevel` as a spine
  level BONUS), `types.ts`, `resolutionEngine.ts`, `nounResolution.test.ts` — ZERO production
  code WRITES `levelFor` into an `EngineDeps`.
- The seam to wire: `server/src/compiler/resolution/resolveNounsPass.ts:250-254` builds
  `engineDeps = { adapters, strategies, ...termsForSuggestions }` — no `levelFor`. The pass ALREADY
  holds `deps.vocabulary` (`ResolveNounsPassDeps`, :60), so the supplier needs NO new pass dep.
- Registration site: `server/src/compiler/scientistIntent/compileScientistIntent.ts:148`
  `registry.register(createResolveNounsPass({ intent, vocabulary: deps.vocabulary ??
  defaultScientistIntentVocabulary(), spine, ... }))`. The chatbot chain
  (`server/src/ai/runChatbotCompile.ts`) does NOT register `createResolveNounsPass` (grep: the
  only production caller is compileScientistIntent.ts:148) — so the chatbot byte-identity
  obligation is about NOT touching shared modules, chiefly `server/src/ai/materialRefFields.ts`
  (see bait §9.4).
- Arg-contract parse: `server/src/compiler/scientistIntent/vocabulary.ts` — interface
  `ScientistIntentArgContract` (:47-55: `name, kind, required, domain?, capability?,
  hintEligible?`), raw shape `RawArg` (:159), per-arg build :170-176 using
  `...(typeof a.X === 'T' ? { X: a.X } : {})` conditional spreads (exactOptionalPropertyTypes).
  A new field needs BOTH the interface, RawArg, and a conditional spread.
- Meta-schema will REJECT a `level:` key today:
  `schema/scientist-intent/scientist-intent-vocabulary.schema.yaml` arg items are
  `additionalProperties: false, unevaluatedProperties: false` with exactly
  `name|kind|required|domain|capability|hintEligible` as properties. Schema edit MUST precede
  any vocabulary data edit or the shipped singleton throws at load (boot failure, loud AJV
  report). Companion lint: `schema/scientist-intent/scientist-intent-vocabulary.lint.yaml`
  (P1-P5 rule ids; re-bless concern §9.4 covers its sha only via schema dir, see §9.5).
- `MaterialLevel` values: `server/src/resolve/types.ts:15` —
  `'concept' | 'spec' | 'instance' | 'aliquot' | 'unknown'`.
  Level IN data: `server/src/resolve/providers/records.ts:25-31` `KIND_LEVEL` maps record-kind
  `material->concept, material-spec->spec, formulation->spec, material-instance->instance,
  aliquot->aliquot`, anything else `?? 'unknown'`. Terms provider: `providers/terms.ts:94`.
  => a fixture store record with `payload.kind: material` yields a level-`concept` candidate.
- WANT-side firing semantics (THE trap): `isWellReadyLayer(materialLayerOf(wantLevel))` reads
  `server/src/ai/materialRefFields.ts` `LAYER_ALIASES` (:66-82): `'instance'`, `'aliquot'`,
  `'material-spec'`, `'formulation'`, `'material-instance'`, vendor spellings ARE well-ready;
  `'spec'`, `'concept'`, `'unknown'` fall back to `'material'` → NOT well-ready → `levelFilter`
  NO-OPS. Declaring `level: spec` in vocabulary would be SILENTLY INERT. Do NOT "fix" the
  alias table — `materialRefFields.ts` is chatbot-gate-owned (byte-identity, §7) and out of
  scope.
- The unit leg the ruling forbids growing: `nounResolution.test.ts:215-247` hand-builds
  `wantLevel: 'aliquot'` on a `wash`/`material` request — after SPINE-8 the route can produce
  exactly that shape from data, which is the point; the unit test itself stays as-is.
- Route/golden machinery exists: goldens home
  `server/src/compiler/scientistIntent/goldens/` (6 fixtures + 6 records + MANIFEST.yaml +
  replayKernel.ts + 2 suites; MANIFEST pins vocabulary + wire-schema + pipeline sha256s and
  `reproduce:` expects "7 tests, 0 failures" at 24b43bca — SPINE-7's re-bless may already have
  changed counts; RE-MEASURE at claim). Fixture-3 (`fixtures/ambiguous-material.yaml`) shows
  the fixture shape: `name / request{protocolText,answers} / store.records[{recordId,payload
  {kind,name}}] / modelOutput{intentId,actions[...]}`, canned model output replayed through the
  real route by `replayKernel.ts`.
- Vendor strictness (OPEN assumption AS-LANE2-SPINE3-N1-VENDOR-MATERIAL-STRICTNESS,
  assumptions.md :1381): SPINE-3's accepted landing-zone policy rejects, for a
  `domain: material` arg, any candidate POSITIVELY claiming a different termKind (engine-side
  realization: `server/src/compiler/resolution/adapters.ts:255-262` — a candidate's
  `termKind` that differs from the contract domain is a domain-mismatch; termKind is only set
  by the terms provider — the records provider (`providers/records.ts`) sets `level` but no
  termKind). THIS SPEC DOES NOT RESOLVE THAT ASSUMPTION AND DOES NOT NEED TO: the golden and
  fixtures PROVABLY AVOID vendor-kind terms by construction (§5, grep-enforced), which is the
  alternative the ruling allows ("or a fixture design that provably avoids vendor-kind terms").
  The assumption entry stays OPEN; the report must say so in one line, citing the id.

## 3. Acceptance criteria (VERBATIM)

From the task block (`verified by:`):

> Per ruling artifact acceptance shape: level-mismatch arm reachable end-to-end through the
> route via data-declared mapping; material-level-mismatch golden re-homed to shipped rule;
> RED-first; vocabulary remains the single source of the mapping (no TS level table).

From the ruling (binding acceptance, item 2):

> route-reachable material-level-mismatch: a real-route compile produces the 422 level-mismatch
> clarification driven by vocabulary-declared levels (engine arm resolutionEngine.ts:94-105
> reached without any test-hand-built wantLevel); a route-level golden (landed into the SPINE-6
> suite as the re-homed fixture-5 leg, with manifest re-bless) pins the clarification VERBATIM,
> atomic zero-artifact, zero writes; grep proof at merge: `grep -rn levelFor server/src` shows
> a production supplier outside test files.

Terminology honesty (composer ruling on wording, so nobody invents a reason code): the engine
has NO `level-mismatch` clarification reason — "level-mismatch" is a TRACE line
(`resolutionEngine.ts:105`). When a wantLevel-`aliquot` request's only candidates are
concept-level, the engine clarifies via the EXISTING `unknown-noun` arm (:211) and the
level-mismatch evidence is the trace + the pre-wire control below. The golden pins the
clarification the engine ACTUALLY produces, VERBATIM — do NOT add a new reason code (that would
be new engine policy and reviewer bait §9.6).

## 4. In scope / out of scope (exact paths)

IN SCOPE (the only files the diff may touch, plus `.hermes/plans/`):
- `schema/scientist-intent/scientist-intent-vocabulary.schema.yaml` — add ONE optional
  property `level` to the arg-contract properties block:
  `type: string, enum: [concept, spec, instance, aliquot, unknown]` (mirror `MaterialLevel`
  exactly; a description naming the §9.4 inertness of `spec`/`concept`/`unknown` is REQUIRED).
- `schema/scientist-intent/scientist-intent-vocabulary.lint.yaml` — ONLY if a guard rule is
  added (see OQ2); prefer zero lint changes.
- `schema/scientist-intent/scientist-intent-vocabulary.yaml` — add `level: <MaterialLevel>` to
  the MINIMUM arg set decided at claim (§6 step 2; primary candidate: `wash`'s `material` arg,
  mirroring the unit-leg analogue `wash.material + wantLevel 'aliquot'`).
- `server/src/compiler/scientistIntent/vocabulary.ts` — `level?: MaterialLevel` on
  `ScientistIntentArgContract` + `RawArg` + one conditional spread (`...(typeof a.level ===
  'string' ? { level: a.level as MaterialLevel } : {})` — the AJV enum is the validation
  authority; the loader still narrows generically, NO per-value branches).
- `server/src/compiler/resolution/resolveNounsPass.ts` — the production supplier: in
  `createResolveNounsPass.run()`, build `levelFor` FROM `deps.vocabulary` and put it on
  `engineDeps`. Shape (exactOptionalPropertyTypes-safe):
  ```ts
  const levelFor = (verb: string, argument: string): MaterialLevel | undefined =>
    deps.vocabulary.argContracts(verb).find((a) => a.name === argument)?.level;
  const engineDeps: EngineDeps = {
    adapters,
    strategies: buildStrategyRegistry(),
    levelFor,
    ...(deps.termsForSuggestions ? { termsForSuggestions: deps.termsForSuggestions } : {}),
  };
  ```
  This is generic plumbing (lookup by the declared contract list), NOT a (verb,arg) table —
  the vocabulary stays the single source (§7). The pass's hard boundary (no verb/domain NAME
  literals) is unchanged: `levelFor` contains zero string literals with comparison roles.
- `server/src/compiler/resolution/resolveNounsPass.test.ts` — RED-first registration test:
  with a fixture vocabulary whose arg declares a level, capture the `deps` the (stubbed
  `resolve`) engine receives and assert `deps.levelFor!(verb, arg)` returns the declared
  MaterialLevel and `undefined` for undeclared args. This is the unit leg proving "outside
  tests" supplier wiring at the pass seam.
- `server/src/compiler/scientistIntent/goldens/fixtures/material-level-mismatch.yaml` +
  `server/src/compiler/scientistIntent/goldens/__records__/material-level-mismatch.golden.json`
  + wiring into `goldenIntentToClarification.test.ts` (re-homed fixture-5 leg, §5).
- `server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` — re-bless (§9.5): vocabulary
  sha, new fixture + record entries, `reproduce:` test count, baseCommit note.

EXPLICITLY OUT OF SCOPE (any hit = reviewer reject):
- `server/src/compiler/resolution/resolutionEngine.ts` — the arm already exists; touching it
  means the mapping leaked into TS.
- `server/src/ai/materialRefFields.ts` — chatbot gate/writer table; `LAYER_ALIASES`
  "repair" (`spec` → well-ready) is FORBIDDEN here (byte-identity, §7; a real need for
  spec-level requirements is its own future item).
- `server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts`, `runChatbotCompile.ts`,
  anything under `server/src/ai/` — chatbot chain.
- `schema/workflow/scientist-intent.schema.yaml` and the doc-level scalar door
  (`resolutionEngine.ts:240-277`) — SPINE-7's contract.
- The vendor-termKind landing-zone policy (`adapters.ts:255-262` and its terms-provider
  origin) — SPINE-3 policy; SPINE-8 AVOIDS it (§5), it does not widen it (SPINE-4's
  STOP-and-report instruction still stands).
- No new clarification reason codes, no new EngineDeps fields, no vocabulary threading into
  `IntentCompileFromPromptHandlers.ts` (D-EXTRA-1: the route runs the shipped singleton —
  which is exactly why the level declaration must be SHIPPED vocabulary data).

## 5. The re-homed golden (fixture 5 replacement) — vendor-avoidance by construction

Name: `golden.intent-to-clarification.material-level-mismatch` (restores the name the SPINE-6
ruling moved here). Shape per `fixtures/ambiguous-material.yaml`:

- `modelOutput`: one `wash`-family action whose `material` arg names a label that EXISTS in the
  fixture store ONLY as a concept-level record: `store.records: [{ recordId: MAT-ethanol-concept,
  payload: { kind: material, name: <label> } }]` (KIND_LEVEL → level `concept`; records provider
  sets no termKind → the material-domain landing-zone check is never engaged).
- Expected outcome: 422 `NEEDS_CLARIFICATION`, clarification for that label with the engine's
  ACTUAL reason (verbatim-pinned from the captured record; expected `unknown-noun`, candidates
  as the engine emits — capture, never hand-write), atomic zero-artifact
  (`Object.keys`-absence on the artifact surface per the existing clarification goldens), zero
  store writes, golden deep-equal replay.
- NON-VACUITY (mutation control, the §4.4 discipline): the pre-wire state IS the control.
  With the wiring absent the concept candidate is unfiltered and BINDS (route does not 422 on
  that label) — the RED capture (§6 step 1) is recorded in the report as proof the fixture is
  bindable without wantLevel. Do NOT hand-add `wantLevel` anywhere in the harness.
- VENDOR-KIND PROVABLE AVOIDANCE (stated explicitly, per the OPEN assumption): no fixture,
  record name, label, or payload anywhere carries a vendor/product/catalog term or a
  `termKind`/`kind` claiming `vendor*`; levels used in vocabulary data and fixture kinds are
  strictly from the material family (`material` kind in-store; `aliquot` (or `instance`) as the
  declared want-side level). Enforced by grep §8.5. The assumption entry is NOT resolved, NOT
  closed, NOT cited as resolved — the report states: "vendor-as-material demand demonstrated
  absent for this item's surface; AS-LANE2-SPINE3-N1-VENDOR-MATERIAL-STRICTNESS stays OPEN."

## 6. RED-first build order (the coder's ladder)

1. RED capture: add the fixture + golden wiring ONLY (schema/vocab/pass untouched). The new
   golden must FAIL (route binds the concept candidate instead of 422-ing) — record the actual
   response in the report (this doubles as the §5 non-vacuity control). Existing goldens stay
   green.
2. BLAST-RADIUS enumeration, THEN ship data: schema `level` property; vocabulary lint guard if
   OQ2 lands; enumerate every existing consumer that resolves the chosen arg —
   `grep -rn "action: wash\|action: add_material" server/src/api/handlers/*.test.ts server/src/compiler/scientistIntent server/src/compiler/protocolIntent`
   plus a run of §8.3 — and pick the MINIMUM `(verb, arg)` set that reaches the engine arm
   without changing any existing green (a declared level FILTERS concept AND unknown-level
   candidates, so a shipped declaration on an arg that existing tests resolve against
   unknown-kind store rows would turn greens red — narrow the declaration, do not edit the
   tests). Add `level:` to that set.
3. Supplier + parse edits (§4) and the resolveNounsPass.test.ts registration leg → that suite
   GREEN.
4. Golden GREEN: capture `__records__/material-level-mismatch.golden.json` from the real run,
   replay deep-equal.
5. Manifest re-bless (§0 sequencing, §9.5) + `npx tsx scripts/golden-replay.ts` exit 0.

## 7. Chatbot byte-identity obligation

The chatbot chain never registers resolve_nouns (§2), so the ONLY route by which this item can
move chatbot behavior is a shared-module edit. Therefore:
- `git -c core.fileMode=false diff --name-only <base>..HEAD -- server/src/ai/` MUST be EMPTY
  (grep-proofed, §8.6);
- `cd <wt>/server && npx vitest run src/ai` failing-FILE SET identical to the claim-time
  capture (trunk 24b43bca reference: 10 files / 21 failed tests,
  `/tmp/l2t2230-aifail-files.txt` — SET identity, NEVER green);
- `runChatbotCompile*.test.ts` files individually green as at base.

## 8. Verification commands (final, expected outputs; vitest ONLY from <wt>/server; git ALWAYS `-c core.fileMode=false`)

8.1 PRIMARY suite: `cd <wt>/server && npx vitest run src/compiler/scientistIntent/goldens`
    => ALL tests green, 0 files failed, zero failures tolerated (goldens home has no
    legacy-fail excuse). Expected test count = claim-time count + 1 (at 24b43bca that is 7 ->
    8; post-SPINE-7 RE-MEASURE).
8.2 Replay: `cd <wt>/server && npx tsx scripts/golden-replay.ts` => exit 0, offline.
8.3 Route+compiler+resolution: `cd <wt>/server && npx vitest run src/api/handlers/IntentCompileFromPromptHandlers.test.ts src/api/handlers/IntentCompileHandlers.test.ts src/api/handlers/IntentAcceptHandlers.test.ts src/compiler/scientistIntent src/compiler/resolution src/compiler/protocolIntent`
    => claim-time failing-file SET with ZERO new failing files and NO changed pass counts
    outside the item's own new tests (the shipped-vocab `level:` declaration is the one edit
    that could move these — §6.2 is the pre-empt).
8.4 src/ai: `cd <wt>/server && npx vitest run src/ai` => failing-FILE SET identical to claim
    capture (`comm -3 <(sort claim-capture) <(vitest FAIL lines)` EMPTY); reference at
    24b43bca: 10 files / 21 tests (`/tmp/l2t2230-aifail-files.txt`).
8.5 LevelFor greps (both, verbatim):
    - production-supplier proof: `grep -rn levelFor server/src --include='*.ts' | grep -v '\.test\.ts'`
      => MUST include `server/src/compiler/resolution/resolveNounsPass.ts` (this is the merge
      gate the ruling names; at 24b43bca it shows ONLY types.ts / resolutionEngine.ts /
      ResolveSpine.ts / adapters.ts).
    - vendor avoidance: `grep -rniE 'vendor|product|catalog' server/src/compiler/scientistIntent/goldens/fixtures/material-level-mismatch.yaml server/src/compiler/scientistIntent/goldens/__records__/material-level-mismatch.golden.json`
      => EMPTY; and `grep -n 'level:' schema/scientist-intent/scientist-intent-vocabulary.yaml`
      => ONLY the §6.2-declared args with enum-legal values.
8.6 Ownership gate: `git -c core.fileMode=false diff --name-only <base>..HEAD | grep -v -E '^schema/scientist-intent/|^server/src/compiler/scientistIntent/(vocabulary\.ts|goldens/)|^server/src/compiler/resolution/resolveNounsPass(\.test)?\.ts$|^\.hermes/plans/'`
    => EMPTY (stricter than SPINE-6: this item EDITS allow-listed files but adds nothing
    elsewhere; `server/src/ai/` and `server/src/ai/materialRefFields.ts` specifically EMPTY).
8.7 Server tsc: `cd <wt> && npm run typecheck -w server 2>&1 | grep 'error TS' | sed 's/([0-9]*,[0-9]*)//' | sort > /tmp/l2t<id>-tsc-server.txt && comm -3 /tmp/l2t2230-tsc-server.txt /tmp/l2t<id>-tsc-server.txt`
    => comm output EMPTY vs the claim-time re-measure on the coder's own base (24b43bca
    reference: 26 error-lines / 6 files — RecordStoreImpl 11, AgentOrchestrator 8,
    AuthoringGuard 3, ProtocolIntakeHandlers 2, bootstrapAdmin 1, RecordHandlers 1;
    `/tmp/l2t2230-tsc-server.txt`). Non-zero exit by design — SET identity is the gate, never
    demand green. None of the 6 owning files may appear in the diff.
8.8 App: `cd <wt> && npm run typecheck -w app` unchanged vs carried pin 47-out/34-err AND
    `git -c core.fileMode=false diff --name-only <base>..HEAD -- app/` EMPTY (never exercised).
8.9 Manifest self-check: the golden suite's hash test vs `sha256sum schema/scientist-intent/* schema/workflow/scientist-intent.schema.yaml schema/registry/compile-pipelines/scientist-intent-compile.yaml`
    => consistent; report carries the MANIFEST before/after diff (§0).

NFS/harness standing facts: vitest from `<wt>/server` ONLY (cwd-relative schema joins); never
restart/probe :3093/:5193 (server-only item, NO browser gate); no full-suite runs; fresh
worktree needs the lane bootstrap (6 symlinks + lane-exclude untracked copies, per
AS-LANE2-SPINE4-W4 / AS-PROTO-AI-5-W1 — baseline RED without them is environmental);
lane-excluded symlinked test files resolve to MAIN's sources and never see lane code
(AS-LANE2-ENV-1) — never treat them as gates.

## 9. Reviewer bait (the likely edge errors for THIS item — pre-empt them in the report)

9.1 exactOptionalPropertyTypes sites (backend has it ON): the new `level?` on
    `ScientistIntentArgContract`/`RawArg` must be built by CONDITIONAL SPREAD only (never
    `level: a.level` when absent would put `undefined` on the object); same for anything
    touching `engineDeps`. Every `?:` field the diff introduces gets a one-line report note.
9.2 Meta-schema rejection ordering: `unevaluatedProperties:false` on arg items means adding
    `level:` to the vocabulary BEFORE the schema edit makes the SHIPPED singleton throw at
    boot (and every consumer red). The ladder order in §6 is contractual; a report showing a
    vocabulary diff before the schema diff gets flagged even if the final tree is green.
9.3 YAML-reload trap: the lane stack's `tsx --watch` does NOT reload YAML — any human-facing
    E2E mention must restart the stack. This item's own evidence is in-process (vitest boots
    fresh), so goldens are immune; do not "prove" anything against :3093 without a restart,
    and preferably do not touch the stack at all.
9.4 The `spec`-inert trap (highest-value bait): `level: spec` passes the meta-schema enum YET
    never fires `levelFilter`, because `materialLayerOf('spec')` falls back to `'material'`
    (not well-ready) via `materialRefFields.ts` LAYER_ALIASES. The tempting "fix" — editing
    the alias table or hardcoding a spec-check in the pass — is chatbot-scope creep AND a TS
    policy table (violates "vocabulary remains the single source"). Correct disposition: ship a
    value that FIRES (`aliquot`, or `instance`), and if the enum's inert members bother a
    reviewer, that is OQ2's lint/schema-narrowing call, NOT an alias-table edit.
9.5 Manifest re-bless discipline: MANIFEST pins vocabulary sha → ANY shipped-vocab edit
    fails the golden suite LOUD until re-blessed; re-bless happens ONCE, after the final
    vocabulary content is decided (§6.2 enumeration precedes it), and the diff shows ONLY
    the lines this item's base moved (SPINE-7's earlier moves are context, not this item's
    hunks). Never bless twice, never bless over a pending edit.
9.6 No invented reason code: the 422 clarification reason is whatever the engine ALREADY
    emits (expected `unknown-noun`); `level-mismatch` is a trace string
    (`resolutionEngine.ts:105`) asserted, if at all, at the engine/pass seam — inventing a
    `material-level-mismatch` clarification reason in the pass is new engine policy and
    outside this item's ruling.
9.7 Shipped-vocab blast radius: a declared level also filters `level: 'unknown'` candidates —
    store rows whose kind is not in KIND_LEVEL. A green existing route/resolution test that
    binds such a row via the chosen arg turns red; §6.2 enumeration is the pre-empt, and
    narrowing the declared arg set (not editing tests, not weakening the engine) is the fix.
9.8 "Production supplier outside tests" must survive the EXACT grep §8.5 — the supplier lives
    in `resolveNounsPass.ts` (product), not in `compileScientistIntent.ts` deps-threading or a
    test helper; a supplier defined in the goldens harness fails the ruling verbatim.
9.9 Hardcode boundary: zero string literals with comparison roles added to the pass
    (no `if (verb === 'wash')`, no arg-name lists); the mapping's ONLY home is the vocabulary
    file; the schema `level` enum mirrors `MaterialLevel` — a TS union that drifts from
    `resolve/types.ts` is a bait (import the type, don't re-spell it in code; the YAML enum is
    data and is checked against the loader's generic narrowing).
9.10 The unit leg stays honest: `nounResolution.test.ts:215` must NOT be re-plumbed to route
    through the pass (it is the engine-unit arm); the NEW route-shaped evidence lives in the
    pass registration test + the golden. If the report shows edits to that describe block,
    reject.

## 10. Worker contract

- Branch: `spine-8-lane2-l2t<tickid>` off `cl/integration-2` TRUNK TIP AT CLAIM (must be a
  descendant of the SPINE-7 merge; record `git -c core.fileMode=false rev-parse HEAD` in the
  report header).
- Worktree: `/mnt/vast/home/brad/git/wt/SPINE-8-lane2-l2t<tickid>` + the standard lane
  bootstrap (node_modules symlinks + lane-exclude sync, `/tmp/lane2-sync-wt.sh` precedent).
- Unique deliverable: report at
  `<wt>/.hermes/plans/SPINE-8-report.wip-l2t<tickid>.md` (orchestrator promotes to
  `.hermes/plans/SPINE-8-report.md`); log `~/.hermes/cl/lanes/2/logs/coder-SPINE-8-l2t<tickid>.log`;
  every capture file `/tmp/l2t<tickid>-*`.
- Server-only; NO browser gate; no :3093/:5193 interaction; one worker; stop-and-report (like
  SPINE-6) instead of faking a leg if any acceptance clause proves unreachable at the claim
  base — with probe evidence, per the §10 report discipline.
- Report must carry: §6.1 RED capture, §6.2 blast-radius enumeration + chosen arg set,
  §8 outputs verbatim tails, MANIFEST before/after diff, §8.5 greps, the one-line vendor-
  assumption disposition (§5), and the diff --name-only list.

## 11. Open questions (composer could not resolve locally; max 3)

OQ1 — Which `(verb, arg)` set gets the first shipped `level:`? Composer checked: goldens
exercise labware-domain args only, and the unit analogue is `wash.material` + `wantLevel
'aliquot'`, but the full route-test population of `wash`/`add_material` actions with
unknown-kind store rows is only enumerable by running §8.3 at claim (checked vocabulary.yaml
arg lists and goldens fixtures; the answer is base-dependent anyway post-SPINE-7). Disposition
built in: §6.2 makes the coder enumerate first; recommendation `wash.material: aliquot`.
OQ2 — Should the schema enum be narrowed to well-ready-firing values (OQ-9.4 inertness) or
mirror `MaterialLevel` verbatim (recommended, honesty of the type)? A lint guard
("declared level must be well-ready") is NOT cheaply expressible in the current lint DSL
(P-family has no value-set-comparison inside the conditional arms — check P4/P5 shape before
attempting). Composer checked lint-v1 predicate set at trunk; no clean rule; flag for
architect-reviewer taste.
OQ3 — Pre-wire bindability of a concept-level MATERIAL (not labware) record through the route
spine adapter (confidence in-band so the RED is "bound", not "unknown-noun even without
wantLevel"): records.ts KIND_LEVEL + the ambiguous-material precedent say yes, but only the
§6.1 RED capture at claim proves the exact shape; if the pre-wire response already 422s on
`unknown-noun`, the fixture's control value dies and the report must show the response and
adjust the label/store until pre-wire binds (do NOT change the engine).

SPINE8SPEC DRAFT /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-09_0840-SPINE-8-levelfor-spec-DRAFT-l2t0810.md
