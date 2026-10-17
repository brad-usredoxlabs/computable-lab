# SPEC — SHORTHAND-COMP-2: disclose the contract (wire the lift, generate the vocabulary into the prompt, teach ONE shape, adopt shipped Quantity) — plan PART II, tasks 8-13

> DRAFT composed 2026-10-13 by cl-spec-composer (l2t0015) for the lane-2 coder. The orchestrator promotes.
> Canonical plan: `.hermes/plans/2026-10-11_115357-shorthand-material-composition-decomposition.md` — **ONLY PART II (tasks 8-13) is in scope.** Part III/IV (14-23) is SHORTHAND-COMP-1 (being coded RIGHT NOW); Part I (1-7) is SHORTHAND-COMP-3; Stage B is SHORTHAND-COMP-4. Do NOT do their work here.
> **Re-anchor note:** the plan pinned lines at `d6d2c689`. Trunk tip at composition time is **`a28d97892c28f4bf96bb831db096809a6a3f7eea`** ("docs(lane2): l2t2230 checkpoint — D4 deck-surface fix merged+probe-green…"). EVERY line number below was re-verified first-hand at `a28d9789` (several moved by the SHORTHAND-CHAT fix cycles merged since d6d2c689).
> **COMP-1 dependency (hard):** SHORTHAND-COMP-1 is in flight in `/mnt/vast/home/brad/git/wt/SHORTHAND-COMP-1-lane2-l2t0015` (verified live: it already carries a `simpleVerbs.ts` +44 / new `addMaterialVolume.test.ts` diff at its tip on base a28d9789). It touches `simpleVerbs.ts`, `normalizeScientistIntent.ts`, `shorthandChat.ts`, `ChatbotCompilePasses.ts`, `config/drafting/*`. **Branch off the trunk tip AT DISPATCH. If COMP-1 has merged (assume yes — it is the dep), trunk moved: re-anchor every `shorthandChat.ts` line below against the new tip and re-measure the baseline table before coding.** Shared-file overlap is exactly one file, `shorthandChat.ts` (COMP-1 edits `shorthandResultFromCompile` ~:458+; you add an export near :206 and edit `malformedShorthandRepairPrompt` :396-412 — different regions, expect a rebase, not a conflict). Never edit anything in COMP-1's worktree.

## Goal (one sentence)

The run-chat shorthand path must stop enforcing a contract it never shows the model: lift model aliases BEFORE the Ajv door (tasks 8-9), disclose the closed verb vocabulary + per-verb args GENERATED from the vocabulary YAML into the tool def, the forced-draft prompt and the repair prompt (task 10), teach the ONE document shape the schema actually accepts (`action:` — task 11), pin the shipped Quantity law without inventing a wire field (task 12), and record the reasoning-leak / repair-budget findings (tasks 12b-13).

## Why (the failure this kills)

Brad's transcript shows a small model burning its whole turn reverse-engineering the contract: guessing `verb:` vs `action:`, hunting for `count`'s field name, flip-flopping on material form — because `parseScientistIntent` injects `vocabulary.toolActionEnum()` into the schema (VERIFIED: `server/src/compiler/scientistIntent/parseScientistIntent.ts:47-48`) while NO run-chat prompt contains a single scientist-intent verb. Precedent: PB-CH-4b fixed exactly this class on surface ids (registry-injection into the tool def).

## Verified drop/wire sites (file:line re-anchored at a28d9789, every one read first-hand; probes = executed)

**Task 8 — the lift silently drops the open `params` slot (bug).**
- The skip line is at `server/src/compiler/scientistIntent/liftScientistIntent.ts:157`: `if (canonicalKey === 'params' || canonicalKey === 'parameters') continue;` — identical to the plan's number (this file did not move since d6d2c689).
- `params` IS in `ALLOWED_PARAM_KEYS` (:60-68, `'params'` at :67) but the :157 skip fires first, so it is never copied.
- **PROBE P1 (executed at a28d9789):** lifting an action carrying `params: { composition: [2 entries] ] }` returns action keys `action,material,volumeUl` — **`params` GONE**. The RED test fails today; this is a real RED, not characterization.
- Consumers that lift before storing: `server/src/corpus/shorthandCorpus.ts:61` (the corpus TRAINING TARGET is the lifted doc — dropped fields are dropped from training data too) and `server/src/compiler/scientistIntent/intentCompile.ts:281/287/316` (headless route).

**Task 9 — the run-chat turn parses UNLIFTED, so every alias the rest of the system forgives is a hard rejection.**
- Turn path: `server/src/ai/AgentOrchestrator.ts:2280` — `shorthandDoc = parseScientistIntent(shorthandYaml);` (the plan's :2133). The ONE-re-ask budget is `shorthandRepairAsked` at :1164, armed/handled at :2283-2290 — **keep it exactly as is**.
- Fold path re-parse lives inside `shorthandChat.ts`: `foldShorthandAnswers` returns `{ yaml, doc: parseScientistIntent(yamlText) }` at **:363** (the plan's AgentOrchestrator :1181 fold calls into it). It re-serializes a canonical doc first (:352-358), so the lift is idempotent there — switch it for symmetry (`shorthandChat.ts` already imports `parseScientistIntent` :29-32; it imports ONLY `stringify as stringifyYaml` from 'yaml' at :28 — **add `parse as parseYaml` to that import**; the plan's "already imported at :28" is wrong at this tip).
- **PROBE P4 (executed):** a `verb: add_material` document is REJECTED by `parseScientistIntent` (ScientistIntentValidationError) — Brad's rejection #1 reproduced at trunk.
- New export `parseShorthandForChat(yamlText)` goes in `shorthandChat.ts` beside `compileShorthandDeterministically` (declared at :206).
- Also note the refusal-re-ask rewriter at :2334-2348 (event_graph refusal on shorthand surface) — untouched by this task; do not confuse it with the malformed-shorthand re-ask.

**Task 10 — the vocabulary exists, is enforced, and is never disclosed.**
- `server/src/compiler/scientistIntent/vocabulary.ts`: interface `ScientistIntentVocabulary` at **:77-90** (`promptVerbBlock(): string` :87, `toolActionEnum(): string[]` :89, `argContracts(verb)` in the impl at **:222**); `promptVerbBlock` impl at **:202-216**; `verbsFrozen` :196; the returned object literal starts :218. Add `contractBlock(): string` to the interface (~:89) and impl, and to the return literal. **`entries.get(verb)!.args` per the plan is internal — the public accessor `argContracts(verb)` (:222) is the clean source.**
- **PROBE (executed):** the plan's `contractBlock()` form, generated from `defaultScientistIntentVocabulary()`, yields **31 verbs / 4,517 chars**, and the add_material line reads exactly `- add_material — source?:resolvable(labware), target?:resolvable(labware), labware?:resolvable(labware), material?:resolvable(material), source_name?:scalar, volumeUl?:quantity, volume?:quantity` — so the plan's Task 10b assertions (`toContain('add_material — source?')`, `toContain('volumeUl?:quantity')`) pass as written. The plan's `promptVerbBlock()` is ONLY consumed by `intentCompile.ts:88` (headless) — VERIFIED, no other non-test consumer.
- Disclosure site 1 — tool def: `server/src/ai/submitSuggestionTool.ts` — `AGENT_INTENT_TOOL_DEF` at **:430**, the `shorthand` arg at **:625-628** (description text at :627-628; it is the "closed-vocabulary list of high-level biology verbs" prose the plan quotes, truncated at the file's own line). Append `\n\n${block}` to that description — keep the prose, add the data.
- Disclosure site 2 — forced prompt: `FORCED_DRAFT_TOOL_INSTRUCTION` at `AgentOrchestrator.ts:510-527` (plan's :505-521). It ends with the bullet `'- Action verbs come from the CLOSED scientist-intent vocabulary only — the schema rejects a verb outside it. Never invent one.'` at **:526** — that bullet is the natural interpolation point (see OQ1). Its guard tests are `src/ai/AgentOrchestrator.equipmentInstruction.test.ts` (contains `equipmentRequirements`, `equipment:<kind>`) and `src/ai/equipmentVocabulary.test.ts`.
- Disclosure site 3 — repair prompt: `malformedShorthandRepairPrompt` at `shorthandChat.ts:396-412` (plan's :261-277). Today it quotes the contract in three prose lines (:405) with NO verb list and NO example — that is why one rejection became three. Append the generated block + the canonical example below.
- `ScientistIntentValidationError` lives in `parseScientistIntent.ts` (the plan's disclosure-test note about adjusting the import is correct; `shorthandChat.ts` re-exports nothing — import from the real home).
- The plan's optional `schema/registry/prompt-templates/shorthand-contract.yaml` is OPTIONAL per its own text ("if that is too much… inline the example in the same generated block and note the follow-up"). **Recommendation: inline; the verb LIST is what must be generated.**

**Task 11 — the codebase's one teachable example is a shape the run-chat schema REJECTS, and the contradiction is worse than the plan said.**
- `server/src/compiler/scientistIntent/intentCompile.ts:68-85`: the TS headless prompt teaches verb-as-map-key (`- add_material:` at :71) and says verbatim **:85** `NEVER write a literal 'action:' key. The verb IS the map key.`
- **BUT the registry mirror already teaches the CORRECT shape**: `schema/registry/prompt-templates/intent.compile.system.yaml:18` reads `- action: <one of the verbs below>`. The two "mirrors" teach OPPOSITE shapes today. The drift gate `vocabularyMirrorDrift.test.ts` only set-diffs the VERB BLOCKS ((d)/(e) `promptBlockVerbs` = the ALLOWED ACTIONS list), never the shape — which is exactly how the contradiction survived. So the task-11 file set is: rewrite `intentCompile.ts:64-101` to the `action:` shape (delete :85's line), the registry template needs **no change** (verified), and the new `promptShapeParity.test.ts` closes the hole the drift gate left open.
- **PROBE P2 (executed):** the headless-taught map-key doc is REJECTED by `parseScientistIntent` (2 schema errors) — R6 reproduced at trunk.
- **PROBE P3 (executed):** the ONE shape to teach parses clean today:

      intentId: x
      actions:
        - action: add_material
          material: "DMEM"
          volumeUl: 100
          targetWells: [A1]

  This is the canonical example for the repair prompt and the parity test's anchor. The wire schema requires `action` (`schema/workflow/scientist-intent.schema.yaml:76-81`, `additionalProperties/unevaluatedProperties: false` :74-75); `verb:`-as-key and verb-as-map-key are kept as accepted INPUTS only, absorbed by the lift (task 9), never taught.
- The parity test: extract each YAML example the prompts teach (intentCompile.ts's block, the registry template's content, the repair-prompt example, the tool-def description example) and feed EACH through `parseShorthandForChat` — every taught shape must parse; the map-key shape must still parse via the lift (already pinned at `scientistIntent.test.ts:308`).

**Task 12 — Quantity is SHIPPED on this trunk; adopt, never re-invent, and the wire migration is Stage B's.**
- `schema/core/datatypes/quantity.schema.yaml` and `quantity-ratio.schema.yaml` EXIST at a28d9789 (verified by `ls`). Consumed by the realization gate: `realizeScientistIntent.ts:254` (`QUANTITY_ID`), `:257` (`async function getQuantityValidator()` — **module-private, NOT exported**; the plan says export it rather than write a second loader — do that and say so), `:398`, `:423`.
- Task 12a as scoped here = a law test on the shipped datatype: `{value:10000,unit:'cells',dimension:'count'}` valid, `{value:50,unit:'uL',dimension:'count'}` INVALID (dimension collapse is a schema error). **The plan says extend `compositionDecomposition.test.ts` — that is a Part I / COMP-3 file that does not exist on trunk; create `server/src/compiler/scientistIntent/quantityWireContract.test.ts` instead.**
- 12b (wire `quantity:` declared arg, params.composition Quantity form) **touches `schema/workflow/scientist-intent.schema.yaml` = MANIFEST-pinned = Stage B = SHORTHAND-COMP-4** (the plan's own 12b says "belongs to Stage B"). COMP-2 ships 12a + the `getQuantityValidator` export + the report note; the migration itself is deferred. Naming caution is binding: NEVER a bare `count:` field, NEVER add `count` to `ALLOWED_PARAM_KEYS` (:60-68).
- 12b(report) = Task 12b: a 10-line note in the report — count-as-dimension ships on lane 2 (W2-2 `d83f8be6`), wired to the realization gate but NOT the wire contract; the W2-2 header rules "Migration of existing fields is a later wave"; this item IS that wave's first slice; the rest of the migration stays open.

**Task 13 — investigation, report-only, NO fix.**
- Reasoning leak: `app/src/event-editor/right-pane/ai/AiTabPanel.tsx:854` — comment: "we send enableThinking: false explicitly because the chat template defaults reasoning ON." Client-side the flag is already pinned off; whether Brad's visible reverse-engineering was streamed reasoning or model content is a LIVE question — record what the headless turn actually returns and flag the live screenshot leg for the orchestrator (do not restart the stack).
- Repair budget: with tasks 8-10 landed, a shape-guessing document can still cost the ONE re-ask (`:2283`) — report whether the lift+disclosure makes the budget effectively dead. The live zero-re-ask measurement (`grep` of lane-2 server log for the two Brad prompts) is orchestrator-scheduled after merge; hand over the exact grep and the expected-empty result.
- "One-shot shape acceptance on the corpus-frozen goldens" (task-list verified-by): headless version = feed both Brad prompts AS canonical `action:` documents through `parseShorthandForChat` → `compileShorthandDeterministically` in the new disclosure/parity test file and assert zero clarifications-of-shape / zero validation throws (composition content is COMP-3's business; shape validity is yours).

## Acceptance criteria (VERBATIM from the task block, `~/.hermes/cl/lanes/2/task-list.md` id: SHORTHAND-COMP-2)

> verified by: >-
>   Headless: the disclosed prompt contains the generated vocabulary (test asserts set-equality
>   against the types.ts union, so a future verb addition auto-appears); a params-slot draft
>   survives the lift; one-shot shape acceptance on the corpus-frozen goldens; MANIFEST
>   58c447eb byte-identical.

Plan Part II acceptance criteria (verbatim, plan :931-937):
1. The two prompts Brad typed produce a valid shorthand document on the **first** model turn — no `verb:` rejection, no `count` rejection, no field-name hunting. Evidence: lane-2 server log shows zero malformed-shorthand re-asks for those turns. *(Live — orchestrator-scheduled after merge; deliver the headless equivalent + the grep.)*
2. The tool definition, the forced-draft prompt and the repair prompt all carry the closed vocabulary + per-verb args, generated from `schema/scientist-intent/scientist-intent-vocabulary.yaml` (a drift test pins it).
3. No prompt in the repo teaches a document shape the schema rejects (the parity test).
4. `params` (and therefore the Part I composition) survives the lift — pinned by test — so the corpus training target carries the components too.
5. `MANIFEST.yaml` still hashes `58c447eb…` after Tasks 8-12.

## Files IN scope (product edits; ≤6)

1. `server/src/compiler/scientistIntent/liftScientistIntent.ts` — task 8: replace the :157 skip with verbatim `params` carry-through (`parameters` keeps being skipped — it is flattened at :116-118 first; the plan's replacement code block is correct as written, incl. the comment naming `corpus/shorthandCorpus.ts:61`). Additive: docs without `params` lift byte-identically (corpus suite green proves it).
2. `server/src/ai/shorthandChat.ts` — (a) new export `parseShorthandForChat` beside `compileShorthandDeterministically` (:206 region): lift the parsed YAML, then `parseScientistIntent(JSON.stringify(lifted))`; add `parse as parseYaml` to the :28 yaml import. (b) fold re-parse :363 → `parseShorthandForChat` (idempotent — say so in the report). (c) `malformedShorthandRepairPrompt` :396-412 — append the generated contract block + the canonical `action:` example.
3. `server/src/ai/AgentOrchestrator.ts` — exactly two regions: :2280 turn-path `parseScientistIntent(shorthandYaml)` → `parseShorthandForChat(shorthandYaml)` (keep the `ScientistIntentValidationError` catch + one-re-ask budget :2283-2290 byte-unchanged), and the disclosure injection at the `FORCED_DRAFT_TOOL_INSTRUCTION` constant :510-527 (see OQ1 for the chosen form). DO NOT touch the askWall/smuggle region (~:1225-1246 at the plan's anchor — find it, stay away), nor :2334-2348 (refusal re-ask), nor the fold orchestration :1206-1244.
4. `server/src/compiler/scientistIntent/vocabulary.ts` — `contractBlock()` (interface ~:89, impl near :202-216, return literal :218+), generated from `verbsFrozen` + `argContracts` — NO hand-written verb list anywhere.
5. `server/src/ai/submitSuggestionTool.ts` — append the generated block to the `shorthand` arg description (:625-628). Import `defaultScientistIntentVocabulary` from `../compiler/scientistIntent/vocabulary.js`. Check `submitSuggestionTool.surfaceVocab.test.ts` — `agentIntentToolDefForSurface` structuredClones the def (:653-660, "byte-identical pins"); your change is static text, so the clone stays deterministic.
6. `server/src/compiler/scientistIntent/intentCompile.ts` — rewrite the shape block :64-101 to the canonical `action:` form; delete :85's "NEVER write a literal 'action:'" line; `${vocab.promptVerbBlock()}` :88 stays. Registry template `intent.compile.system.yaml` needs NO edit (already teaches `action:` at :18) — if you change it anyway, `vocabularyMirrorDrift.test.ts` must stay green.

**Explicitly OUT of scope:** `schema/scientist-intent/scientist-intent-vocabulary.yaml`, `schema/workflow/scientist-intent.schema.yaml`, `schema/registry/compile-pipelines/scientist-intent-compile.yaml`, `server/src/compiler/scientistIntent/goldens/**` — MANIFEST-pinned (blob **`58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35`**, re-verified byte-exact at a28d9789 today); `schema/core/datatypes/quantity*.yaml` (consume, never edit); `simpleVerbs.ts`, `normalizeScientistIntent.ts`, `ChatbotCompilePasses.ts`, `config/drafting/*`, `wellRange.ts` — COMP-1's; `params.composition` expander semantics, `composition_snapshot`, any Part I behavior — COMP-3's; declared `composition`/`quantity` vocabulary args + any MANIFEST re-bless — COMP-4/Stage B's; `app/**` product code (task 13 is read-only there); `review-write-wall.yaml`; lane-1 files (`server/src/security/*`, `server.ts`, `routes.ts`, `LabSettingsHandlers.ts`). Tests: new files, all OUTSIDE `goldens/` — `liftParamsPreservation.test.ts`, `src/ai/shorthandChat.lift.test.ts`, `vocabularyContractBlock.test.ts`, `src/ai/shorthandContractDisclosure.test.ts`, `promptShapeParity.test.ts`, `quantityWireContract.test.ts`.

## Baselines — RE-MEASURED by execution at a28d9789 on 2026-10-13 (carry these numbers; "zero NEW" is the gate; exit-0 claims are forbidden)

| Check | Command (from the worktree) | MEASURED baseline at a28d9789 |
|---|---|---|
| Server types | `cd server && npx tsc --noEmit 2>&1 \| grep -c "error TS"` | **0** |
| App types | `cd app && npx tsc --noEmit 2>&1 \| grep -c "error TS"` | **23** |
| Compiler suite | `cd server && npx vitest run src/compiler/scientistIntent/ src/compiler/biology/` | **17 files / 205 tests passed** |
| Shorthand/prompt neighborhood | `cd server && npx vitest run src/ai/AgentOrchestrator.shorthandChat.test.ts src/ai/AgentOrchestrator.shorthandDeckBinding.test.ts src/ai/coerceAgentIntent.test.ts src/ai/AgentOrchestrator.equipmentInstruction.test.ts src/ai/equipmentVocabulary.test.ts src/ai/promptBudget.test.ts` | **6 files / 47 tests passed** |
| Corpus (lift consumer) | `cd server && npx vitest run src/corpus/` | **6 files / 41 tests passed** |
| AI suite broad | `cd server && npx vitest run src/ai/` | run at branch point, capture your own; zero NEW failing files |
| Golden pin | `git -c core.fileMode=false hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` | `58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35` — byte-identical at branch AND head |
| Prompt ratchet | inside promptBudget: measured **45,439 chars, ceiling 47,180, headroom 1,741** | must stay clean WITHOUT moving the ceiling (see bait #4) |
| Contract block size | composer probe: generated block = **4,517 chars, 31 verbs** | quote it in the report next to the ratchet numbers |

`git -c core.fileMode=false` is MANDATORY on every git command (NFS mode bits). Never restart the lane stack; never touch :3001/:5174/:3092/:5192/:3093/:5193 beyond read-only curls the orchestrator schedules. `exactOptionalPropertyTypes` is ON backend-side.

## First targeted check (proves the approach early — one command)

Branch, then RED the task-8 bug in one file: `cd server && npx vitest run src/compiler/scientistIntent/liftParamsPreservation.test.ts` — it must FAIL today with `expected undefined to be defined` on `action.params` (composer probe P1 executed at a28d9789: the lifted action keys are `action,material,volumeUl` — `params` is gone). After the ~5-line change to `liftScientistIntent.ts:157` it passes and `npx vitest run src/corpus/ src/compiler/scientistIntent/` stays green. That file alone proves the plan's "the lift erases composition from the training target" claim end-to-end.

## ONE shape to teach (tasks 10-11 — the single canonical answer, data-driven)

Disclose **only** this shape everywhere the model looks (tool-def `shorthand` description, forced-draft bullet, repair prompt, headless prompt):

    intentId: <short id>
    actions:
      - action: add_material        # the key is literally 'action'; the verb is its VALUE, from the list below
        material: "DMEM"
        volumeUl: 100
        targetWells: [A1]

plus the GENERATED per-verb menu (task 10a's `contractBlock()`, 31 verbs, e.g. `- add_material — source?:resolvable(labware), …, volumeUl?:quantity, volume?:quantity`) — never a hand-written list. `verb:` keys and verb-as-map-key remain ACCEPTED INPUTS (the lift absorbs them, task 9) and are NEVER taught. Verified: this exact shape parses through `parseScientistIntent` at a28d9789 (probe P3); the taught-by-headless map-key shape does NOT (probe P2).

## RED-first commit plan

- **C1 task 8** — RED `server/src/compiler/scientistIntent/liftParamsPreservation.test.ts` (plan's test as written; RED verified by probe P1) → GREEN `liftScientistIntent.ts:157`. Gate: corpus 41 + scientistIntent suites green, server tsc 0. Commit `fix(scientist-intent): the lift must not drop the open params slot (composition survives compile and corpus capture)`.
- **C2 task 9** — RED `server/src/ai/shorthandChat.lift.test.ts` (plan's 3 tests: `verb:` accepted, map-key accepted, fabricated verb `seed_cells` STILL rejected — the lift canonicalizes aliases, it never launders inventions). RED = "parseShorthandForChat is not a function" → GREEN export + the two call sites (`AgentOrchestrator.ts:2280`, `shorthandChat.ts:363`). Gate: `src/ai/ src/compiler/scientistIntent/` green, re-ask budget untouched. Commit `fix(shorthand-chat): lift model aliases (verb:, verb-as-key, parameters:, snake_case) before the Ajv door on the run-chat turn`.
- **C3 task 10** — RED `vocabularyContractBlock.test.ts` (plan's test; `contractBlock` undefined) → GREEN vocabulary.ts → RED `src/ai/shorthandContractDisclosure.test.ts` (tool def + forced prompt + repair prompt contain the block; set-equality against `toolActionEnum()`; the types.ts-union set-equality from the task-list can REUSE `unionVerbsFromSource` — already exported from `vocabularyMirrorDrift.test.ts:33`) → GREEN the three disclosure sites. Gate: neighborhood 47 green, tsc 0, MANIFEST `58c447eb`. Commit `feat(shorthand): disclose the closed vocabulary to the model (generated from the vocabulary YAML) in the tool def, the forced prompt and the repair prompt`.
- **C4 task 11** — RED `promptShapeParity.test.ts` (extract each taught example, feed `parseShorthandForChat`; the CURRENT `intentCompile.ts` example fails — real RED) → GREEN rewrite `intentCompile.ts:64-101`. Gate: `vocabularyMirrorDrift.test.ts` green WITHOUT editing its check list (removing any of (a)-(e) is an auto-review-fail per its own header). Commit `fix(scientist-intent): the prompts teach the shape the schema accepts (action:), and a parity test pins it`.
- **C5 tasks 12+13** — `quantityWireContract.test.ts` (law test on the shipped schema: count+cells valid, count+uL invalid; export `getQuantityValidator` from `realizeScientistIntent.ts` and consume it — one loader) + report-only 12b note + task 13 findings (headless one-shot shape acceptance on both Brad prompts through `parseShorthandForChat`; the reasoning-leak evidence from the AiTabPanel.tsx:854 reading; the live legs flagged for the orchestrator). Commit `feat(scientist-intent): pin the shipped Quantity law on the wire path and report the migration state (no wire field invented)`.

Final gate before reporting: the whole baseline table at HEAD, `git -c core.fileMode=false diff --name-only <branch-point>..HEAD` matching the declared file set, MANIFEST byte-identical.

## Worker contract

- Branch OFF the trunk tip AT DISPATCH: `git -c core.fileMode=false -C /mnt/vast/home/brad/git/cl-integration-2 worktree add /mnt/vast/home/brad/git/wt/SHORTHAND-COMP-2-lane2-<TS> -b cl/SHORTHAND-COMP-2-lane2-<TS> cl/integration-2` (`<TS>` = `date +%Y%m%dT%H%M`, ticket suffix per fleet). NEVER work in `/mnt/vast/home/brad/git/cl-integration-2` itself (live stack). If `git log -1` shows anything newer than the COMP-1 landing, re-anchor this spec's `shorthandChat.ts` / `AgentOrchestrator.ts` numbers (`git -c core.fileMode=false log --oneline <this-spec's-base>..HEAD -- server/src/ai/shorthandChat.ts server/src/ai/AgentOrchestrator.ts`) and re-measure the baseline table BEFORE C1.
- Deliverable path (unique): `<worktree>/.hermes/plans/reports/SHORTHAND-COMP-2-report.<ticket>.md` — every baseline number (branch point AND head), every RED pasted verbatim, the probe facts re-run in your tree, the ratchet + block-size numbers, the 12b note, the task-13 findings, the live legs handed back with exact commands.
- Never `git add -A`; exact paths per commit. No `goldens/` fixtures, no tests inside `goldens/`.
- Hot-file rule: if `AgentOrchestrator.ts`, `shorthandChat.ts`, `submitSuggestionTool.ts` or `vocabulary.ts` move between your branch point and merge, re-anchor and re-run before merge.

## Reviewer bait (pre-empt these; each is a likely adversarial finding)

1. **Generated, never hand-written**: `contractBlock` is built from `verbsFrozen` + `argContracts`; any literal verb list in TS (including in a test's EXPECTATION — assert against `vocab.verbs()` / `toolActionEnum()` / `unionVerbsFromSource`, not typed-out names) recreates the drift defect this task exists to kill. Set-equality BOTH directions (the mirror-drift header's own rule: SET DIFFS, never lengths).
2. **exactOptionalPropertyTypes** (`server/tsconfig.json`): `contractBlock`'s per-arg `${a.domain ? `(${a.domain})` : ''}` pattern is strings (safe); any new OBJECT literal with optional members must be conditional-spread-built (the vocabulary.ts:46-47 comment states the house rule).
3. **The lift stays conservative**: `params` rides through VERBATIM (`params: { …params }` spread — no key filtering inside params, that is Ajv's and Stage B's job); `parameters` keeps being skipped AFTER its :116-118 flatten; fabricated verbs must STILL be rejected (probe-P4 semantics on the lifted path — the C2 test's third case); a document without `params` must lift byte-identically (corpus suite green is the evidence, plus an explicit byte-equality assertion).
4. **Prompt-budget ratchet**: `promptBudget.test.ts` measures `prompts/event-graph-agent.md` + `prompts/material-system-rules.md` + `SUBMIT_SUGGESTION_INSTRUCTION` + `SUBMIT_SUGGESTION_TOOL_DEF` — NEVER inject the block into any of those four (headroom is 1,741; the block is 4,517 — it would blow the ratchet). Injection is legal only on `AGENT_INTENT_TOOL_DEF` / `FORCED_DRAFT_TOOL_INSTRUCTION` / `malformedShorthandRepairPrompt`. The ratchet does NOT measure those — that is deliberate per the test's own scope note, but your report MUST state the real per-turn prompt growth (block × number of injection sites) so the "smallest amount that gets it right" ruling stays auditable (OQ1). Ceiling only moves DOWN; any commit that moves it is wrong.
5. **MANIFEST freeze**: vocabulary YAML, `scientist-intent.schema.yaml`, `scientist-intent-compile.yaml`, `goldens/**` — zero edits; the hash check is in the gate; any diff there = instant reject. Task 12 in THIS item must not smuggle Stage B's schema change ("adopt Quantity" here = the law test + the export, NOT a wire arg).
6. **No bare `count`**: not in `ALLOWED_PARAM_KEYS`, not in the taught example, not in any new schema field (W2-2-F1 collision: verb `count` / operation id `count` / dimension `count`).
7. **One-re-ask budget is load-bearing**: `shorthandRepairAsked` (:1164, :2283-2290) stays exactly as is — the lift makes it rare, not dead; do NOT "simplify" it or add a second re-ask. Same for the refusal re-ask :2334-2348.
8. **The fold leg is symmetric, not re-asked**: `foldShorthandAnswers` returns `null` on validation failure by design (DEFECT-4 guard, :359-367 comment) — routing it through `parseShorthandForChat` must preserve that null-return contract (the lift makes strictly MORE documents parse, so no behavior regresses; pin it with a test case).
9. **YAML-reload trap**: the registry template is registry-loaded YAML — good news: this item needs NO template edit (verified it already teaches `action:`). If you nonetheless touch `intent.compile.system.yaml`, the stack does NOT hot-reload YAML (tsx --watch limitation, task-list environment note) and `vocabularyMirrorDrift.test.ts` (e) reads the file from disk, so the test, not the stack, is the arbiter.
10. **Parity test scope**: the drift test's (d)/(e) checks extract only the ALLOWED ACTIONS block — do not assume green drift proves shape agreement (it does not; that is the hole C4 closes). Do not weaken `vocabularyMirrorDrift.test.ts` itself; its mutation leg must stay intact.
11. **Ontology**: no new ontology terms/CURIEs are needed or wanted (disclosure is vocabulary-shape data, not domain knowledge); the block's `kind(domain)` notation mirrors the YAML's declared fields verbatim.
12. **Test-the-test honesty**: C1/C2/C4 REDs are real (probes P1/P4/P2 executed at a28d9789). If your branch point already shows one of them green (COMP-1 or another merge landed it), call it a characterization pin in the report — never claim a false RED.

## Open questions (3, with recommendations)

- **OQ1 — disclosure placement / prompt bloat.** The plan (10c) says tool-def + forced-prompt + repair-prompt; at 4,517 chars/block that is +~9KB per forced-draft turn on a model whose prompt budget is this campaign's declared pathology (ratchet: 45,439/47,180). DEFAULT (recommended): full block in the tool-def `shorthand` description + the repair prompt; in `FORCED_DRAFT_TOOL_INSTRUCTION` replace the current "CLOSED vocabulary" bullet (:526) with a pointer bullet + the block interpolated ONCE — acceptance criterion 2 is satisfied, and the per-turn delta is ~9KB tool-def + the same block also visible where the model fills the arg, with the repair copy only paid on failure. If the orchestrator wants zero duplication, dropping the forced-prompt copy (tool def + repair only) still satisfies criterion 2's spirit — decide at promotion; the coder implements whichever the promoted spec says and reports the char delta either way. Checked: plan 10c, promptBudget scope (:110-124), block size probe.
- **OQ2 — task 12's wire migration stays in Stage B.** The task-list title says "adopt shipped Quantity" but the plan's own 12b puts the wire `quantity:` arg + schema change in Stage B (MANIFEST re-bless, COMP-4's dispatch gate). DEFAULT: this item ships 12a law test + `getQuantityValidator` export + 12b report note; the declared-arg migration lands in COMP-4 bundled with `composition` and the re-bless. Checked: plan 12b text, MANIFEST pinned-file set, `realizeScientistIntent.ts:257` (private helper), quantity schemas present on trunk.
- **OQ3 — task 13's live legs need the orchestrator.** The zero-re-ask grep on Brad's two live prompts and the reasoning-leak screenshot require a stack restart + live turns (`:5193/runs`), which a coder may not perform. DEFAULT: coder ships the headless equivalents (shape-acceptance through `parseShorthandForChat` on both prompts + the AiTabPanel:854 evidence reading) and hands over the exact live procedure (restart, two prompts, `grep -n "asking the AI to re-emit" <lane-2 server log>` expected empty for those turns, receipt per `~/.hermes/cl/browser-receipts.md`). Checked: :2289's status line is the grep anchor, AiTabPanel.tsx:854, fleet no-restart rule.

UNVERIFIED (deliberately, no substitute invented): live :5193 turn behavior post-change (orchestrator leg only); `npm run test:run -w server` full-suite count (not run — NFS contention; capture at branch point). Composer probes (read-only, safe to delete): `.hermes/plans/drafts/probe-contract-block.mts`, `.hermes/plans/drafts/probe-comp2-red.mts`.

COMPOSER DONE

## PROMOTION NOTE (orchestrator l2t0530, 2026-10-13T07:35 EDT — BINDING)

Promoted after first-hand verification at trunk a28d9789 lineage (trunk tip 0b68a98c is
docs-only since): liftScientistIntent.ts:157 `params`/`parameters` skip VERIFIED;
ALLOWED_PARAM_KEYS contains 'params' (:67) VERIFIED; parseScientistIntent.ts:48
`toolActionEnum()` injection VERIFIED; AgentOrchestrator.ts:2280 unlifted
`parseScientistIntent(shorthandYaml)` + one-re-ask budget :2283-2290 VERIFIED;
FORCED_DRAFT "CLOSED scientist-intent vocabulary" bullet VERIFIED in :510-527;
shorthandChat.ts yaml import is `stringify as stringifyYaml` only (add `parse as
parseYaml`) VERIFIED; fold re-parse (try/catch ScientistIntentValidationError -> null)
VERIFIED at :360-367; tool-def `shorthand` arg description VERIFIED at :625-628;
intentCompile.ts "NEVER write a literal 'action:'" line VERIFIED; promptBudget.test.ts
scope = event-graph-agent.md + material-system-rules.md + SUBMIT_SUGGESTION_INSTRUCTION
+ SUBMIT_SUGGESTION_TOOL_DEF (NOT AGENT_INTENT_TOOL_DEF / FORCED_DRAFT / repair prompt)
VERIFIED; MANIFEST hash 58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35 re-measured at trunk
TODAY; quantity schemas present on trunk; getQuantityValidator module-private at
realizeScientistIntent.ts:257 VERIFIED; vocabulary.ts argContracts :82/:222,
promptVerbBlock :87/:202, toolActionEnum :89/:226 VERIFIED.

OQ RULINGS (binding for the coder):
- OQ1 = the recommended default: full generated block in the tool-def `shorthand`
  description + in `malformedShorthandRepairPrompt`; in FORCED_DRAFT_TOOL_INSTRUCTION
  replace the :526 bullet with a pointer bullet + the block interpolated ONCE. Report the
  real per-turn char delta (block x sites). Never touch the four ratchet-measured strings.
- OQ2 = default: ship 12a law test + `getQuantityValidator` export + 12b report note;
  the wire `quantity:` arg + schema change stays COMP-4/Stage B. No bare `count` anywhere.
- OQ3 = default: headless equivalents only for the coder; hand over the exact live
  procedure (stack restart + two Brad prompts + grep of the lane-2 server log for the
  re-ask status line, expected empty) — the ORCHESTRATOR runs those legs post-merge.

DEPENDENCY: SHORTHAND-COMP-1 (coder complete at branch tip a260e5c8, adversarial gate in
flight lanes/2/logs/advc-SHORTHANDCOMP1-20261013T0728.log). Dispatch this coder ONLY after
COMP-1 merges AND the fleet lock is clear; re-anchor all shorthandChat.ts /
AgentOrchestrator.ts numbers against the post-COMP-1 tip and re-measure the baseline table
BEFORE C1 (the draft's re-anchor note applies verbatim).

## ORCHESTRATOR PROMOTION NOTE (l2t1550, 2026-10-13T16:0x EDT) — re-anchor at trunk b25d2505

Promoted to canonical. All spec line numbers were pinned at a28d9789. Re-verified FIRST-HAND
at trunk tip b25d2505 (which now contains COMP-1 merge cf11174a + DECK-FOLD-1 merge afd2d0da):

- liftScientistIntent.ts:157 skip line `params`/`parameters` continue — VERIFIED UNMOVED.
- AgentOrchestrator.ts: FORCED_DRAFT_TOOL_INSTRUCTION :510 VERIFIED UNMOVED; the CLOSED-
  vocabulary bullet is at :526 (last bullet before `].join`); parseScientistIntent(shorthandYaml)
  :2280 and shorthandRepairAsked :1164/:2283-2286 VERIFIED UNMOVED.
- shorthandChat.ts MOVED (COMP-1 merged): stringify-only yaml import :28 (add `parse as
  parseYaml`); parseScientistIntent import :30-32; fold re-parse :405 (was :363);
  malformedShorthandRepairPrompt :438 (was :396-412); shorthandResultFromCompile :500.
  compileShorthandDeterministically: locate by name, not by the spec's :206.
- vocabulary.ts interface :77-90 region VERIFIED (argContracts :82, promptVerbBlock :87,
  toolActionEnum :89); impl promptVerbBlock :202, argContracts accessor :222, return literal
  from :225.
- intentCompile.ts:68-85 teaches map-key shape + :85 'NEVER write a literal action: key'
  VERIFIED; registry template intent.compile.system.yaml teaches `- action:` VERIFIED (:18).
- quantity.ts: QUANTITY_ID :254, module-private getQuantityValidator :257 (export it),
  consumers :398/:423 VERIFIED. No quantityWireContract.test.ts exists (create per spec).
- Tool def: AGENT_INTENT_TOOL_DEF shorthand arg :625-628 (description :628) VERIFIED UNMOVED.
- Do NOT branch off a5b3999a; branch off the trunk tip AT DISPATCH (THREAD-ASK-1 merges
  ahead of you; its diff touches ProtocolLocalizationThread/handlers — no overlap with yours).
