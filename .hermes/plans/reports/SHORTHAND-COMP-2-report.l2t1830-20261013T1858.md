# SHORTHAND-COMP-2 — contract disclosure (PART II, tasks 8-13) — coder report

Lane 2. Worktree `/mnt/vast/home/brad/git/wt/SHORTHAND-COMP-2-lane2-20261013T1858`,
branch `cl/SHORTHAND-COMP-2-lane2-20261013T1858`.
Spec: `.hermes/plans/2026-10-13_shorthand-comp-2-contract-disclosure-spec.md` (read fully,
both promotion notes; OQ1/OQ2/OQ3 rulings followed as written).

## 0. Branch point and re-anchor

Branch point: **c5326e7d** (docs checkpoint `docs(lane2): l2t1830 checkpoint…`, direct child
of **11af0d19** = THREAD-ASK-1 merge, the dispatch-mandated tip).

Re-anchor (spec-mandated): `git log b25d2505..c5326e7d` over the four hot files shows the only
commits touching them are THREAD-ASK-1's (IntentCompileFromPromptHandlers/ClarificationPicker
wiring) — **shorthandChat.ts / AgentOrchestrator.ts / vocabulary.ts / liftScientistIntent.ts
regions re-found BY NAME and all VERIFIED UNMOVED** at c5326e7d:
- liftScientistIntent.ts `params`/`parameters` continue-skip — present (fixed in C1).
- AgentOrchestrator.ts `FORCED_DRAFT_TOOL_INSTRUCTION` constant + CLOSED-vocabulary last
  bullet — present; `parseScientistIntent(shorthandYaml)` turn-path call +
  `shorthandRepairAsked` one-re-ask budget — present.
- shorthandChat.ts `compileShorthandDeterministically` (by name), fold re-parse,
  `malformedShorthandRepairPrompt` — present at the b25d2505-pinned positions.
- vocabulary.ts `argContracts`/`promptVerbBlock`/`toolActionEnum` — present.
- intentCompile.ts map-key shape + "NEVER write a literal 'action:'" line — present (fixed in C4).
- realizeScientistIntent.ts `QUANTITY_ID` + module-private `getQuantityValidator` — present.

## 1. Baselines — RE-MEASURED at MY branch point c5326e7d (raws: `.hermes/plans/drafts/raws/base-run.log`)

| Check | Command | BASE (c5326e7d) | HEAD (521b3daf) |
|---|---|---|---|
| Server types | `cd server && npx tsc --noEmit \| grep -c "error TS"` | **0** | **0** |
| App types | `cd app && npx tsc --noEmit \| grep -c "error TS"` | **23** | **23** |
| Compiler suite | `npx vitest run src/compiler/scientistIntent/ src/compiler/biology/` | **20 files / 256 tests passed** | **24 files / 276 tests passed** (+4 new test files, +20 tests) |
| Shorthand/prompt neighborhood (6 spec files) | as spec | **6 files / 47 tests passed** | **6 files / 47 tests passed** |
| Corpus | `npx vitest run src/corpus/` | **6 files / 41 tests passed** | **6 files / 41 tests passed** |
| AI suite broad | `npx vitest run src/ai/` | **10 failed / 83 passed (93); 18 failed / 741 passed (759)** | **10 failed / 85 passed (95); 18 failed / 757 passed (775)** |
| Broad gate (ai+scientistIntent+corpus) | combined run | — | **10 failed / 110 passed (120); 18 failed / 1010 passed (1028)** |
| Zero-new proof | `comm -13 base-failfiles head-failfiles` | — | **empty** (9 identical FAIL files: bypass, Forwarding, golden, goldenWithSeeds, tubeGate, attachedProtocol, ChatbotCompileDeckSlot, createRecordIntent, submitSuggestionTool.tubeSchema — all pre-existing trunk debt, none in my hot files) |
| Golden pin | `git hash-object …/goldens/MANIFEST.yaml` | **83fda3b42519eed879bc5e49290e724f727be509** | **83fda3b42519eed879bc5e49290e724f727be509** (byte-identical; `git diff c5326e7d..HEAD --stat` touches NO goldens/ file) |
| Prompt ratchet | inside promptBudget (printed line, both runs) | see quote below | see quote below |

MANIFEST hash note (honest, not a defect): the spec's blob `58c447eb…` was true at a28d9789;
trunk re-blessed it deliberately at **4ffd8c1f** (`test(goldens): re-bless records gaining
resolvedLabwares`), an ancestor of my branch point — hash at b25d2505 = 83fda3b4 already.
The binding gate (branch == head, byte-identical, no goldens touched) holds: **83fda3b4 at both**.

Prompt ratchet line, printed VERBATIM at base AND head (ceiling UNMOVED, bait #4 respected —
the block was injected ONLY into the three legal sites, never the four ratchet-measured strings):

    draft prompt budget: 45439 chars (agent 24543 + material-rules 3849 + instruction 3061 + schema 13986) — ceiling 47180 (headroom 1741)

## 2. Commit plan executed (RED-first)

1. **C1 = 7ea9ffb9** `fix(scientist-intent): the lift must not drop the open params slot…`
   (task 8) — `liftScientistIntent.ts` verbatim params carry-through + `liftParamsPreservation.test.ts`.
2. **C2 = b2e70349** `fix(shorthand-chat): lift model aliases (verb:, verb-as-key, parameters:, snake_case) before the Ajv door on the run-chat turn`
   (task 9) — new export `parseShorthandForChat` in `shorthandChat.ts`; AgentOrchestrator turn-path
   call swapped (catch + one-re-ask budget byte-unchanged — diff shows exactly 3 hunks: import,
   :525 bullet, :2277 call swap); fold re-parse routed through the same door (idempotent: the lift
   of an already-lifted doc is a no-op — pinned in `shorthandChat.lift.test.ts`).
3. **C3 = 33affe3e** `feat(shorthand): disclose the closed vocabulary to the model (generated from the vocabulary YAML)…`
   (tasks 10a/10b/10c) — `vocabulary.ts contractBlock()` generated from verbsFrozen+argContracts
   (NO hand-written verb list); disclosure at tool-def description, forced-draft bullet replaced
   with pointer bullet + block interpolated ONCE (OQ1 ruling), repair prompt + canonical example.
4. **C4 = 5097b91b** `fix(scientist-intent): the prompts teach the shape the schema accepts (action:), and a parity test pins it`
   (task 11) — `intentCompile.ts` shape block rewritten to canonical `action:` form, the
   "NEVER write a literal 'action:'" line deleted; registry template untouched;
   `promptShapeParity.test.ts` added.
5. **C5 = 521b3daf** `test(scientist-intent): pin the shipped Quantity law on the wire path (12a) + one-shot shape acceptance for both Brad prompts (13)`
   — `quantityWireContract.test.ts` + `getQuantityValidator`/`QUANTITY_SCHEMA_ID` export in
   `realizeScientistIntent.ts` (OQ2 default) + task-13 headless acceptance appended to the parity file.

## 3. REDs verbatim (raws under `.hermes/plans/drafts/raws/`)

C1 (`c1-red.txt`):
    AssertionError: expected undefined not to be undefined   (liftParamsPreservation.test.ts:27 — action.params gone after lift)
    AssertionError: expected undefined to deeply equal { anything: { nested: true }, …(2) }   (verbatim-carry pin)

C2 (`c2-red.txt`):
    TypeError: parseShorthandForChat is not a function   (x2: verb: key pin, verb-as-map-key pin)
    AssertionError: expected error to be instance of ScientistIntentValidationError   (fabricated-verb pin — lift must not launder inventions)

C3a (`c3a-red.txt`):
    TypeError: vocab.contractBlock is not a function   (x3: verb list, set-equality both directions, argContracts mirror)

C3b (`c3b-red.txt`):
    AssertionError: expected 'event_shorthand only (SHORTHAND-CHAT)…' to contain 'ACTIONS (the CLOSED vocabulary — neve…'   (tool def)
    AssertionError: expected 'EVENT-EDITOR DRAFT MODE:…' to contain 'ACTIONS (…'   (forced draft, interpolated ONCE)
    AssertionError: expected 'Your `shorthand` document was REJECTE…' to contain 'ACTIONS (…'   (repair prompt)

C4 (`c4-red.txt`) — proves the spec's Task-11 claim end-to-end at trunk:
    AssertionError: expected [Function] to not throw an error but 'ScientistIntentValidationError: scientist-intent failed schema validation: 6 error(s)'
    AssertionError: headless system prompt (intentCompile.ts): expected 'intentId: <short id>\nactions:\n  - a…' to match /- action:/

C5: **no RED claimed** — 12a is a characterization pin on the SHIPPED Quantity law
(`{value:10000,unit:'cells',dimension:'count'}` valid; `{value:50,unit:'uL',dimension:'count'}`
rejected — dimension collapse is a schema error). The shipped schema already enforces it; a fake
RED would have been theater. It passes at head (4 tests).

## 4. Probes re-run in MY tree

- `probe-comp2.mts` (head): generated contract block = **4,517 chars, 31 verbs** — matches the
  composer probe number exactly. P2 (map-key doc taught by the OLD headless prompt) REJECTED by
  strict Ajv; P3 (canonical `action:` doc) parses clean.
- `probe-taught-shapes.mts`: every taught shape at HEAD parses through `parseShorthandForChat`
  (canonical parses strict; legacy map-key/`verb:` parse via the lift — never taught).
- `probe-char-delta.mts` (head, OQ1 auditability):
  - block: 4,517 chars; occurrences: 1 in tool-def description, 1 in forced draft, 1 in repair.
  - tool-def `shorthand` description: **528 → 5,247** chars (+4,719).
  - `FORCED_DRAFT_TOOL_INSTRUCTION`: **~5,039 → 9,789** chars (+4,750).
  - `malformedShorthandRepairPrompt`: **~539 → 5,255** chars (+4,716; paid ONLY on a rejection).
  - Real per-turn growth: **~+9.5 KB** (tool-def + forced draft), repair copy only on failure —
    matches OQ1's ~9KB estimate. Ratchet-measured four strings untouched (budget line identical).

## 5. Gate results per commit

- C1 gate (`c1-gate2.txt`): `src/corpus/ src/compiler/scientistIntent/` = **22 files / 237 tests passed**.
- C2 gate2 (`c2-gate2.txt`): ai+scientistIntent = 10 failed / 100 passed, 18 failed tests —
  identical fail-file set to base (`comm` empty); targeted shorthand trio 3 files / 31 tests passed.
- C3 gate2 (`c3-gate2.txt`): 10 failed / 102 passed, 18 failed — zero new.
- C4 gate (`c4-gate.txt`): 10 failed / 109 passed, 18 failed — zero new.
- HEAD full gate (`head-full-gate2.txt`): **10 failed / 110 passed (120); 18 failed / 1010 passed**;
  `comm -13` vs base fail-file list = **empty**; server tsc **0**.
- Neighborhood 6/47 and corpus 6/41 green at head; `vocabularyMirrorDrift.test.ts` and
  `vocabularyRipOut.test.ts` (8/8) green at head.

## 6. Disclosures / lessons

1. **bait-11 bites comments, not just code**: `vocabularyRipOut.test.ts` bait 11 scans every
   non-test `.ts` in `src/compiler/scientistIntent/` against `/\bspawn\b|line-dsl|shorthand/i`.
   My new comments tripped it three times (liftScientistIntent.ts, vocabulary.ts,
   realizeScientistIntent.ts — the last surfaced only in the FULL head gate, after the targeted
   runs were green). All reworded (e.g. "COMP-2 12a", "CONTRACT block"); ripout 8/8 green at head.
2. **DEFECT-4 re-pin** (`AgentOrchestrator.shorthandChat.test.ts`, the one existing test file
   touched): its pin fed a synthetic `bogusField` expecting the strict door to reject it; the
   lift (task 9, by design) scrubs unknown noise, so the fold now succeeds. Re-pinned with a
   lift-proof defect (fabricated verb) — same intent, honest adaptation to the landed behavior.
3. **Product files touched = 7**: the spec's six + `realizeScientistIntent.ts` (export-only,
   mandated by task 12/OQ2: "export it rather than write a second loader — do that and say so").
   No COMP-1/COMP-3 file touched; no schema/goldens file touched; no `count:` anywhere;
   `ALLOWED_PARAM_KEYS` untouched.
4. **Lane repair** (not product): fresh worktree needed the trunk symlink materialization
   (server/schema + 43 server + 15 app symlinks) and per-workspace `node_modules` links
   (`server/node_modules -> computable-lab/server/node_modules` etc.), plus the trunk-UNTRACKED
   `schema/core/datatypes/revision-ref.schema.yaml` copied in. Without these, server tsc falsely
   read 391.

## 7. Task 12b note (10 lines, per spec)

Count-as-dimension SHIPS on lane 2: `schema/core/datatypes/quantity.schema.yaml` +
`quantity-ratio.schema.yaml` exist on trunk (W2-2, d83f8be6). The realization gate already
consumes them (`realizeScientistIntent.ts` QUANTITY_ID + validator, consumers at the
realization checks). What does NOT ship: the WIRE contract — a declared `quantity:` vocabulary
arg and the `params.composition` Quantity form — because both live in
`schema/workflow/scientist-intent.schema.yaml` / the vocabulary YAML, i.e. MANIFEST-pinned
Stage-B ground. The W2-2 header rules "Migration of existing fields is a later wave"; C5's law
test is that wave's first slice. The migration (declared `quantity:`/`composition` args +
MANIFEST re-bless) stays open for **SHORTHAND-COMP-4**. Naming caution honored: no bare
`count:` field, `count` NOT added to `ALLOWED_PARAM_KEYS`.

## 8. Task 13 findings (investigation, report-only)

- **Reasoning leak (read-only evidence)**: `app/src/event-editor/right-pane/ai/AiTabPanel.tsx`
  ~:850-858 — comment VERIFIED: "we send enableThinking: false explicitly because the chat
  template defaults reasoning ON… The user-facing toggle was removed." Client-side the flag is
  pinned OFF. `reasoning` plumbing exists ONLY in `EventEditorContext.tsx` (:154-155 message
  field, :383-396 fixit-phase reducer actions, :945/:953) — the chat panel renders NO reasoning
  text anywhere (grep over `app/src/event-editor/**` non-test: zero render sites). The lane-2
  backend log (`/mnt/vast/home/brad/git/cl-integration-2/.run/backend.log`) contains zero
  streamed-reasoning lines (only the maxTokens warning at :333). So Brad's visible
  reverse-engineering is most likely MODEL CONTENT, not leaked reasoning — the live screenshot
  leg remains the orchestrator's (OQ3).
- **Repair budget**: with tasks 8-10 landed the ONE re-ask (`shorthandRepairAsked`,
  AgentOrchestrator :2288-2292, budget byte-unchanged) is effectively dead for SHAPE errors:
  the lift absorbs `verb:`, verb-as-map-key, `parameters:`, snake_case; the disclosure teaches
  the canonical `action:` shape at all three sites; the parity test forbids teaching any
  rejected shape. A re-ask now fires only for a fabricated verb or structural garbage — and the
  repair prompt now carries the full menu, so even that re-ask is informed.
- **One-shot shape acceptance (headless equivalent, shipped in C5)**: both Brad prompts written
  AS canonical `action:` documents (prompt 1: 50uL trypsin-EDTA/DMEM+FBS mixture with
  `params.composition` incl. a Quantity cell count; prompt 2: seed 10,000 cells with
  counter_density ratio) pass `parseShorthandForChat` on the FIRST pass (no validation throw,
  params/composition survive) and `compileShorthandDeterministically` with every clarification
  carrying an `actionLocation` (noun bars only — zero shape-class complaints). 2 tests green.

## 9. Live legs handed back to the orchestrator (OQ3 — I did NOT restart the stack)

1. Merge `cl/SHORTHAND-COMP-2-lane2-20261013T1858` into `cl/integration-2`, then restart lane 2
   via the orchestrator's own script: `bash /mnt/vast/home/brad/git/cl-integration-2/cl-lane-stack.sh restart 2`
   (backend :3093, frontend :5193; logs at `/mnt/vast/home/brad/git/cl-integration-2/.run/backend.log`).
2. Type Brad's two prompts in the run chat at :5193, then:
   `grep -n "asking the AI to re-emit" /mnt/vast/home/brad/git/cl-integration-2/.run/backend.log`
   — **expected EMPTY** for those two turns (status-line anchor at AgentOrchestrator.ts:2292).
3. Reasoning-leak screenshot leg: run-chat turn on :5193, screenshot the assistant bubble,
   receipt per `~/.hermes/cl/browser-receipts.md` (cl-browser-reviewer).

## 10. Head

HEAD commit: **521b3dafd2c9e1776534edf0141c05e1d3509522** (C5).
Commits: 7ea9ffb9 → b2e70349 → 33affe3e → 5097b91b → 521b3daf.
Diff c5326e7d..HEAD: 14 files, +623/-25 (7 product, 6 new test files, 1 re-pinned existing test).


---

---

# FIX CYCLE 1 (adversarial review SHORTHAND-COMP-2-l2t1915 — Defect 1, minor)

Review verdict: **fix**, one defect, no blocker, no major. Ruling taken: **direction (b)** —
keep the hunk, add the pin, disclose it here. All raws below are CODER-CAPTURED under
`.hermes/plans/drafts/raws/`; every fenced tail below was extracted from its raw file
programmatically (not retyped) and re-checked with `grep -F -x`.

## F1. DEFECT 1 DISCLOSURE (the hunk my section 6.3 failed to disclose)

**File/line:** `server/src/compiler/scientistIntent/liftScientistIntent.ts:67-69`
**Commit:** `b2e70349` (`fix(shorthand-chat): lift model aliases (verb:, verb-as-key, parameters:,
snake_case) before the Ajv door on the run-chat turn` — task 9). `git -c core.fileMode=false
blame -L 67,70` attributes lines 67-69 to `b2e703495` (lines 66 and 70 are Brad's original
`d3c754408`); `git show b2e70349 --stat` lists
`.../scientistIntent/liftScientistIntent.ts | 3 ++` alongside the four task-9 files.

**The hunk verbatim** (from `git show b2e70349 -- .../liftScientistIntent.ts`):

    +  // SPINE-1 expected-domain slots (declaration only — the wire schema accepts
    +  // them; the lift must not silently drop what the schema allows).
    +  'expectedSourceDomain', 'expectedTargetDomain', 'expectedLabwareDomain',

added to `ALLOWED_PARAM_KEYS` (the lift's action-level whitelist, consulted at
`liftScientistIntent.ts:171` — `if (!ALLOWED_PARAM_KEYS.has(canonicalKey)) continue;`).

**Why it was made:** during task 8's lift work I found that the wire schema DECLARES the three
expected-domain slots (`schema/workflow/scientist-intent.schema.yaml:126-132`) and `types.ts:76-78`
carries them, yet the lift's whitelist silently dropped them at the action level. That is the same
defect class task 8 was about — the lift erasing what the schema allows — one key away from `params`,
in the same whitelist, in the same file I was already editing. I repaired it there rather than leave
a known drop in place. **This was an in-scope repair of the SPINE-1 slot path discovered during task
8's lift work, recorded under the existing item per lane rules.** It was NOT a new item, NOT a schema
edit (the schema already declared the slots; no schema file was touched), and NOT a new policy home:
the tags stay declaration-only — `normalizeScientistIntent` still does not consume them, pinned at
`scientistIntentContract.test.ts:211` (`expect(out.candidateEvents[0]).not.toHaveProperty(
'expectedSourceDomain')`), which stays green.

**Why the reviewer is right that it needed disclosure + a pin:** the lifted document IS the corpus
training target (`server/src/corpus/shorthandCorpus.ts:61` — `liftScientistIntent(input.shorthand)`
runs before the entry is built) and the headless compile route. So the whitelist change silently
changed training/replay data for every document carrying those keys: before b2e70349 an action-level
`expectedSourceDomain` was dropped; after, it rides through. No COMP-2 test referenced
`expected*Domain` at all.

**Correction to my own section 6.3 (my error, not the reviewer's):** 6.3 states
"`ALLOWED_PARAM_KEYS` untouched". That statement is FALSE at head — b2e70349 added three keys to it.
The rest of 6.3 holds (7 product files; no COMP-1/COMP-3 file; no schema/goldens file; no `count:`).
The claim was wrong because I described the whitelist only through the task-8 `params` branch and
never re-read the constant. Corrected here rather than silently amended.

## F2. The pin added (RED-first, falsification pair proven by mutation)

**New test file:** `server/src/compiler/scientistIntent/expectedDomainLiftPin.test.ts` (4 tests).
No product file changed in this fix cycle.

1. **keeps** — all three `expected*Domain` tags ride the lift VERBATIM and survive
   `parseScientistIntent` (Ajv) afterwards.
2. **whitelist is still a whitelist** — at the SAME action level, `bogusField` (not in
   `ALLOWED_PARAM_KEYS`) is still dropped while `expectedSourceDomain` is kept. This is the half that
   falsifies a widening.
3. **MUTATION LEG (in-test)** — the lift source is read from disk, the three keys surgically removed
   from the `ALLOWED_PARAM_KEYS` literal, and the whitelist re-extracted as DATA from both texts
   (`allowedParamKeysFromText`, the same source-text extraction method `vocabularyMirrorDrift.test.ts`
   uses), compared as **set diffs, never lengths**: `onlyMutated == []` and
   `onlyShipped == [expectedLabwareDomain, expectedSourceDomain, expectedTargetDomain]`.
4. **shared-consumer leg** — `buildShorthandCorpusEntry` (the corpus TRAINING TARGET builder, which
   lifts before storing) carries all three tags into `entry.shorthand.actions[0]`.

**Empirical RED proof (out-of-band mutation, raws not claims).** The pin passes at head, so a natural
RED was impossible; per the fix-run mutation-demo rule I injected the two possible regressions and
reverted each immediately.

MUTANT 1 — the three keys deleted from `ALLOWED_PARAM_KEYS` (the exact pre-hunk state). Raw
`fix1-mutation-revert.txt`, failing legs:

```
 ❯ src/compiler/scientistIntent/expectedDomainLiftPin.test.ts  (4 tests | 4 failed) 87ms
   ❯ src/compiler/scientistIntent/expectedDomainLiftPin.test.ts > lift keeps the SPINE-1 expected-domain slots (Defect 1 pin) > all three expected*Domain tags ride the lift VERBATIM and past Ajv
     → expectedSourceDomain: expected undefined to be type of 'string'
   ❯ src/compiler/scientistIntent/expectedDomainLiftPin.test.ts > lift keeps the SPINE-1 expected-domain slots (Defect 1 pin) > the whitelist is still a WHITELIST: an unknown action-level key is dropped
     → expected undefined to be 'cell_suspension' // Object.is equality
   ❯ src/compiler/scientistIntent/expectedDomainLiftPin.test.ts > lift keeps the SPINE-1 expected-domain slots (Defect 1 pin) > MUTATION LEG: the whitelist WITHOUT the three slots differs from the shipped one (RED proof)
     → expected '/**\n * liftScientistIntent — pre-val…' not to be '/**\n * liftScientistIntent — pre-val…' // Object.is equality
   ❯ src/compiler/scientistIntent/expectedDomainLiftPin.test.ts > lift keeps the SPINE-1 expected-domain slots (Defect 1 pin) > the CORPUS TRAINING TARGET carries the tags (shared-consumer leg)
```

```
 Test Files  1 failed (1)
      Tests  4 failed (4)
   Start at  20:08:32
   Duration  816ms (transform 113ms, setup 0ms, collect 185ms, tests 87ms, environment 0ms, prepare 79ms)
```

All four legs go RED on a revert — the pin is not vacuous, and the corpus leg's diff literally shows
the three tags vanishing from the stored training target.

MUTANT 2 — the whitelist gate neutered (`if (false && ALLOWED_PARAM_KEYS.has(canonicalKey))
continue;`), i.e. a widened whitelist. Raw `fix1-mutation-widen.txt`:

```
 ❯ src/compiler/scientistIntent/expectedDomainLiftPin.test.ts  (4 tests | 1 failed) 85ms
   ❯ src/compiler/scientistIntent/expectedDomainLiftPin.test.ts > lift keeps the SPINE-1 expected-domain slots (Defect 1 pin) > the whitelist is still a WHITELIST: an unknown action-level key is dropped
```

```
 ❯ src/compiler/scientistIntent/expectedDomainLiftPin.test.ts:117:34
    115|     });
    116|     const action = firstAction(lifted);
    117|     expect(action['bogusField']).toBeUndefined();
       |                                  ^
    118|     expect(action['expectedSourceDomain']).toBe('cell_suspension');
```

```
 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
   Start at  20:08:39
   Duration  792ms (transform 105ms, setup 0ms, collect 155ms, tests 85ms, environment 0ms, prepare 66ms)
```

So the pair falsifies BOTH revert directions exactly as the ruling required: a revert trips tests 1
and 4 (and the in-test mutation leg), a widening trips test 2. Both mutants were reverted with
`git -c core.fileMode=false checkout --` before anything was committed; `git status` then showed the
product file byte-clean with only the new test file untracked.

## F3. Gates re-run at the fix head (raws under `.hermes/plans/drafts/raws/`)

Server types — `cd server && npx tsc --noEmit`: **exit 0, 0 `error TS` lines** (raw `fix1-tsc.txt`,
0 lines).

New test file typechecked standalone — trunk's tsconfig excludes `**/*.test.ts`, so test-file classes
are NEVER typechecked at trunk. I pinned mine with the project's strict flags via an in-tree copy
(`src/compiler/scientistIntent/__tsonlycheck.ts`, deleted immediately after): `npx tsc --noEmit
--strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess --noUnusedLocals
--noUnusedParameters --noImplicitReturns --noFallthroughCasesInSwitch --isolatedModules
--module esnext --moduleResolution bundler --target es2022 --lib es2022 … __tsonlycheck.ts` ->
**exit 0, no output** (`fix1-testfile-tsc.txt`). Honest note: the FIRST standalone run surfaced 2
real `noUncheckedIndexedAccess` errors in my `allowedParamKeysFromText` helper (`Type
'(string | undefined)[]' is not assignable to type 'string[]'` and `Object is possibly 'undefined'`)
— fixed with explicit `m?.[1]` narrowing + a type predicate, then clean.

Targeted gate — `npx vitest run src/compiler/scientistIntent/ src/compiler/biology/` (raw
`fix1-gate-intent-final.txt`; 24 files / 276 tests at 521b3daf -> +1 file, +4 tests):

```
 Test Files  25 passed (25)
      Tests  280 passed (280)
```

Corpus — `npx vitest run src/corpus/` (raw `fix1-gate-corpus.txt`):

```
 Test Files  6 passed (6)
      Tests  41 passed (41)
   Start at  20:09:04
   Duration  880ms (transform 256ms, setup 1ms, collect 816ms, tests 333ms, environment 1ms, prepare 613ms)
```

Vocabulary guards — `vocabularyRipOut.test.ts` (8) + `vocabularyMirrorDrift.test.ts` (6), raw
`fix1-gate-ripout.txt` — ripout **8/8** green:

```
 Test Files  2 passed (2)
      Tests  14 passed (14)
   Start at  20:09:09
   Duration  1.21s (transform 391ms, setup 0ms, collect 1.12s, tests 90ms, environment 0ms, prepare 153ms)
```

Pin + params pin + ripout in one run (raw `fix1-green.txt`):

```
 Test Files  3 passed (3)
      Tests  16 passed (16)
   Start at  20:11:53
   Duration  1.77s (transform 456ms, setup 1ms, collect 1.02s, tests 278ms, environment 0ms, prepare 314ms)
```

Prompt ratchet — `npx vitest run src/ai/promptBudget.test.ts`: 6 passed; the printed line is
byte-identical to the section 1 baseline (ceiling UNMOVED, bait 4 respected):

    draft prompt budget: 45439 chars (agent 24543 + material-rules 3849 + instruction 3061 + schema 13986) — ceiling 47180 (headroom 1741)

Golden pin — `git -c core.fileMode=false hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml`
= **83fda3b42519eed879bc5e49290e724f727be509** (unchanged from section 1; no goldens/ or schema file
in this fix cycle's diff).

**Zero-new proof — same-scope base-vs-head `comm`, not an exit-0 claim.** The named targeted gates
are green, but I also ran the broad `src/ai/ src/compiler/ src/corpus/` scope twice at the SAME head,
once with my new test file moved out of the tree and once with it restored. Raw tails verbatim:

without the new test file (raw `fix1-base-broad.txt`):

```
 Test Files  26 failed | 234 passed (260)
      Tests  51 failed | 2183 passed (2234)
     Errors  2 errors
   Start at  20:10:15
   Duration  26.66s (transform 35.44s, setup 48ms, collect 223.30s, tests 67.28s, environment 206ms, prepare 88.47s)
```

with the new test file (raw `fix1-head-broad.txt`):

```
 Test Files  26 failed | 235 passed (261)
      Tests  51 failed | 2187 passed (2238)
     Errors  2 errors
   Start at  20:09:20
   Duration  30.26s (transform 22.86s, setup 91ms, collect 241.78s, tests 87.48s, environment 305ms, prepare 108.47s)
```

Fail-SET comparison (both lists preserved for re-derivation):

    grep -E '^ FAIL ' fix1-base-broad.txt | sed 's/ FAIL  //' | sort -u > fix1-base-failfiles.txt   (51 lines)
    grep -E '^ FAIL ' fix1-head-broad.txt | sed 's/ FAIL  //' | sort -u > fix1-head-failfiles.txt   (51 lines)
    comm -13 fix1-base-failfiles.txt fix1-head-failfiles.txt  -> EMPTY (no new fail files)
    comm -23 fix1-base-failfiles.txt fix1-head-failfiles.txt  -> EMPTY (no disappeared fails)

+1 file / +4 tests at head = exactly my new pin. The 26 failing files are pre-existing trunk debt in
`src/ai/` (AgentOrchestrator.bypass, AgentOrchestratorForwarding, AgentOrchestrator.golden,
AgentOrchestrator.goldenWithSeeds, AgentOrchestrator.tubeGate, attachedProtocol,
ChatbotCompileDeckSlot, createRecordIntent, submitSuggestionTool.tubeSchema, chatbotCompile.e2e) and
`src/compiler/{derive,pipeline,protocol,patterns}` (seedModels.fluorescence, aiPrecompileGating,
BaselineFixtures, CrossTurnMini, FixItFixtures, FixtureRunner, PatternExpandersDebug, Prompt01Green,
Prompt02Green, Prompt04DeepDebug, ParserEvalHarness, AiPrecompileShapeMismatch.log,
GeminiEmAppliancePath, FourLayerCorrespondence, StructuralCorrespondencePass, QuadrantStampExpander)
— none in any file this item touched. `Errors 2 errors` is the pre-existing unhandled-exception debt,
identical base/head. Scope note: the broad `src/compiler/` run is WIDER than this item's named gate
(`src/compiler/scientistIntent/ src/compiler/biology/`), which is why the section 1 table reads
10 failed / 110 passed — different scope, same zero-new method.

## F4. Scope discipline for this fix cycle

- Product files changed in fix cycle 1: **ZERO**. The hunk under discussion stays exactly as it was
  (ruling (b)); nothing else moved. `git -c core.fileMode=false diff --name-only 521b3daf..HEAD`
  lists only this report.
- New files: `expectedDomainLiftPin.test.ts` (outside `goldens/`), this report section, and raws
  `fix1-mutation-revert.txt`, `fix1-mutation-widen.txt`, `fix1-tsc.txt`, `fix1-testfile-tsc.txt`,
  `fix1-gate-intent.txt`, `fix1-gate-intent-final.txt`, `fix1-gate-corpus.txt`,
  `fix1-gate-ripout.txt`, `fix1-green.txt`, `fix1-base-broad.txt`, `fix1-head-broad.txt`,
  `fix1-base-failfiles.txt`, `fix1-head-failfiles.txt`, `fix1-final-confirm.txt`.
- **bait-11 comment scan:** `vocabularyRipOut.test.ts` bait 11 scans only NON-test `.ts` files in
  `src/compiler/scientistIntent/` against `/\bspawn\b|line-dsl|shorthand/i`. My new file is a
  `.test.ts` (exempt, and it legitimately names `shorthandCorpus.ts` and the `shorthand` training
  target). No non-test file in that directory was edited in this cycle, so the scan is untouched:
  ripout **8/8 green** (`fix1-gate-ripout.txt`).
- Lesson recorded in my skill: a dynamic `import()` of a source-text mutant does NOT work under vite
  (TS syntax in a `data:` URL fails to parse — `Unexpected identifier 'ScientistIntentVocabulary'`).
  The house pattern is what `vocabularyMirrorDrift.test.ts` does: mutate the SOURCE TEXT, extract the
  structure as DATA, assert SET DIFFS, and prove the mutant empirically out-of-band.

## F5. Fix-cycle head

Prior head: 521b3dafd2c9e1776534edf0141c05e1d3509522 (report head 0f1cc55c).
Fix commit: the SINGLE commit this report ships in, on top of 0f1cc55c on
`cl/SHORTHAND-COMP-2-lane2-20261013T1858` — message
`test(scientist-intent): pin expected-domain slots surviving the shared lift + report disclosure`
(2 files: `expectedDomainLiftPin.test.ts` +184, this report; ZERO product files). A report cannot
contain its own commit's sha, so derive it: `git -c core.fileMode=false log -1 --format=%H` in the
worktree (the sha is also in the coder's dispatch return).
`git -c core.fileMode=false diff --name-only 521b3daf..HEAD` = this report + the new test file only.
Live legs from section 9 remain handed back to the orchestrator, unchanged by this fix cycle.
