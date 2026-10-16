# W2-8 A5f — coder report (lane 2, l2t1430)

Item: W2-8-SAID-MEANT-SURFACE accept-leg obligation (A5.3 leg).
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-16_1355-W2-8-a5f-declared-roles-injection-spec.md
Worktree: /mnt/vast/home/brad/git/wt/W2-8-A5f-lane2-l2t1430 (branch cl/W2-8-A5f-lane2-l2t1430, base trunk 04f87ba6)
Commit: 409127c5baa9b630c25eabb8d23f922f4e1114a2 (1 commit, no merge, cl-integration-2 untouched)

## What changed (server-only, 2 files)

1. server/src/api/handlers/IntentCompileFromPromptHandlers.ts (+79/-7)
   - `renderDeclaredRolesBlock(envelope)` — renders the DECLARED ROLES block FROM
     THE RECORD: iterates `payload.roles`' own group keys, then each role's
     declared fields — `roleId`, `description`, and the role object's string-array
     hint fields generically (LabwareRole.expectedLabwareKinds /
     MaterialRole.allowedMaterialIds / InstrumentRole.allowedInstrumentIds per
     schema/workflow/protocol.schema.yaml:453-458 et al.). Zero vocabulary,
     protocol-title, or role-name literals. Framing line + one line per role,
     same composition pattern as `composeAnsweredPrompt` (same file, :146-155)
     and `composeIntentPrompt`'s LAB INVENTORY block
     (compiler/scientistIntent/intentCompile.ts:128-141) — cited in the code comment.
   - `loadDeclaredRolesBlock(sourceProtocolId)` (answers branch ONLY): absent id ->
     null; `store.get(id)` (repo pattern, UIHandlers.ts:160) -> null record -> null;
     `payload.kind !== 'protocol'` -> null; roles absent/irregular -> null
     (stop boundary 1: treat as absent, never an error). A genuine store fault is
     NOT swallowed — it propagates to the handler's existing 500
     INTENT_COMPILE_PROMPT_FAILED catch.
   - Call site (answers branch): `prompt = composeAnsweredPrompt(...)`; when a
     block exists, `prompt = ${prompt}\n\n${declaredRoles}` — appended at the
     call site, no second channel (spec §D1 coder's-choice option).
   - Header doc comment updated: WRITE-FREE wording now names both read-only
     store uses (list + the new get). No write was added.
2. server/src/api/handlers/IntentCompileFromPromptHandlers.declaredRoles.test.ts
   (NEW, 330 lines, 7 tests) — sibling of the answeredPrompt family, same
   harness: ONLY the llmClient and the store are stubbed; vocabulary, Ajv, lift,
   resolve_nouns, spine run REAL. Draw-independent (no model, never :3093).

## RED (verbatim, before implementation)

Command: cd server && npx vitest run src/api/handlers/IntentCompileFromPrompt

 FAIL  src/api/handlers/IntentCompileFromPromptHandlers.declaredRoles.test.ts > intent-compile-from-prompt.declared-roles-injection (W2-8 A5f) > R1: answers + readable sourceProtocolId -> the captured prompt carries the record's DECLARED ROLES as data
 FAIL  src/api/handlers/IntentCompileFromPromptHandlers.declaredRoles.test.ts > intent-compile-from-prompt.declared-roles-injection (W2-8 A5f) > R4: a GENUINE store fault stays loud via the EXISTING 500 convention (no new error path, no silent swallow)
 FAIL  src/api/handlers/IntentCompileFromPromptHandlers.declaredRoles.test.ts > intent-compile-from-prompt.declared-roles-injection (W2-8 A5f) > anti-hardcoding: arbitrary roleIds/descriptions/hint-ids from the RECORD ride the prompt verbatim (rendered FROM data, not vocabulary)
 Test Files  1 failed | 4 passed (5)
      Tests  3 failed | 28 passed (31)
   Start at  17:21:51
   Duration  1.48s (transform 656ms, setup 1ms, collect 3.75s, tests 438ms, environment 1ms, prepare 578ms)

RED evidence of the current no-role request shape (captured outbound prompt, R1 run):
  LAB INVENTORY (this lab owns; prefer these when binding labware/instruments):
  LABWARE: MagBinding Buffer, block, magstand

  1. Lyse the sample

  2. Lyse (variant a)

  3. Lyse (variant b)

  SCIENTIST-RESOLVED CHOICES (stated by the scientist for this run — treat as settled, do not re-ask):
  - lysis-method = bead-beater
  - lysis_variant = variant_a
(store.get call count: 0 — the handler never loaded the record, exactly the spec's §Diagnosis 1.)

## GREEN (verbatim, after implementation)

Command: cd server && npx vitest run src/api/handlers/IntentCompileFromPrompt

 ✓ src/api/handlers/IntentCompileFromPromptHandlers.apiKey.test.ts  (4 tests) 5ms
 ✓ src/api/handlers/IntentCompileFromPromptHandlers.answeredPrompt.test.ts  (4 tests) 78ms
 ✓ src/api/handlers/IntentCompileFromPromptHandlers.clarificationAnswers.test.ts  (5 tests) 101ms
 ✓ src/api/handlers/IntentCompileFromPromptHandlers.declaredRoles.test.ts  (7 tests) 117ms
 ✓ src/api/handlers/IntentCompileFromPromptHandlers.test.ts  (11 tests) 128ms
 Test Files  5 passed (5)
      Tests  31 passed (31)
   Start at  17:23:19
   Duration  1.45s (transform 590ms, setup 2ms, collect 3.51s, tests 409ms, environment 1ms, prepare 528ms)

Post-commit re-run (same command): 5 files / 31 tests passed (identical set).

## Tests pinned (spec §R + task mandates)

- R1: answers + readable kind=protocol record -> `store.get` called with the id;
  captured prompt contains 'DECLARED ROLES', roleId 'microcentrifuge-tube',
  description 'microcentrifuge tube', expectedLabwareKinds id
  'LAB-1-5ml-microcentrifuge-tube' (the fixture role of reproductions A/B), and
  the A5 answers block is NOT displaced.
- R2 (byte-identical regression): no sourceProtocolId vs unresolvable id ->
  prompts compared with `toBe` (exact string equality), no 'DECLARED ROLES'.
- R2/stop-boundary-1: kind=protocol record WITHOUT roles -> prompt byte-identical
  to the no-id baseline, 200, no throw.
- R3: ask branch (no answers) -> needsAnswers 200, no block in any captured
  prompt, `store.get` NOT called (answers branch only).
- R4: wrong-kind record (kind=labware carrying roles) -> behaves as absent
  (byte-identical prompt, 200, no new error path).
- R4-loud: genuine store fault (get throws) -> existing 500
  INTENT_COMPILE_PROMPT_FAILED convention preserved.
- anti-hardcoding: alien roleIds/descriptions/hint ids ('zzz-role', 'q9 widget',
  'LAB-zzz-9', 'qqq-mat', 'w7 fluid') ride the prompt verbatim — proof the block
  is rendered FROM the record, not from any vocabulary. [CORRECTED by advc cycle-1
  Defect 1: as originally written the fixture gave materialRoles NO hint array, so
  this test proved value pass-through but NOT generic field-name detection; see
  '## Fix cycle 1' — the strengthened fixture + assertions now prove it.]
- Every test asserts zeroWrites (create/update/delete/history never called).

## Bar 2 — server tsc (sorted set-diff vs branch point)

Baseline captured at 04f87ba6 (clean worktree, before any edit):
  cd server && npx tsc --noEmit  -> exit 2, `grep -c "error TS"` = 1
  src/ai/AgentOrchestrator.ts(347,18): error TS2339: Property 'id' does not exist on type 'ResolvedRecordTarget | ResolvedOntologyTarget | ResolvedSequenceTabTarget | ResolvedSequenceRecordTarget'.

After the fix (same command): exit 2, count = 1, identical line.
  diff <(grep "error TS" baseline | sort) <(grep "error TS" after | sort)  -> empty
  -> "TSC SET-DIFF EMPTY" (zero new errors; touched files clean).
Note: server tsconfig excludes **/*.test.ts, so the new test file is not
typechecked by tsc; it compiles and runs under vitest (esbuild transform) and
its 7 tests pass.

## Bar 3 — diff scope

Command: git -c core.fileMode=false diff --stat 04f87ba6..HEAD
  ...CompileFromPromptHandlers.declaredRoles.test.ts | 330 +++++++++++++++++++++
  .../handlers/IntentCompileFromPromptHandlers.ts    |  86 +++++-
  2 files changed, 409 insertions(+), 7 deletions(-)
numstat: 330/0 new test file; 79/7 handler. YAML files in diff: 0.
No app/, no schema/, no YAML, no wire-shape change (response envelopes untouched;
only the outbound model prompt content changed).

## Honesty/workstate parity

No workstate/honesty harness files exist in this worktree (searched
server/src and repo root for 'workstate|honesty' — 0 hits). The honesty-adjacent
guards that DO touch this handler all pass:
- src/compiler/scientistIntent/noBypass.test.ts ✓ (import-set closure unchanged)
- src/compiler/resolution/spine4ProductionWiring.test.ts ✓ (spine injection doctrine intact)
- the import-barrier source pin inside IntentCompileFromPromptHandlers.test.ts ✓
  (no forbidden imports added — only a type-only RecordEnvelope import).

## Pre-existing lane drift found (NOT caused by this change)

src/ingestion/vendor-protocol/ZymoCampaignNegatives.test.ts fails at suite level:
  Error: control promotion failed 500: {"statusCode":500,...,"message":"can't resolve reference ./datatypes/revision-ref.schema.yaml from id https://computable-lab.com/schema/computable-lab/protocol.schema.yaml"}
Proven pre-existing by stash-base parity: with my changes stashed (clean
04f87ba6 tree) the identical failure reproduces (1 failed file, 0 tests run).
Cause: schema/core/datatypes/revision-ref.schema.yaml is referenced by
protocol.schema.yaml:327 but is NOT tracked in trunk; it exists only as an
untracked file in cl-integration-2, excluded by
/home/brad/.hermes/cl/lanes/2/lane-exclude-a6fix-l2t0430:70. Other lane
worktrees (COERCION-PINS, COMP3-A6FIX, DECK-FOLD-1, ...) carry it as a local
file; this worktree does not. This is a lane-exclude/data-sync concern for the
orchestrator (a schema DATA file, outside my file ownership — I did NOT copy it
in). It does not affect the compile-from-prompt family (31/31 green without it).

## Stop boundaries

1. payload.roles missing/irregular on a kind=protocol record: treated as absent
   (pinned by test R2/stop-boundary-1). protocol.schema.yaml makes `roles`
   optional, so the case is reachable, not impossible.
2. terminalArtifacts/resolvedLabwares with the block present: NOT exercised by
   me — the spec mandates stubbed inference and NEVER hitting :3093, and model
   behavior cannot be honestly simulated. My tests pin the PROMPT-level
   guarantee (the model now receives the declared roles). The spine-bar question
   belongs to the orch's post-merge gate (reproduction A re-run + A5d re-shoot).
   No spine-bar evidence packet from me either way; nothing was widened.
3. No app/ change, no resolver change, no schema/YAML change, no wire-shape
   change was required. NOT HIT.

## Assumptions

- The role-block hint fields are detected generically (any string-array field on
  a role object other than roleId/description) rather than by field-name
  literals, so the renderer cannot drift from the schema's per-role hint names
  and hardcodes no policy.
- Block placement: appended AFTER the scientist-resolved-choices block at the
  call site (spec §D1 explicitly allows extend-or-append; append keeps
  composeAnsweredPrompt byte-identical for the no-roles path, which is what
  makes the R2 byte-identity guarantee trivially true).
- 'protocol' kind check reads payload.kind only (the record discriminator per
  protocol.schema.yaml:24); envelope.meta is not consulted.

W28-A5F DONE 409127c5baa9b630c25eabb8d23f922f4e1114a2

## Fix cycle 1 (advc-W28A5F-c1-l2t1730, Defect 1 — MINOR, test-strength gap)

Reviewer verdict: fix. Single defect: the anti-hardcoding test's alien fixture gave
materialRoles NO hint array (and no instrumentRoles at all), so a regression that
hardcoded hint detection to the literal name 'expectedLabwareKinds' passed all 7
tests (reviewer PROBE 2: 31/31 GREEN). Production code was (and remains) correct /
generic; the gap was test-strength + my overstated report claim.

### What changed (test file ONLY — handler untouched)

server/src/api/handlers/IntentCompileFromPromptHandlers.declaredRoles.test.ts
(330 -> 343 lines):
- Alien fixture strengthened per the fix direction: materialRoles now carries a
  populated `allowedMaterialIds: ['MAT-qqq-7']` and a new instrumentRoles entry
  carries `allowedInstrumentIds: ['INS-rrr-5']` — every role kind now has its own
  populated id-hint array under a DIFFERENT field name.
- New assertions in the anti-hardcoding test:
    expect(intentPrompt!).toContain('MAT-qqq-7');
    expect(intentPrompt!).toContain('rrr-inst');
    expect(intentPrompt!).toContain('e5 machine');
    expect(intentPrompt!).toContain('INS-rrr-5');
  so a field-name hardcode in EITHER role kind turns the test RED (the other
  kinds' ids vanish from the prompt).

### Discrimination proof (my own PROBE 2, RED then exact restore)

Pre-probe handler hash:
  ab2cf32ee1283b825d77deb8b0176cf6fc3f3417af372d806921fcb46bf713aa  server/src/api/handlers/IntentCompileFromPromptHandlers.ts

Throwaway edit (renderDeclaredRolesBlock hint filter, handler :187-191):
  -          field !== 'roleId' && field !== 'description' && Array.isArray(value)
  +          field === 'expectedLabwareKinds' && Array.isArray(value)

Run with the strengthened test + hardcoded filter:
  cd server && npx vitest run src/api/handlers/IntentCompileFromPrompt
  FAIL ... declaredRoles.test.ts > anti-hardcoding: arbitrary roleIds/descriptions/hint-ids ...
  AssertionError: expected 'LAB INVENTORY (this lab owns; prefer …' to contain 'MAT-qqq-7'
  Received block lines:
    - labwareRoles: zzz-role — q9 widget (declared ids: LAB-zzz-9)
    - materialRoles: qqq-mat — w7 fluid
    - instrumentRoles: rrr-inst — e5 machine
  Test Files  1 failed | 4 passed (5)
       Tests  1 failed | 30 passed (31)
  -> RED confirmed: the strengthened test discriminates the exact regression the
     reviewer's PROBE 2 could not catch (material/instrument ids vanish).

Exact restore + hash check:
  sha256sum -c /tmp/a5f_handler_pre_probe.sha256
  server/src/api/handlers/IntentCompileFromPromptHandlers.ts: OK
  git -c core.fileMode=false diff --stat -- .../IntentCompileFromPromptHandlers.ts -> EMPTY
  git -c core.fileMode=false status --short -> only the test file modified.

### Bars re-run after the fix (verbatim)

1) cd server && npx vitest run src/api/handlers/IntentCompileFromPrompt
   ✓ apiKey (4) / answeredPrompt (4) / clarificationAnswers (5) / declaredRoles (7) / main (11)
   Test Files  5 passed (5)
        Tests  31 passed (31)

2) cd server && npx tsc --noEmit
   src/ai/AgentOrchestrator.ts(347,18): error TS2339 ... ResolvedSequenceTabTarget.
   grep -c "error TS" = 1 — exactly the one pre-existing error, identical line;
   neither touched file appears.

3) git -c core.fileMode=false diff --stat 04f87ba6 (working tree incl. this fix)
   ...CompileFromPromptHandlers.declaredRoles.test.ts | 343 +++++++++++++++++++++
   .../handlers/IntentCompileFromPromptHandlers.ts    |  86 +++++-
   2 files changed, 422 insertions(+), 7 deletions(-)
   numstat: 343/0 test (grew +13), 79/7 handler (UNCHANGED by this fix).
   Scope: ONLY the two owned files. No app/, no schema/, no YAML.

### Corrected claim (per reviewer direction)

The generic-detection property is NOW test-proven: the anti-hardcoding test's
fixture populates expectedLabwareKinds, allowedMaterialIds, AND allowedInstrumentIds
with distinct alien ids, and the test asserts all three id sets ride the prompt
('LAB-zzz-9', 'MAT-qqq-7', 'INS-rrr-5' + their roleIds/descriptions). My own
hardcode-to-'expectedLabwareKinds' probe turns that test RED (1 failed | 30 passed),
so the suite now enforces detection by field SHAPE (string-array fields other than
roleId/description), not by any single field-name literal. The earlier report text
("detected generically ... cannot drift") is corrected above in 'Tests pinned':
before this cycle it proved value pass-through only.

W28-A5F DONE2 f3f9814718b60a7404326ea633211c9e91657a14
