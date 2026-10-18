# SPEC — HYGIENE-2: residual event_graph vocabulary in SUBMIT_SUGGESTION_INSTRUCTION / submit_suggestion schema -> surface-neutral prompt vocabulary

Composer draft l2t1835 (2026-10-17, cl-spec-composer). Trunk ground truth:
cl/integration-2 @ b6eddd7d (verified `git -c core.fileMode=false rev-parse --short HEAD`).
All citations below were read FIRST-HAND on that trunk (scout recon skipped: every
anchor was verified directly with read/grep — scout output is screening, not authority,
and nothing here rests on it).

## Goal

One sentence: rename the two remaining `event_graph` vocabulary mentions in the
server's draft-mode prompt strings inside `server/src/ai/submitSuggestionTool.ts`
onto surface-neutral wording (mirroring the SH-PROMPT-HYGIENE-1 "choosing ONE intent
from its menu" style), so the unconditional instruction no longer mandates legacy
event_graph drafting vocabulary on surfaces that migrated to shorthand — prompt TEXT
only, one file, zero new TS policy branches.

## Ground facts (verified file:line, trunk b6eddd7d)

- **Q1 — where it is defined and consumed.**
  `SUBMIT_SUGGESTION_INSTRUCTION` is defined at
  `server/src/ai/submitSuggestionTool.ts:56-71` (a `[\n...\n].join('\n')` const).
  Its ONE consumer is `AgentOrchestrator.ts`: imported at `:36`, pushed
  **unconditionally** at `:1211` (`systemSections.push(SUBMIT_SUGGESTION_INSTRUCTION)`
  inside `buildPrefixRequest`, which `run()` also calls at `:1817`). Every surface and
  path that composes a system message therefore sees it — `event-editor`,
  `workspace.deck`, `analysis`, `protocol-review`, `sequences`, and no-surface callers
  (warm and real paths agree by construction, the parity pins' subject). It is also
  measured by the ratchet at `server/src/ai/promptBudget.test.ts:107`.
  The residual `event_graph` sites inside this file's emission-contract TEXT are:
  1. `submitSuggestionTool.ts:60` — the INSTRUCTION bullet itself:
     `'- Finish by calling the \`agent_intent\` tool exactly once (intent "event_graph" to draft events, or "deck_layout" to switch the deck layout). Do NOT print JSON in your text reply.'`
  2. `submitSuggestionTool.ts:321` — the `records` field description inside
     `SUBMIT_SUGGESTION_TOOL_DEF` (the mint note's "near :321"):
     `'... This is not a placement: putting something you already have on the bench is equipmentRequirements / labwareRequirements inside intent "event_graph", and a record the lab already owns must be PLACED, not re-created. '`
     Note (reviewer bait #1): :321 is in the TOOL DEF, not the instruction const — the
     mint note conflated the two; BOTH are the item's residue (same file, same
     event_graph vocabulary class, both flow into every surface's prompt: the records
     description is shared verbatim into `agent_intent` via
     `DRAFT_ARGS_PROPERTIES['records']` at `:517`).

- **Q2 — "surface-neutral" concretely, mirroring SH-PROMPT-HYGIENE-1's vocabulary.**
  SH-PROMPT-HYGIENE-1 made the forced instruction surface-conditional by selecting
  `FORCED_DRAFT_TOOL_INSTRUCTION` vs `FORCED_DRAFT_TOOL_INSTRUCTION_SHORTHAND` at the
  ONE push site (`AgentOrchestrator.ts:1212`) via the DATA seam
  `surfaceDraftsShorthand` (`server/src/ai/shorthandDrafting.ts:51`, membership =
  `config/drafting/shorthand-drafting.yaml`). Its shorthand head bullet
  (`AgentOrchestrator.ts:549`) is the style to mirror:
  `"- You MUST finish this turn by calling the ... tool exactly once, choosing ONE intent from its menu."`
  Surface-neutral for HYGIENE-2 means exactly that idiom: the instruction must not
  NAME which drafting intent (`event_graph`) to pick — the agent_intent tool def's
  own menu does that — and must refer to the drafting intent generically ("the
  drafting intent this surface supports", "the chosen drafting intent"). The item
  forbids a second ternary/policy branch: ONE text serves every surface, so the
  wording must be TRUE on both surface classes. Legacy `event_graph` remains a real
  intent key (`submitSuggestionTool.ts:453` enum, consumed at `:794`) — the rename is
  prompt vocabulary, NOT enum retirement.

- **Q3 — every test/golden pinning the current text today (exhaustive grep of the
  constant name and distinctive fragments: `SUBMIT_SUGGESTION_INSTRUCTION`,
  `FINALIZING YOUR ANSWER`, `Finish by calling`, `inside intent "event_graph"`,
  `AUTHORING act`, `not re-created`, across all of server/src; no
  toMatchSnapshot/toMatchInlineSnapshot exists anywhere in server/src, and no .snap
  files exist):**
  | pin | what it asserts | delta needed |
  |---|---|---|
  | `promptBudget.test.ts:107-118` | ratchet: `agent + material-rules + SUBMIT_SUGGESTION_INSTRUCTION.length + JSON.stringify(SUBMIT_SUGGESTION_TOOL_DEF)` <= `CORE_PROMPT_CEILING_CHARS = 47_180` | **no text edit** — sizing constraint only. Measured live on trunk: total **47,090, instruction 3,061, headroom 90 chars**. The §Exact-edits strings net **+44** under the ratchet measurement (+47 raw on the instruction, -3 inside the stringified schema) -> projected 47,134 <= 47,180, and the stale-high guard (`ceiling*100 <= measured*105`, promptBudget.test.ts:56) stays clean at 47,134. Do NOT re-ratchet the constant (it only moves DOWN, Brad sign-off). |
  | `workstateComposeRules.test.ts:216-227` | push-order pin locating the instruction via `system.indexOf('FINALIZING YOUR ANSWER')` | **none, condition: line 57 (`'FINALIZING YOUR ANSWER:'`, the const's first element) stays byte-identical.** |
  | `shorthandContractDisclosure.test.ts:80-86` (bait 4) | the generated `contractBlock` never leaks into `SUBMIT_SUGGESTION_INSTRUCTION` or `SUBMIT_SUGGESTION_TOOL_DEF` | **none** — the new strings carry no vocabulary block. |
  | `AgentOrchestrator.forcedDraftSurface.test.ts` pins 1-5 | forced-SECTION-scoped hygiene + byte-stability of `FORCED_DRAFT_TOOL_INSTRUCTION`; header comment `:13-20` explicitly names the instruction's event_graph residue (OQ-2 = this item) | **none — DO NOT TOUCH this file.** Pin 2 (`:147-150`) asserts the exported const BYTE-EQUALS the composed section, which is why the legacy bullets in `FORCED_DRAFT_LEGACY_MIDDLE_BULLETS` (some name `event_graph` verbatim, e.g. `AgentOrchestrator.ts:564`) stay untouched. The header comment goes stale after this fix — leave it (comment edit = touching a protected pin file; mention in report). |
  | `submitSuggestionTool.test.ts`, `submitSuggestionTool.equipment.test.ts`, `equipmentVocabulary.test.ts`, `equipmentAdditions.test.ts` | tool-schema structure + `equipment:<kind>` advertised tokens scanned out of `JSON.stringify(SUBMIT_SUGGESTION_TOOL_DEF.function.parameters)` | **none, condition: the :321 rewrite keeps every `equipment:<kind>` token and the field names `equipmentRequirements / labwareRequirements`** (the §Exact-edits string does; `labwareRequirements` is not an `equipment:` token — only that token class is scanned, and the rewrite adds none — verified by running all four GREEN at base). |
  | `AgentOrchestrator.golden.test.ts` / `goldenWithSeeds.test.ts` | compiler-bypass behavior goldens — assert NOTHING about prompt text (verified: never call the LLM) | none. |
  | `promptShapeParity.test.ts` (scientistIntent) | shorthand prompt-shape parity — does not reference this text (verified by grep + run GREEN) | none. |

  Baseline family run executed by the composer at b6eddd7d:
  `npx vitest run src/ai/promptBudget.test.ts src/ai/submitSuggestionTool.test.ts src/ai/submitSuggestionTool.equipment.test.ts src/ai/shorthandContractDisclosure.test.ts src/ai/workstateComposeRules.test.ts src/ai/AgentOrchestrator.forcedDraftSurface.test.ts src/ai/equipmentVocabulary.test.ts src/ai/equipmentAdditions.test.ts`
  = **8 files / 69 tests, all passed**. The spec's only deliberate golden-family
  delta is the prompt TEXT itself + the new pin file below.

## Exact edits

One product file: `server/src/ai/submitSuggestionTool.ts`. Two strings. No other
product-code change of any kind.

**Edit 1 — `submitSuggestionTool.ts:60` (inside SUBMIT_SUGGESTION_INSTRUCTION).**
OLD (current bullet string, 178 chars):

    '- Finish by calling the `agent_intent` tool exactly once (intent "event_graph" to draft events, or "deck_layout" to switch the deck layout). Do NOT print JSON in your text reply.',

NEW (225 chars, +47; mirrors AgentOrchestrator.ts:549's "choosing ONE intent from its
menu" verbatim idiom; keeps the exact `deck_layout` field-name value):

    '- Finish by calling the `agent_intent` tool exactly once, choosing ONE intent from its menu (the drafting intent this surface supports, or "deck_layout" to switch the deck layout). Do NOT print JSON in your text reply.',

**Edit 2 — `submitSuggestionTool.ts:321` (records description in
SUBMIT_SUGGESTION_TOOL_DEF; propagates to agent_intent via DRAFT_ARGS_PROPERTIES).**
OLD fragment (214 chars + trailing space):

    This is not a placement: putting something you already have on the bench is equipmentRequirements / labwareRequirements inside intent "event_graph", and a record the lab already owns must be PLACED, not re-created. 

NEW fragment (213 chars + trailing space; keeps both field names and every
`equipment:<kind>` token; drops only the intent-name clause):

    This is not a placement: putting something you already have on the bench is equipmentRequirements / labwareRequirements inside the chosen drafting intent, and a record the lab already owns must be PLACED, not re-created. 

**Edit 3 — NEW test file `server/src/ai/submitSuggestionInstructionHygiene.test.ts`
(RED-first; this is the deliverable pin for the rename):**
- pin 1 [RED at base]: `expect(SUBMIT_SUGGESTION_INSTRUCTION).not.toMatch(/event_graph/)`.
- pin 2 [RED at base]: `expect(JSON.stringify(mod.SUBMIT_SUGGESTION_TOOL_DEF)).not.toMatch(/event_graph/)` —
  true at base ONLY after Edit 2 (verified: the only event_graph occurrence inside
  that def's serialization is the :321 description; `submit_suggestion`/events
  descriptions carry none).
- pin 3 [GREEN at base, anchor stability]: `SUBMIT_SUGGESTION_INSTRUCTION.startsWith('FINALIZING YOUR ANSWER:')`
  (the workstateComposeRules:219 order anchor survives the rename).
- pin 4 [GREEN at base, leak guard]: the generated
  `defaultScientistIntentVocabulary().contractBlock()` appears in NEITHER the
  instruction nor the tool def (mirrors shorthandContractDisclosure bait 4 without
  importing that file).
- pin 5 [GREEN at base, routing intact]: the `agent_intent` intent enum STILL contains
  `event_graph` — derive from
  `(AGENT_INTENT_TOOL_DEF.function.parameters as {properties:{intent:{enum?:string[]}}}).properties.intent.enum`
  (bait-1 discipline: derived from the def, never typed-out verb lists beyond the one
  checked key). This pins that the rename is vocabulary hygiene, not enum retirement.
  The new file must NOT compose surfaces, must not name `'workspace.deck'` /
  `'event-editor'` anywhere, and must not import AgentOrchestrator.
- pin 6 [GREEN at base, optional]: `FORCED_DRAFT_TOOL_INSTRUCTION` exported string is
  unchanged at import time via pin-2-style equality is ALREADY covered by
  forcedDraftSurface pin 2 — do not duplicate; skip.

## Acceptance criteria (task list `verified by`, verbatim)

> Prompt-composition goldens updated DELIBERATELY (diff in report); non-migrated
> byte-stability pins untouched; targeted + submitSuggestionTool suites green;
> npm run test:run -w server; typecheck baseline-clean. Server-only -> no browser gate.

Plus the item body constraints (verbatim): "prompt text only, no new TS policy
branches. Do NOT touch the SH-PROMPT-HYGIENE-1 ternary or its pins."

## First targeted check (proves the approach early)

RED-first, before any product edit: land the new pin file, then
`cd server && npx vitest run src/ai/submitSuggestionInstructionHygiene.test.ts`
Expected: pins 1 and 2 FAIL (RED at base — that IS the proof the two located sites are
the residue), pins 3-5 pass. Then apply Edits 1-2 and re-run: 5/5 GREEN.

## Verification commands (with expected output)

1. Targeted:
   `cd <worktree>/server && npx vitest run src/ai/submitSuggestionInstructionHygiene.test.ts src/ai/promptBudget.test.ts src/ai/submitSuggestionTool.test.ts src/ai/submitSuggestionTool.equipment.test.ts src/ai/shorthandContractDisclosure.test.ts src/ai/workstateComposeRules.test.ts src/ai/AgentOrchestrator.forcedDraftSurface.test.ts src/ai/equipmentVocabulary.test.ts src/ai/equipmentAdditions.test.ts`
   Expected: **9 files, 74 tests passed** (69 baseline + 5 new pins).
   promptBudget's console line must print `instruction 3108` (was 3061) and a total
   of **47134 chars, headroom 46, ceiling 47180** (±0 — exact strings above; any
   wording drift changes these numbers and the report must quote the printed line).
2. Full server suite: `npm run test:run -w server` — expected: all green (pre-existing
   skips only; report quotes the tail).
3. Typecheck baseline rule: `npm run typecheck -w server` (= `tsc --noEmit`).
   Composer MEASURED baseline on cl/integration-2 @ b6eddd7d: **0 errors, exit 0**.
   Rule: error count at the coder's tip must EQUAL the count recorded at the
   dispatch-tip worktree base (delta 0). Note the disagreement in OQ-3 — record the
   base number in the report, do not chase someone else's baseline.
4. No-browser-gate proof: `git -c core.fileMode=false diff --stat <base>...HEAD` shows
   ZERO paths under `app/` (server-only item).

## Worker contract

- Worktree: `wt/HYGIENE-2-lane2-l2t1835` off trunk `cl/integration-2` at the dispatch
  tip (b6eddd7d at composition time); branch `cl/HYGIENE-2-lane2-l2t1835`.
- Report: `.hermes/plans/HYGIENE-2-report.wip-l2t1835.md`; completion marker line:
  `HYGIENE2 DONE <sha>`.
- Deliverables: the two string edits in `server/src/ai/submitSuggestionTool.ts` + the
  new `server/src/ai/submitSuggestionInstructionHygiene.test.ts` + the report (report
  carries the deliberate golden diff and the printed ratchet line).
- NFS worktree pitfall is live in this lane (see the l2t1710 handoff): a `worktree add`
  that times out leaves a dangling gitdir pointer — mv aside, fresh add, reset --hard.
- Knowledge-layer canonical example not in scope: the item touches no
  claim/context/context-role/assertion/evidence/mechanism-model surface.

## Explicitly OUT of scope

- `FORCED_DRAFT_TOOL_INSTRUCTION`, `FORCED_DRAFT_TOOL_INSTRUCTION_SHORTHAND`, the ONE
  push-site ternary (`AgentOrchestrator.ts:1212`), `FORCED_DRAFT_LEGACY_MIDDLE_BULLETS`
  / `..._SHORTHAND_...` / head / tail arrays, and every pin in
  `AgentOrchestrator.forcedDraftSurface.test.ts` (SH-PROMPT-HYGIENE-1 property — its
  pins byte-pin the legacy bullets, some of which name event_graph by design).
- `AGENT_INTENT_TOOL_DEF` description/enum at `submitSuggestionTool.ts:445/:453/:455`,
  `COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME/_DEF`, the `intent` union type (`:722`),
  `coerceAgentIntent` / `INTENT_KEYS` / inferAgentIntent (`:794`), and ANY enum
  retirement — the event_graph INTENT stays; only the unconditional instruction text
  stops mandating its vocabulary by name.
- The rest of the instruction's legacy field-menu prose (see OQ-1/OQ-2): bullets :61
  (`each event's materials[]`) and :62 (`prefer labwareRequirements[]`), :65-66.
- `server/prompts/*.md`, `server/config/drafting/*.yaml`, anything under `app/`,
  browser gates, model/profile choices, prompt-size reduction (the ratchet's snappiness
  task is separate — this item GROWS the prompt by 44 chars inside recorded slack).
- The stale header comment at `AgentOrchestrator.forcedDraftSurface.test.ts:13-20`
  (mention in the report; no edit to that file).

## Reviewer bait (anticipated adversarial review, and the pre-empts)

1. **:321 vs :60 — "the spec edits the wrong site."** The mint note says
   SUBMIT_SUGGESTION_INSTRUCTION "at :321", but :321 is `SUBMIT_SUGGESTION_TOOL_DEF`'s
   records description; the instruction's own event_graph bullet is :60. Both are
   in-scope residue (same file, same vocabulary class, both reach every surface);
   the spec cites each with its own edit. A reviewer who reads either half alone will
   call the other half scope creep.
2. **The ratchet ceiling.** Headroom is 90 chars (measured 47,090/47,180). The given
   strings net +44 under the ratchet measurement; any "improvised" improvement to the
   wording can bust the ceiling and fails promptBudget. Also: ceiling only moves DOWN
   (promptBudget.test.ts:20-24, Brad's ratchet) — a coder who "fixes" the ceiling
   number is out of contract.
3. **Byte-stability pins are landmines.** `workstateComposeRules.test.ts:219` greps for
   `FINALIZING YOUR ANSWER` as the order anchor — line 57 must stay byte-identical.
   `forcedDraftSurface.test.ts` pin 2 byte-equality protects every legacy forced
   bullet. Both files must show ZERO diff; if the review sees a hunk in either, REJECT.
4. **exactOptionalPropertyTypes sites.** The new test file deliberately avoids
   composing run()/buildPrefixRequest args; if the coder adds any such composition
   anyway, optional fields like `surface` must ride spread-conditionals
   (`...(surface ? { surface } : {} )`, the forcedDraftSurface.test.ts:89-100 idiom),
   never `surface: undefined` — that is a tsc error class this repo enforces.
5. **YAML-reload / DATA-membership trap.** `surfaceDraftsShorthand` reloads
   shorthand-drafting.yaml PER call by design (shorthandDrafting.ts:8-11 comment).
   The temptation is to make the instruction's wording depend on that membership (a
   second branch) — explicitly forbidden ("no new TS policy branches"); the whole point
   is ONE surface-neutral string. Related hardcode boundary: the new strings and the
   new test must contain NO surface-name literals (`'workspace.deck'`,
   `'event-editor'`) and must not hardcode `event_shorthand` into the instruction text.
6. **Ontology/vocabulary terms.** equipmentVocabulary.test.ts scans
   `equipment:<kind>` tokens out of the stringified tool def — the :321 rewrite keeps
   all of them intact (it never touched that token class). If a rewrite drops or adds
   an `equipment:<token>`, that suite fails and the registry-membership test can throw.
7. **"Why no whole-message assertion?"** pin 1 in forcedDraftSurface is
   forced-SECTION-scoped by design (its comment explains the residue this item closes);
   after this fix a whole-message `not.toMatch(/event_graph/)` on workspace.deck would
   newly pass — but strengthening that pin belongs to nobody; touching a protected pin
   file is an instant defect.

## Open questions (could not resolve locally)

1. **OQ-1 — sibling residue at instruction :62 (and the :61 `each event's
   materials[]` phrasing).** These bullets still steer toward the legacy
   `labwareRequirements` field-menu on migrated surfaces, where the shorthand forced
   variant says "never a hand-built labwareRequirements payload"
   (AgentOrchestrator.ts:577). Nothing pins the instruction against it today
   (verified: forcedDraftSurface pin 1's `/event_graph|labwareRequirements/` regex is
   forced-SECTION-scoped only). Kept out of HYGIENE-2 under "smallest honest change"
   (the item names event_graph vocabulary). Checked: all test greps, the shorthand
   variant text, pin scopes. Recommend the orchestrator mint a follow-up hygiene item
   or rule the residue acceptable (the shorthand variant is pushed AFTER the
   instruction, adjacent to it).
2. **OQ-2 — did not check the fleet harness corpus.** Live gate/harness scripts under
   the stack (e.g. `harness-27ef008f.mjs`, untracked at trunk) were grepped for the two
   renamed strings' fragments (no hits) but not exhaustively for model-compliance
   acceptance sentences quoting the OLD bullet; if the forced-tool-compliance gate
   (`config/drafting/forced-tool-compliance.yaml` exists) replays prompt-prefix caches,
   a re-shoot may see a changed prefix. Checked: repo-wide grep of distinctive
   fragments (only submitSuggestionTool.ts + workstateComposeRules:219 hit). Low risk,
   flagged for the gate owners.
3. **OQ-3 — the typecheck baseline number disagrees across notes.**
   SH-PROMPT-HYGIENE-1's DONE note says "tsc exactly 1"; the A5g merge note says
   "tsc 21=21"; the composer MEASURED `tsc --noEmit` = 0 errors (exit 0) at b6eddd7d.
   The spec's rule is delta-0 against the coder's own worktree base; the orchestrator
   should state the canonical baseline number at dispatch. Checked: direct runs at
   trunk (three ways).

COMPOSER DONE

## PROMOTION NOTE (orchestrator l2t1935, 2026-10-17T20:35 EDT)

Verified first-hand at trunk b6eddd7d before promoting: the :60 bullet and the :321
records-description clause are the exact OLD strings quoted in §Exact edits; grep
confirms the only event_graph occurrences in this file outside the enum/coercion/desc
out-of-scope set are :60 and :321; the only test pinning the FINALIZING anchor is
workstateComposeRules.test.ts. OQs adjudicated:
- OQ-1: RESIDUE ACCEPTED for now — no new task minted. The shorthand variant is pushed
  AFTER the instruction and the item's approved wording is "event_graph vocabulary";
  coder names the sibling residue in the report, edits nothing beyond Edits 1-3.
- OQ-2: accepted as low-risk; re-shoot gate owners already re-derive prompts live
  (no prompt-prefix caching in the lane harnesses per the l2t1835 repro-A runs).
- OQ-3: CANONICAL BASELINE = delta-0 against the coder's own worktree base; composer
  measured tsc --noEmit = 0 errors at b6eddd7d. Coder records the number at ITS base
  in the report; the 21-lines note is a different measurement surface (app tsc), not
  a contradiction to chase.
Ratchet note binding: do NOT touch CORE_PROMPT_CEILING_CHARS; report must quote the
printed promptBudget line.
