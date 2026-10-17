# SPEC DRAFT — SH-PROMPT-HYGIENE-1 (lane 2, composer draft l2t1730, 2026-10-16)

Status: PROMOTED CANONICAL 2026-10-16T19:05 EDT (orch l2t1830). Orch verified the load-bearing
ground truth first-hand before promoting: FORCED_DRAFT_TOOL_INSTRUCTION const at
AgentOrchestrator.ts:530, the push site at :1155, surfaceDraftsShorthand at
shorthandDrafting.ts:51, config/drafting/shorthand-drafting.yaml:12 `surfaces: [workspace.deck]`,
and the server tsc baseline (exactly 1 pre-existing error). (OQ-1 equipment-routing gap and OQ-2
SUBMIT_SUGGESTION_INSTRUCTION residual are explicitly NOT this item's scope — carry to the
Brad-pending list.)
Composed against trunk /mnt/vast/home/brad/git/cl-integration-2 @ 8a3e3d8b (branch cl/integration-2),
first-hand — every file:line below was read or grepped by the composer this session (line drift vs
the task block noted in OQ-3).

## Goal (one sentence)

Stop the forced-draft system instruction from mandating legacy `event_graph` /
`labwareRequirements` vocabulary on surfaces that have migrated to shorthand drafting
(`workspace.deck`), while keeping the instruction byte-identical for every non-migrated
surface — the architect-ruling-recommended prompt-hygiene fix for the WS6 forced-tool
non-compliance contributor (decisions/SHORTHANDCORPUS-raw-events-coercion-l2t1145.md,
OUT-OF-SCOPE section).

## Verbatim current instruction (ground truth)

`FORCED_DRAFT_TOOL_INSTRUCTION` is exported at server/src/ai/AgentOrchestrator.ts:530-549
(task block says :523 — drifted; see OQ-3). It is a module-level const built by
`[ ... ].join('\n')`. Current text, verbatim (line numbers are the current trunk file):

```
530 export const FORCED_DRAFT_TOOL_INSTRUCTION = [
531   'EVENT-EDITOR DRAFT MODE:',
532   `- You MUST finish this turn by calling the ${AGENT_INTENT_TOOL_NAME} tool exactly once, choosing ONE intent from its menu.`,
533   '- To draft events onto the deck (add-material, transfers, labware), choose intent "event_shorthand" and put the WHOLE draft in the `shorthand` field as a scientist-intent YAML document: intentId + actions[] using ONLY the closed action vocabulary, with natural-language noun labels (the lab spine binds them) and numeric parameters. You NEVER write events, well grids, labware record ids, or deck slots yourself — the deterministic compiler expands your shorthand into the event graph.',
534   '- To change the deck layout (e.g. switch the deck to the freeform bench), choose intent "deck_layout" and set variantId (e.g. "manual_freeform"); LEAVE the event fields empty. The deck switch is applied and persists — you do not need to draft events for a layout change.',
535   '- Do not answer in prose. Do not leave the assistant message empty.',
536   '- An instrument is NEVER an event: to put one on the bench emit equipmentRequirements[{recordId:"EQP-…"}] (or classCurie "equipment:<kind>"). Never write place_tube / move_tube / transfer with an instrument id — an instrument has no wells, and the labwareId of a tube or transfer event must name LABWARE. When the user named an instrument (a <resolved_context> equipment id), place THAT record — do not substitute a stand-in that happens to be on the bench.',
537   '- A tool call with no fields proposes NOTHING: prose is not an action. When the user answers your question (even with "1)" or "yes, do that"), your turn must carry the field that acts — events, equipmentAdditions, equipmentRequirements, labwareRequirements — not just the intent.',
538   '- The `resolve` tool is NOT available this turn. Do not output any ontology CURIE you were not given in <resolved_context> — recalling an id from memory is a hallucination. For ANY material you cannot reference as a known record or a <resolved_context> CURIE, GROUND IT IN THE EVENT as {mint:{label:<the user\'s exact words>,domain}} (e.g. {mint:{label:"fenofibrate",domain:"chemical"}}). Never leave a material only in a note, never guess a CURIE.',
539   '- DRAFT the events. Do NOT author your own material clarificationRequests, and do NOT invent clarification options (CURIEs, formulation ids, or mint-pseudo-ids) — you have no resolve tool, so any options you list are fabricated. The SYSTEM automatically asks the user to confirm each minted/ungrounded material via a live search; your job is only to draft + mint.',
540   '- ALWAYS carry the actions for an add-materials request in the shorthand document. NEVER send an empty shorthand for such a request, and never ask the user to confirm a volume or concentration they already stated.',
541   '- A MIXTURE is never one material: when the scientist names a ratio, a percent, a medium plus additives, or cells in a suspension, carry every component in the action\'s `params.composition` array (one entry per component: material + role, plus fraction/count as stated). Never put a mixture sentence in `material`.',
542   '- When the scientist names wells, carry them in the document (sourceWells/targetWells); when they do not, leave them out — the compiler binds the labware and wells from the deck context. Never invent a labware record id.',
543   '- Simple labware/deck setup is still a shorthand document (create_container / add_material naming the labware in the biologist\'s words) — never a hand-built labwareRequirements payload.',
544   '- ONE call. `event_shorthand` drafts events onto the deck (a scientist-intent document); `deck_layout` switches the deck; `create_record` AUTHORs records the lab does not have yet (equipment, material or labware) via `records:[{kind,name,…}]`. Adding something the lab lacks is `create_record`; putting something it already has on the bench is equipmentRequirements / labwareRequirements inside `event_graph` — never create a second copy of the record the lab owns. …'   [full text at :544 — the "inside `event_graph`" clause is the ruling's named offender]
545   '- For BENCH EQUIPMENT (water bath, heat block, …) use equipmentRequirements — NOT labwareRequirements, and NEVER a deck slot: equipment sits on the bench. …'   [equipment bullet — equipmentInstruction.test pins its phrasings]
546   '- Do not ask which vendor/catalog/plate subtype for generic labware such as a 96-well plate; emit a generic labwareRequirement and let the user refine it later.',
547   '- Action verbs come from the CLOSED scientist-intent vocabulary only — the schema rejects a verb outside it. Never invent one. The full menu with each verb\'s accepted args is the ACTIONS block below; write the verb as the VALUE of the `action` key.',
548   defaultScientistIntentVocabulary().contractBlock(),
549 ].join('\n');
```

(The :544/:545 bullets are long; the authoritative text is the file itself — the coder works in
the worktree, not from this excerpt. The offending vocabulary mentions are at :536
(equipmentRequirements as an emission field), :537 (the field menu "events, equipmentAdditions,
equipmentRequirements, labwareRequirements"), :543/:545/:546 (`labwareRequirements` as
anti-pattern / equipment disambiguation / generic-labware fallback), and :544
("equipmentRequirements / labwareRequirements **inside `event_graph`**" — the direct
contradiction the ruling names).)

## How the composition path knows the surface (traced first-hand)

- The ONE render path is `buildPrefixRequest` (AgentOrchestrator.ts:1109-1178), shared by
  run() (call site :1760) and the prompt warmer — warm/real parity holds by construction
  (parity pins: workstateComposeRules.test.ts:229, analysisReferenceGrounding.test.ts:275).
- `buildPrefixRequest` has `args.surface` in scope and pushes the instruction at
  **AgentOrchestrator.ts:1155**: `if (forceDraftTool) systemSections.push(FORCED_DRAFT_TOOL_INSTRUCTION);`
  (immediately after `SUBMIT_SUGGESTION_INSTRUCTION` at :1154).
- The EXISTING surface-conditional seam the ruling points at is
  `surfaceDraftsShorthand(surface)` (server/src/ai/shorthandDrafting.ts:51-59) — membership is
  DATA from config/drafting/shorthand-drafting.yaml (`surfaces: [workspace.deck]`, line 12),
  loaded PER call, never cached, zero surface literals in TS (repo rule #1; the literal ban is
  itself grepped by AgentOrchestrator.repeatEcho.test.ts:373). run() already uses it at
  :1216 (`const shorthandSurface = surfaceDraftsShorthand(surfaceName)`); the import is at :69.
  `surfaceDraftsShorthand(undefined)` returns false (shorthandDrafting.ts:55) — legacy callers
  with no surface keep the legacy text.
- `buildSurfaceAwarePrompt` (server/src/ai/systemPrompt.ts:418-475) routes BOTH
  `event-editor` and `workspace.deck` to the full event-graph template (:427-429), and
  server/prompts/event-graph-agent.md contains NO `event_graph` / `labwareRequirements` token
  (grepped — empty). So the offending tokens in the composed system message come only from the
  forced instruction section and from `SUBMIT_SUGGESTION_INSTRUCTION` (see pin-scope note and OQ-2).
- The refusal the prompt is fighting (AS-4) is at AgentOrchestrator.ts:2551-2563: on a shorthand
  surface, ANY `intent:'event_graph'` call is refused TOTAL (first re-ask, repeat = honest
  cannot-draft failure; never compiled). Pins: AgentOrchestrator.shorthandChat.test.ts:217, :252,
  :290 (prose-coercion), :349.

## Acceptance criteria (verbatim from task-list.md:8510-8525)

description (verbatim): "AgentOrchestrator.ts:523 FORCED_DRAFT_TOOL_INSTRUCTION mentions
event_graph (labwareRequirements) while simultaneously demanding shorthand on migrated surfaces —
a real prompt-hygiene debt and plausible non-compliance contributor (feeds the WS6
model-compliance blocker class). Fix = make the event_graph mention conditional on NON-migrated
surfaces OR rewrite it onto the shorthand vocabulary — smallest honest change; prompt text is
data-adjacent, keep it out of new TS policy branches. Do NOT fold into SH-CORPUS-COERCE-PINS
(ruling verbatim: separate task)."

verified by (verbatim): "Golden/prompt-composition tests updated DELIBERATELY (diff in report,
no rubber-stamp); non-migrated-surface prompt byte-stable; shorthand-surface prompt no longer
names event_graph vocabulary. npm run test:run -w server; typecheck baseline-clean."

## RECOMMENDED option — (a) conditionalize at the existing seam; keep the legacy const byte-stable

Recommendation: **conditionalize the event_graph mentions on NON-migrated surfaces**, via a
second composed variant selected at the existing push site by the existing DATA membership
function. Do NOT rewrite the single const onto shorthand vocabulary.

Why (grounded in what the migrated surfaces' models actually need):

1. The const is shared by EVERY forced-tool surface, and `event-editor` is legitimately still
   drafting `event_graph` (systemPrompt.ts:427 routes it to the full event-graph template;
   ruling §3 enumerates it as non-migrated). A shorthand-only rewrite would hand the event-editor
   dock an instruction that forbids the one intent it is allowed to use — a wider behavior
   change than the ruling authorizes. Option (b) is premature until the LAST surface moves.
2. The migrated surface's refusal (AgentOrchestrator.ts:2551) is TOTAL on `event_graph` — the
   shorthand variant can simply stop naming fields the surface can never accept. The model on
   workspace.deck needs: the shorthand demand (:533 already gives it), deck_layout (:534),
   create_record (:544 minus the event_graph clause), mint/grounding/mixture/wells discipline
   (:538-:542, all already shorthand-native), the closed-verb rule (:547) and the generated
   contract block (:548). It does NOT need (:537)'s legacy field menu or (:544)'s
   "inside `event_graph`" routing clause — those are the contradiction.
3. Byte-stability of the exported const means the three direct-import pin files
   (see "pins touched" below) stay green UNTOUCHED — zero collateral golden churn, and the
   "non-migrated-surface prompt byte-stable" criterion becomes structurally true, testible by
   string-equality, not by eyeball.
4. Ruling constraint honored: the change is a text-variant selection at an existing seam
   (same `surfaceDraftsShorthand` call shape already in the file), NOT a new TS policy branch
   and NOT a new YAML schema. No surface-name literal may appear in TS (repeatEcho.test.ts:373
   greps for exactly that).

Concrete shape (naming is the coder's, this is the intent): factor the bullets into shared
head/tail arrays plus a legacy-only middle; keep `export const FORCED_DRAFT_TOOL_INSTRUCTION`
produced byte-identically from (shared + legacy-middle + tail) so the const is unchanged; add
`export const FORCED_DRAFT_TOOL_INSTRUCTION_SHORTHAND` from (shared + shorthand replacement
bullets + tail), where the replacement bullets:
- replace (:537) with the shorthand-carries-the-action sentence that names only shorthand-side
  fields (never the tokens `event_graph` / `labwareRequirements` — see pin below);
- replace (:544)'s placement clause with "putting something the lab already owns on the bench
  goes through the shorthand document / deck context — NEVER a raw events payload on this
  surface; never create a second copy of a record the lab owns" (keep the rest of the
  create_record guidance verbatim);
- rewrite (:543) tail "never a hand-built labwareRequirements payload" to
  "never a hand-built legacy payload" (keeps meaning, drops the token);
- keep (:545) the equipment bullet and (:536) the instrument bullet EXACTLY as they are in the
  legacy const, and in the shorthand variant keep them verbatim too — do NOT strip equipment
  vocabulary (bait: equipmentVocabulary.test.ts:25-45 advertised-kinds scan reads the const, and
  the "not a refusal" / EQP- / never-claim-acceptance phrasings are pinned by
  AgentOrchestrator.equipmentInstruction.test.ts:11-24). The shorthand-surface equipment
  routing gap (event_graph refused total, no equipment verb) is a SEPARATE product question —
  OQ-1 — the prompt fix must not silently invent an answer.
- selection at :1155: push the shorthand variant iff `surfaceDraftsShorthand(args.surface)`,
  else the legacy const. One ternary on the DATA seam; nothing else in the branch.

The `create_record` and `deck_layout` guidance stays in BOTH variants — those intents are not
refused on shorthand surfaces (the refusal arm fires only on `intent === 'event_graph'`).

## Exact owned files

- server/src/ai/AgentOrchestrator.ts (instruction construction near :530-549 + the one push at
  :1155; nothing else in the file)
- NEW server/src/ai/AgentOrchestrator.forcedDraftSurface.test.ts (RED-first pins, below; exact
  filename coder's choice if prefixed AgentOrchestrator.forcedDraft*)

## Explicitly OUT of scope

- `INTENT_KEYS`, `inferAgentIntent`, `coerceAgentIntent.ts` (frozen by the sibling ruling), the
  agent_intent intent enum, and the enum-exactness pins in submitSuggestionTool.test.ts:287-302.
- The `event_graph` clause inside the tool-def description at submitSuggestionTool.ts:321 — same
  debt class, ruled-out scope here (OQ-2).
- `SUBMIT_SUGGESTION_INSTRUCTION` (submitSuggestionTool.ts:59-77) — a ratchet string;
  shorthandContractDisclosure.test.ts:80-86 pins the contract block never leaks into it.
  See pin-scope note; report the residual contradiction, do NOT edit (OQ-2).
- The AS-4 refusal arm (:2541-2563), its messages, and its pins (shorthandChat.test.ts:217/:252/
  :290/:349) — untouched, must stay green unchanged.
- Precompile / `deterministicOnly` legacy-compile behavior; `buildForcedDraftJsonPrompt` (:816)
  and forced-tool compliance policy text (config/drafting/forced-tool-compliance.yaml).
- Model choice, profile switching, the compliance probe, anything under app/, any YAML-schema
  change, server/prompts/* templates.

## First targeted check (proves the approach early)

After writing the RED test file, BEFORE touching AgentOrchestrator.ts:

```
cd /mnt/vast/home/brad/git/cl-integration-2/server && npx vitest run src/ai/AgentOrchestrator.forcedDraftSurface.test.ts
```

Expected: the workspace.deck pin FAILS (composed forced section currently names event_graph /
labwareRequirements), the event-editor byte-stability pin PASSES. If both fail, the capture is
mis-scoped — fix the capture before proceeding (see bait #5).

## Verification commands (complete, with expected output)

Run from the worker's worktree, npm scripts (or vitest directly from server/):

1. Targeted family (the whole forced-instruction neighborhood + shorthand refusal pins):
   `npm run test:run -w server -- src/ai/AgentOrchestrator.forcedDraftSurface.test.ts src/ai/AgentOrchestrator.equipmentInstruction.test.ts src/ai/shorthandContractDisclosure.test.ts src/ai/equipmentVocabulary.test.ts src/ai/workstateComposeRules.test.ts src/ai/analysisReferenceGrounding.test.ts src/ai/AgentOrchestrator.shorthandChat.test.ts src/ai/AgentOrchestrator.equipmentE2E.test.ts src/ai/AgentOrchestrator.repeatEcho.test.ts`
   Expected: ALL PASS, 0 failed files.
2. Full server suite: `npm run test:run -w server`
   Expected: failing-FILE set identical to pre-change base at dispatch HEAD; KNOWN PRE-EXISTING
   suite-level failure: `ZymoCampaignNegatives` (lane-excluded untracked schema YAML in the
   data-repo path — NOT caused by this change, NOT the coder's defect; do not "fix" it, call it
   out in the report and cite it in the failing-file diff).
3. Typecheck: `npm run typecheck -w server`
   BASELINE MEASURED by the composer at trunk 8a3e3d8b: exactly 1 pre-existing error —
   `src/ai/AgentOrchestrator.ts(347,18): error TS2339: Property 'id' does not exist on type
   'ResolvedSequenceTabTarget'`. "Baseline-clean" = still exactly this 1 error, ZERO new lines.
   (Handoff AS-LANE2-SHQC1-TSC-BASELINE-TRAP: count errors, don't grep exit code.)

## RED-first test plan (new file, written first)

Capture pattern to copy: `runCapture` in workstateComposeRules.test.ts:167-186 (stubbed client,
captured outbound request) — and `buildPrefixRequest` parity call at :239. The composed system
message is `systemSections.join('\n\n---\n\n')` (AgentOrchestrator.ts:1170), so the forced
section is isolated by splitting the system content on `'\n\n---\n\n'` and taking the section
that startsWith `EVENT-EDITOR DRAFT MODE`. PIN-SCOPE NOTE (deliberate, reviewer-bait #1): the
literal criterion "prompt no longer names event_graph vocabulary" cannot be asserted on the WHOLE
system message, because `SUBMIT_SUGGESTION_INSTRUCTION` (pushed at :1154, ratchet string, out of
scope) also names `event_graph`. The section-scoped pin is the honest falsifiable form of the
criterion for the owned file; the residual whole-message contradiction is reported (OQ-2), not
silently absorbed.

Pins:
1. [RED] surface='workspace.deck', forceDraftTool:true → composed forced section contains NO
   `event_graph` and NO `labwareRequirements` token
   (`expect(section).not.toMatch(/event_graph|labwareRequirements/)`).
2. [GREEN at base, keep GREEN] surface='event-editor', forceDraftTool:true → composed forced
   section === FORCED_DRAFT_TOOL_INSTRUCTION (strict string equality — the byte-stability pin),
   and surface undefined (legacy no-surface callers) likewise === the const.
3. Parity: `buildPrefixRequest({surface:'workspace.deck', forceDraftTool:true})` system message
   equals the section captured from a real `run()` on the same surface (warm/real parity extends
   to the new variant — selection lives inside buildPrefixRequest, so this must hold; if it
   fails, the selection was placed in run() = wrong seam, bait #5).
4. Variant disclosure parity: the SHORTHAND variant carries
   `defaultScientistIntentVocabulary().contractBlock()` EXACTLY ONCE (mirror
   shorthandContractDisclosure.test.ts:48-51) — do not exempt the new variant from the loop at
   :63-78's pattern (bait #2).
5. Literal-hygiene: the diff adds no `'workspace.deck'` / `'event-editor'` string literal to
   AgentOrchestrator.ts (extend repeatEcho.test.ts:373's src-grep idiom in-file).
6. Refusal pins regression: shorthandChat.test.ts:217/:252/:290/:349 green unchanged (covered by
   the targeted family; no edits to that file).

Golden updates, DELIBERATELY: with the recommended option the expected golden DIFF is ZERO in
the three direct-import pin files (const byte-stable) — that is the design, not a rubber-stamp;
prove it by reporting `git diff` showing those files untouched. If instead the coder's
implementation forces any edit to equipmentInstruction / shorthandContractDisclosure /
equipmentVocabulary / workstateComposeRules / analysisReferenceGrounding, the report MUST show
the hunk and justify it line-by-line.

## Pins a text change would touch (complete inventory, file:line)

- server/src/ai/AgentOrchestrator.equipmentInstruction.test.ts:8,12-23 — direct import;
  toContain/toMatch on equipmentRequirements, `equipment:<kind>`, deck-slot, EQP-, duplicate,
  not-a-refusal, never-claim-acceptance phrasings.
- server/src/ai/shorthandContractDisclosure.test.ts:13,49-51 (block exactly once), :63-78
  (verb set-equality both directions over the const).
- server/src/ai/equipmentVocabulary.test.ts:14,25-45 — advertisedKinds scans the const;
  advertised kinds must stay ⊆ registry AND keep the arrayContaining list.
- server/src/ai/workstateComposeRules.test.ts:216-227 — presence/order of
  'EVENT-EDITOR DRAFT MODE' on surface 'analysis' (non-migrated → unaffected by the variant).
- server/src/ai/AgentOrchestrator.repeatEcho.test.ts:373 — greps AgentOrchestrator.ts SOURCE for
  surface-name literals.
- No snapshot files exist: grepped server/src/ai for toMatchSnapshot/__snapshots__ (none), and
  AgentOrchestrator.golden.test.ts / goldenWithSeeds.test.ts contain NO
  event_graph/labwareRequirements/FORCED/system-prompt assertions (grepped: 0 matches) — the
  "golden" discipline here is assertion-pins, not stored snapshots.

## Reviewer bait (anticipated adversarial review — pre-empt all of these)

1. Over-broad pin: asserting not.toMatch(event_graph) on the WHOLE system message passes RED
   forever-or-false-fails depending on SUBMIT_SUGGESTION_INSTRUCTION; the section-scoped form
   (above) is the discriminating one. Conversely a mutation that leaves `inside \`event_graph\``
   in the deck variant MUST fail pin 1 — verify by temporarily reverting one bullet and watching
   the pin go RED (mutation probe in the report, like the advc gates do).
2. The shorthand variant skipping the contractBlock-once / verb-set-equality pattern — the
   disclosure test reads the OLD const only; the new variant must be pinned with the same
   generated-verb derivation (bait 1 discipline: derive from vocab.verbs()/toolActionEnum(),
   never typed-out verb names).
3. advertisedKinds trap: stripping the equipment bullets from the SHORTHAND variant looks
   tempting ("it can't use event_graph anyway") and breaks nothing in CI — but it silently
   deletes the only instrument-never-an-event rule the deck model sees. Both variants keep
   :536/:545 verbatim (OQ-1 owns the routing gap). Also: never touch the legacy const's
   equipment tokens — equipmentVocabulary.test.ts:31 scans it at module load.
4. Policy-branch drift: caching `loadShorthandDraftingPolicy` at module scope, or branching on
   `surface === 'workspace.deck'`. Both violate the per-call DATA convention
   (shorthandDrafting.ts header: loaded PER call, never process-cached) and one of them fails
   repeatEcho.test.ts:373; the other fails under YAML-reload expectations — a stack-YAML edit
   must take effect without a TS change (and remember the lane-stack pitfall: tsx --watch does
   NOT reload YAML; the lane stack needs a restart after any YAML edit — this task changes none).
5. Wrong seam: selecting the variant inside run() but not buildPrefixRequest breaks warm/real
   parity (the KV-cache contract at :1094-1107); pin 3 catches it — do not weaken pin 3 to a
   contains-check.
6. exactOptionalPropertyTypes (backend strict): `surface?: AiSurface` is absent-or-value, never
   `surface: undefined`. Build request args with conditional spreads
   (`...(surface ? { surface } : {})` — the idiom already at :1761-1763), never assign undefined.
7. Byte-stability faked by re-export: keeping the legacy const "logically" equal but
   re-serializing bullets differently (join order, quote escapes) fails pin 2's strict equality.

## Worker contract

- Worktree: create under /mnt/vast/home/brad/git/wt/ as SH-PROMPT-HYGIENE-1-lane2-l2t<token>,
  branch off trunk cl/integration-2 at the dispatch-time trunk tip (orchestrator stamps it;
  current tip at composition 8a3e3d8b — re-check, trunk moves).
- All git ops with `git -c core.fileMode=false`.
- ONLY package touched: server. Zero app/ files, zero schema/ files, zero config/ YAML.
- Report: .hermes/plans/SH-PROMPT-HYGIENE-1-report.wip-l2t<token>.md (unique path given by the
  dispatch), ending with an explicit "## Assumptions" section (every judgment call listed as
  AS-<id>: claim + what was checked) and the final marker line:
  `SHPROMPTHYGIENE DONE <sha40-of-final-commit>`
- Commit(s): conventional-commit style, server-ai scope; the new test file and the implementation
  may share one commit (RED-first order noted in the report regardless).
- Do NOT restart the lane stack (no YAML, no runtime behavior beyond prompt text); do NOT touch
  the fleet lock semantics; all fixture records are TEST DATA.
- The ZymoCampaignNegatives suite-level failure is PRE-EXISTING (lane-excluded untracked schema
  YAML); cite, do not chase, do not count as new.

## Open questions (composer could not resolve locally)

- OQ-1 (equipment routing on migrated surfaces): AgentOrchestrator.ts:2551 refuses EVERY
  event_graph call on workspace.deck (unconditional), and schema/scientist-intent/
  scientist-intent-vocabulary.yaml (:13-784, verb list read first-hand) declares NO
  equipment-placement verb — so bench equipment may have NO working emission path on the
  migrated surface, while the prompt promises "not a refusal" (:545). The spec deliberately
  keeps both equipment bullets verbatim in both variants and does not let the coder resolve
  this in prompt text; the orchestrator should decide whether the gap gets its own ruling/task.
  Checked: refusal arm, verb YAML, shorthandChat.ts (no equipment mentions, grepped),
  equipmentE2E.test.ts (runs on the no-surface legacy path only).
- OQ-2 (sibling contradiction sites): SUBMIT_SUGGESTION_INSTRUCTION (submitSuggestionTool.ts:56-77,
  esp. :63 "intent \"event_graph\" to draft events") and the tool-def description
  (submitSuggestionTool.ts:321) STILL name event_graph on migrated surfaces. Ruled out of this
  task's scope (ruling named only FORCED_DRAFT_TOOL_INSTRUCTION; SUBMIT_SUGGESTION_* are ratchet
  strings pinned against edits by shorthandContractDisclosure.test.ts:80-86). Recommend the
  orchestrator mint a follow-up item (with Brad, since ratchet strings imply prompt-cost review).
  Checked: push site :1154, ratchet pin, ruling scope text.
- OQ-3 (line drift): the task block and the ruling both cite AgentOrchestrator.ts:523/:509-526;
  at trunk 8a3e3d8b the const is :530-549. Cosmetic; cite the spec's line numbers.
  Checked: file read this session.

COMPOSER DONE SH-PROMPT-HYGIENE-1 26758
