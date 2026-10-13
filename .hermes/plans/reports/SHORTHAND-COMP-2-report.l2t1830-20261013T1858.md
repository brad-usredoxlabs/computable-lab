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
