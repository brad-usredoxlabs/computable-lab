# PB-CH-6 (fix1) — Accept-leg compliance: WORKSTATE COMPOSE RULES block + tool-menu target alignment

Spec 2026-10-08T02:50 EDT, lane 2. Canonical (decision artifact IS the skeleton; orchestrator
verified every load-bearing cite on trunk 6e7abc6f before dispatch).
Authoritative decision: /home/brad/.hermes/cl/lanes/2/decisions/PB-CH-6-accept-leg-compliance-decision.md
(architect, OPTION (a)). This spec implements F1 + F2 EXACTLY. No new intent, no envelope-schema
change, no new surface vocabulary, zero TS surface/kind literals.

Trunk at dispatch: cl/integration-2 @ 6e7abc6f (tip; contains c1e9e1e6 PB-CH-10 merge).
Worktree: /mnt/vast/home/brad/git/wt/PB-CH-6-fix1-lane2-l2t0250, branch cl/PB-CH-6-fix1-lane2-l2t0250.
Report (unique): .hermes/plans/PB-CH-6-fix1-report.wip-l2t0250.md IN THE WORKTREE.

## Why (one paragraph)

On the generic mounts (/analysis, /literature?view=build) the model emits bare-surface workstate
tabs `{surface:"analysis"}` with no `target` because the FORCED-TOOL MENU omits the `target`
requirement that the compile schema already enforces, and those surfaces get only the light
preamble — so compiles die MALFORMED_ENVELOPE / no-usable-draft-args and the mounts' accept legs
can never be earned. Run-targeted asks work on the deck because the full event-graph-agent
template reinforces the vocabulary. Fix = make the menu state what the schema requires (F2) and
push a rule block on the drafting surfaces as DATA (F1), mirroring the shipped PB-CH-10
analysis-grounding idiom.

## Orchestrator-verified facts (trust these; re-verify only if your base differs)

- server/src/ai/submitSuggestionTool.ts: `workstate.properties.tabs.items` (~:542-558) declares
  properties surface/target/title with NO `required` list. `open.tabs.items` (~:594) likewise.
  Intent enum :443 already has compose_workstate/compose_analysis.
- schema/workflow/workstate-intent.schema.yaml: tabs.items `required: [surface, target]`
  (~:35-38); target is oneOf {term} xor {recordId}, each branch additionalProperties:false +
  its own required (:46-64). F2 mirrors THIS exactly.
- server/src/ai/AgentOrchestrator.ts: `buildPrefixRequest` :1042-1066 is the ONE site both warm
  and real renders pass through; it already pushes `groundingBlock` (buildAnalysisGroundingBlockForSurface,
  import :27) LAST, adjacent to FORCED_DRAFT_TOOL_INSTRUCTION (:1057-1066). Push your new block
  beside it (same site, same push-last discipline; order: instruction, forced, grounding, rules —
  pick an order and pin it in a capture test).
- server/src/ai/analysisReferenceGrounding.ts (9.7KB): the loader precedent — per-call policy
  read from config/drafting/analysis-composition.yaml `grounding:` {surfaces, maxPerKind,
  title}; absent section = feature off; malformed-but-present throws honestly; NO process
  cache of the YAML; prompt md rides the normal loadPromptTemplate cache (stack restart deploys
  md edits). Copy this contract EXACTLY for the new file.
- config/drafting/analysis-composition.yaml: the `grounding:` section is the shape to mirror.
- server/src/ai/systemPrompt.ts: AiSurface includes 'analysis' (:288) and 'protocol-builder'
  (:296); SURFACE_PREAMBLES (:300) has NO 'analysis' key (falls to light generic prompt);
  'protocol-builder' preamble is PDF-adaptation-only. DO NOT touch SURFACE_PREAMBLES — the fix
  is the push block, not a preamble.
- intentToolDef is computed once at construction in submitSuggestionTool.ts (the surface-menu
  render at :624-650 mutates the same object) — F2's `required` additions participate in that
  same one-time computation, so warm/real tool-reference identity is unchanged.

## F1 — WORKSTATE COMPOSE RULES block (policy in data)

1. NEW `server/prompts/workstate-compose-rules.md` — the rule text, byte-consistent with the
   tool envelope. MUST state:
   - EVERY workstate tab is `{surface, target}` — a tab without `target` is malformed and
     rejected; `target` is `{term:"biologist words"}` or `{recordId:"..."}` (store-verified;
     never invent an id).
   - "Open <thing> / compose the workspace around X" -> one tab per record named, with THAT
     record as the target. A surface NAME is never a target: to focus a bare surface with no
     record, route to the intent whose envelope targets records (on analysis surfaces:
     `compose_analysis` with a listed {recordId}).
   - When nothing fits, STILL call the tool with the closest grounded target — never return an
     empty `agent_intent` (the "no usable draft arguments" arm); the user reviews the card,
     nothing is written before Accept.
   - ONE worked example of the full tool envelope (mirror analysis-reference-grounding.md's shape).
   - Coin NO surface words — surface ids ride the registry-rendered menu only.
2. NEW `config/drafting/workstate-composition.yaml`:
   `rules: { surfaces: [analysis, literature, protocol-builder], file: prompts/workstate-compose-rules.md }`
   — absent section = feature off; malformed-but-present throws honestly (exact contract copied
   from analysis-composition.yaml `grounding:`). Deliberately EXCLUDES workspace.deck (deck
   prefix stays token-cheap; membership is data, addable later). Document every key in header
   comments like the PB-CH-5 file does.
3. NEW loader module mirroring analysisReferenceGrounding.ts (per-call policy read, no cache;
   md through loadPromptTemplate). Push site: buildPrefixRequest beside the groundingBlock push.
   Zero surface-name or kind literals in TS — membership is the YAML's `surfaces:` list.
   NOTE the file path `rules.file` is resolved relative to the prompts root the existing
   template loader uses — same resolution as analysis-reference-grounding.md.

## F2 — tool-menu alignment (reflection, not policy)

In server/src/ai/submitSuggestionTool.ts `workstate.tabs.items` add
`required: ['surface','target']`; inside `target`, mirror the registered schema: each oneOf
branch requiring `term` xor `recordId` with additionalProperties:false (match
workstate-intent.schema.yaml EXACTLY). Leave `open.tabs.items` untouched unless a test proves
the compile schema requires it too (the schema governs compose_workstate; the `open` sub-tabs
are validated inside the compose_analysis envelope — check workstate/analysis schemas and mirror
ONLY what a schema requires; if no schema requires it, leave it and say so in the report).

## Tests (RED first)

- Loader unit tests (sibling to analysisReferenceGrounding tests if they exist, else alongside
  server/src/ai/): listed surface -> block present; unlisted (workspace.deck / event-editor) ->
  absent; absent YAML section -> off, no scan/throw; malformed section -> throws honestly.
- Warm/real capture parity: extend the existing PB-CH-10 warm/real capture test idiom with
  membership arms (analysis gets block, workspace.deck does not); prefix identity holds.
- submitSuggestionTool unit: rendered workstate tab items carry required [surface,target];
  existing enum/render tests stay green.
- Full gates: npm run test:run -w server scoped to src/ai + src/drafts; lane convention checks:
  server tsc pinned 26 lines / 6 errors; src/ai fail-file SET identity (10-file known set);
  app/** diff must be EMPTY. NO UI -> no browser gate for this fix itself; the residual receipts
  below are the ACCEPT-LEG gate run separately by the orchestrator after merge.

## Hard constraints

- Do NOT restart the lane stack (orchestrator owns restarts; a gate may be live on :5193/:3093).
- Do NOT touch Brad's live tree, :3001/:5174, or main.
- exactOptionalPropertyTypes on server: optional means absent OR value, never undefined.
- Do not edit workstate-intent.schema.yaml, SURFACE_PREAMBLES, or any prompt template other
  than the NEW md.
- Playwright (if needed): /mnt/vast/home/brad/git/cl-integration-2/app/node_modules or
  absolute /mnt/vast/.../node_modules/playwright/index.mjs; git via `git -c core.fileMode=false`.

## Acceptance (orchestrator executes post-merge; coder just lands code+tests)

Per the decision's residual receipts: (1) /analysis accept leg, (2) /literature?view=build
accept leg, (3) PB-CH-5 compose_analysis accept arm replay, (4) deck regression (orchgate10
verbatim ask), (5) parity/unit gates above. Coder's job: make 1-5 earnable; report must include
the exact test commands + outputs you saw.
