# PB-CH-10 — Analysis draft-args grounding (product-side) — SPEC DRAFT (l2t1855, DRAFT — orch review before promotion)

## Goal

Ground the analysis-intent outbound surface with an injected, server-computed block of REAL resolvable analysis references (candidate record ids the compiler can actually resolve) plus a declarative vocabulary rule (never a raw record id in a TERM field), so a forced-tool model turn on the analysis and run-page-chat surfaces emits a clean compile instead of coining terms or emitting empty draft args.

## Evidence (real, this lane — verified)

- 8 model sends across PB-CH-5 gate runs 3a/3b/3c/3d all died at envelope compliance; the product refused honestly every time (revise-only card, zero writes). Trail: `/home/brad/.hermes/cl/receipts/PB-CH-5/2026-10-07_orchgate3d/trail.json` — send1 card text names the failure exactly: `DRAFT_INVALID: UNRESOLVED_TERM /target/run/term: Term "RUN-2026-09-19-run-vwr8" did not resolve to any local term or workspace record` — the model coined a LAB RUN record id as an analysis TERM.
- send2 of run 3d: `.run/backend.log:29645-29652` — traceId `1yqvh0`, `surface=workspace.deck`, model `qwen3.8-flash-next`, finish=stop contentLen=57, coerced to agent_intent with no fields → `no proposal: … no usable draft arguments` (the message rendered by `server/src/ai/draftArgDiagnostics.ts:128-135`).
- CRITICAL FINDING (changes the naive scope): the failing sends ran on **surface `workspace.deck`**, not `analysis`. The run-page chat (`/runs/RUN-…`, the gate script's URL) sends `surface: systemPrompt.id` = `workspace.deck` (`app/src/event-editor/right-pane/ai/AiTabPanel.tsx:594`, id defined `app/src/event-editor/right-pane/ai/systemPromptForViewer.ts:57-61`). The `/analysis` chat (`app/src/analysis/AnalysisChatPanel.tsx:31-38`) sends surface `analysis` with a static summary and `surfaceContext: {}` — nothing resolvable in either direction today. The grounding must therefore land at a layer that covers BOTH surfaces.

## Orientation (cite-verified against trunk cl/integration-2 @ 401ce041)

### Where the outbound prompt is composed
- `server/src/ai/systemPrompt.ts:399-445` — `buildSurfaceAwarePrompt(surface, context)`: `analysis` is a registered surface (`systemPrompt.ts:283-288`, added by PB-CH-6 explicitly additive, no preamble) and falls through to the generic prompt at `:429-444` (preamble `''` — `SURFACE_PREAMBLES` `:300-363` has no `analysis` entry; `getSurfacePreamble` `:380-384`). `workspace.deck` goes the other way — full event-graph template via `buildSystemPrompt` (`:408-410`).
- Attached-context injection precedent (PROTO-AI-6): `formatAttachedProtocol` (`systemPrompt.ts:518-549`) renders a ground-truth block gated on `context.attachedProtocol`, appended through the `extraContexts` list (`systemPrompt.ts:481-489`); its closing rule is the exact idiom we reuse: “Cite ONLY the stepIds and roleIds listed above; never invent one.” (`:547`). PB-CH-4's `formatWorkingFocus` (`:499-508`) is the second precedent.
- BUT the injection site that covers BOTH surfaces in ONE place is the orchestrator's prefix assembly, not `buildSurfaceAwarePrompt`: `server/src/ai/AgentOrchestrator.ts:1023-1055` — `buildPrefixRequest` builds `systemSections = [systemPrompt, residentContext?, SUBMIT_SUGGESTION_INSTRUCTION, FORCED_DRAFT_TOOL_INSTRUCTION?]` (`:1035-1038`) joined into the single system message (`:1047`), shared by the warm path AND the real path (`:1386-1415`, real turns go through `buildPrefixRequest` at `:1407-1412`). `residentContext` (`server/src/server.ts:1058`, `server/src/ai/residentContext.ts`) is the working precedent of a grounding block pushed at this layer.
- Handler shape: `assistStream` builds `editorContext` from the request body by spread + conditional spread (`server/src/api/handlers/AIHandlers.ts:422-435`); `createAIHandlers(orchestrator, …)` has NO store access (`AIHandlers.ts:167-171`; wiring at `server/src/server.ts:1108`). The orchestrator deps DO carry it: `deps.store` (`AgentOrchestrator.ts:876-880`), `deps.resolveSpine` (`:889-895`), assembled in `server/src/server.ts:1058-1070` (store: `ctx.store`, `resolveSpine`, `surfaces`). → the candidate scan is server-side at the orchestrator layer; the client sends nothing new.

### Where the analysis draft tool/args description lives
- Forced tool menu (still ONE tool): `buildToolDefs` forceDraftTool branch returns `[intentToolDef]` (`AgentOrchestrator.ts:999-1015`); `intentToolDef = buildAgentIntentToolDef(surfaceIds)` computed ONCE from the surfaces registry (PB-CH-4b, `:987-990`). Intent enum incl. `compose_analysis`: `server/src/ai/submitSuggestionTool.ts:443`; the analysis envelope description (`"VERBS AND TERMS ONLY"`, target {revision|run}, “terms are spine-resolved, recordIds store-verified, invented ids rejected”): `submitSuggestionTool.ts:570-591`.
- `FORCED_DRAFT_TOOL_INSTRUCTION` (`AgentOrchestrator.ts:492-506`) is event-graph-centric: it enumerates event_graph/deck_layout routing rules and NEVER mentions `compose_analysis` — a likely contributor to the workspace.deck no-usable-args failures (the model answers in prose: 1yqvh0). See OQ1.
- Schema: `schema/workflow/analysis-intent.schema.yaml` (NOT `schema/knowledge/` — the task-list files note is loose; verified path). `targetRef` = `{term}` XOR `{recordId}` (`:112-131`); `target` oneOf {revision(+newRun)} | {run} (`:31-76`); `newRun.inputs` values are targetRefs (`:62-69`).

### How ResolveSpine grounding works today, and what surface=analysis gets
- `server/src/resolve/ResolveSpine.ts` (whole header comment, `:1-20`): six-tier walk, tier dominates ranking, tier-1 = workspace records via `createRecordProvider` (`server/src/resolve/providers/records.ts`, `local:<recordId>` CURIEs, kind set is a provider parameter, default kinds material-centric `records.ts:17-24`).
- The analysis adapter composes its OWN spine instance: `analysisDepsFromContext` (`server/src/drafts/analysisCompile.ts:166-186`) builds `createResolveSpine({ termProvider, recordProvider: createRecordProvider(store, policy.referenceKinds) })` (`:177-186`) — the tier-1 kind set is the adapter's DECLARATIVE `referenceKinds` (`config/drafting/analysis-composition.yaml:22` = `[analysis-revision, analysis-run, data-reference, analysis-output-artifact]`).
- What surface=analysis gets injected TODAY: nothing. Empty preamble + generic prompt (`systemPrompt.ts:283-288, 429-444`), static summary context (`AnalysisChatPanel.tsx:31-38`). The model has only the tool-description prose — no real ids, no vocabulary rule, no way to know `ANREV-000001` exists.

### What the compiler accepts as a run/revision ref vs a term
- `{recordId}` path: `bindRecordId` store-gets it; unknown id → `UNKNOWN_RECORD` (“an invented record id is never projected”) — `analysisCompile.ts:229-241`. Found records then hit the DECLARED kind gate in `resolveTargetRef`: kind outside `revisionKinds`/`runKinds` → `WRONG_REFERENCE_KIND` (`:291-323`).
- `{term}` path: `resolveTerm` — spine `localOnly`, mint affordance excluded, tiers [0,1] only; no candidate → `UNRESOLVED_TERM` (`analysisCompile.ts:244-290`).
- Why the run-3d coin was CORRECTLY refused: `RUN-2026-09-19-run-vwr8` is a kind-`run` (lab run) record — kind `run` is NOT in `referenceKinds`, so the analysis spine's tier-1 provider never indexes it → term miss; as a `{recordId}` it would store-hit but fail the `runKinds: [analysis-run]` gate (`analysis-composition.yaml:20`) with WRONG_REFERENCE_KIND. The compiler was right every single time; the model was simply never told that a lab run is not an analysis run and was never shown the real candidates (`ANREV-000001`, `ANR-000001`, `DREF-L2PBCH5-RCPT1` all exist in the lane workspace `records/_index/records.jsonl`).

## Design (minimal)

**One injected block, one vocabulary rule, both surfaces, zero schema/compiler change.**

1. **Policy data** — extend `config/drafting/analysis-composition.yaml` (loaded per call, process-cache forbidden — `analysisCompile.ts:127-130` comment) with a `grounding:` section: `surfaces: [analysis, workspace.deck]`, `maxPerKind: 6`, `title: "ANALYSIS REFERENCES"`. TS interprets presence; NO kind nouns and NO surface names in TS (repo rule #1 / CLAUDE.md “everything that can be data should be data”).
2. **Injector (new module)** — `server/src/ai/analysisReferenceGrounding.ts`: `buildAnalysisReferenceBlock(store, policy): Promise<string | null>` — for each kind in `policy.referenceKinds`, `store.list({ kind })`, cap at `maxPerKind`, **sorted by recordId** (determinism — see bait), render:
   ```
   ANALYSIS REFERENCES (the ONLY records compose_analysis may target):
   - analysis-revision | ANREV-000001 | <label>
   - analysis-run | ANR-000001 | <label>
   - data-reference | DREF-L2PBCH5-RCPT1 | <label>
   ```
   plus rule lines loaded from a DATA file `server/prompts/analysis-reference-grounding.md` (same shape as every `prompts/*.md` surface; rendered via the existing `loadPromptTemplate`, `systemPrompt.ts:12-24`). Rule text (the declarative vocabulary):
   - Target a listed record with `{recordId: "…"}` exactly as printed — the compiler store-verifies it.
   - `{term}` is biologist/knowledge-layer language the lab resolver knows. NEVER put a raw record id (RUN-, ANR-, ANREV-, DREF-…) in a `term` field.
   - A lab run id (`RUN-…`) is NOT an analysis target: “analyze this run” = `target.revision {recordId: <a listed analysis-revision>}` + `newRun {title}` naming the run — the run itself is not an analysis-run.
   - One shape example of a clean `analysis` envelope (schema-valid, matching `analysis-intent.schema.yaml` oneOf branches).
   - When nothing listed fits, still call the tool with the closest listed `{recordId}` — the user reviews the card; nothing is written before Accept.
3. **Push site** — `buildPrefixRequest` (`AgentOrchestrator.ts:1035-1047`): push the block into `systemSections` alongside `residentContext`, gated on `policy.grounding.surfaces.includes(surface)` (membership read from DATA, not a `surface === 'analysis'` TS branch). Because `buildPrefixRequest` is shared by warm and real (`:999-1015` parity comment, `:1407-1412`), ONE edit covers warm/real × both surfaces. Orchestrator gains the block per-request via a small async step BEFORE prefix assembly (store scan is ms-scale; cap keeps prompt delta ~1KB against the measured 14.7K-token prompts).
4. **Locked, untouched**: ONE forced tool (`buildToolDefs` returns `[intentToolDef]`, unchanged); `tool_choice` plumbing; `FORCED_DRAFT_TOOL_INSTRUCTION` text (OQ1 covers escalation); `submitSuggestionTool.ts` descriptions; `analysisCompile.ts` resolution semantics; every schema YAML; `buildSurfaceAwarePrompt` (do NOT special-case `analysis` inside it — the block rides the orchestrator layer so both surfaces get one source); the app tree (client sends nothing new); `deriveContextCacheKey` (`systemPrompt.ts:612-622`).

No new endpoint. No compiler loosening (see OQ2 — every refusal was correct).

## Files

In scope (server + data + tests only):
- `server/src/ai/analysisReferenceGrounding.ts` (new)
- `server/src/ai/AgentOrchestrator.ts` (push into `systemSections`, ~5 lines, at `:1035-1047`; deps already carry `store`)
- `config/drafting/analysis-composition.yaml` (add `grounding:`)
- `server/prompts/analysis-reference-grounding.md` (new, rule text data)
- `server/src/ai/analysisReferenceGrounding.test.ts` + capture test (new)

Out of scope: every `schema/**` file, `server/src/drafts/analysisCompile.ts`, `server/src/ai/submitSuggestionTool.ts`, `server/src/ai/systemPrompt.ts`, `FORCED_DRAFT_TOOL_INSTRUCTION`, `app/**`, routes/endpoints, ledger/specification files, `tmp-orch/**` gate scripts (orchestrator-owned).

## Acceptance criteria (verbatim from task list, `verified by`)

> RED-first: a capture test proving the analysis-surface outbound request contains the grounded reference block (real run/revision ids available to resolve); the PB-CH-5 accept-arm deterministic script (tmp-orch/gate-pbch5-run3*.mjs pattern) then takes the accept leg on the local profile with <=2 sends, receipts under receipts/PB-CH-5/. Retro-acceptance: PB-CH-5 closes on that receipt.

Task-list `files:` line: “server prompt-composition for the analysis surface + tool description data + any grounding context injector (+tests)” — the design places prompt-composition at the orchestrator prefix layer (see Orientation for why: the failing sends are surface `workspace.deck`).

## First targeted check

```
cd /mnt/vast/home/brad/git/cl-integration-2/server && npx vitest run src/ai/analysisReferenceGrounding
```
RED before implementation (capture asserts `ANALYSIS REFERENCES` + fake `ANREV-`/`ANR-` ids in the outbound system message; block absent → fails). GREEN after the injector + push lands. This is the single command that proves the approach early; the gate run then proves it end-to-end.

## Verification commands (with expected output)

Capture-test pattern: copy the mocked-inference-client capture harness from `server/src/ai/attachedProtocol.test.ts:180-222` (captures the outbound request, asserts on the system message contents). The test constructs the orchestrator with a fake store containing one record per `referenceKinds` kind and runs `surface: 'analysis'` AND `surface: 'workspace.deck'`, asserting the system message contains the block title, the printed recordIds, and the never-a-raw-id-in-term rule; plus a NEGATIVE arm: surface not in `grounding.surfaces` → block absent (and no store scan).

1. `cd server && npx vitest run src/ai/analysisReferenceGrounding src/ai/attachedProtocol` → all PASS (new green + attachedProtocol baseline untouched green).
2. `cd server && npx vitest run src/ai` → failing-file SET identical to the CLAIM-TIME trunk baseline (composer pin from the promoted PB-CH-5 spec: 10 failed files / 21 failed / 578 passed @ ed397216, `2026-10-07_0820-PB-CH-5-analysis-adapter-spec.md:97-98`; PB-CH-6 merged a type-only hunk since — coder MUST re-run on claim-time trunk and paste `comm -3`, not trust this line blindly).
3. `cd server && npx vitest run src/drafts src/analysis` → drafts 3 files/39 PASS + analysis 6 files/32 PASS baselines (`…0820-PB-CH-5 spec:79,81`), zero new failures (no compile-path change).
4. `cd server && npx tsc --noEmit | tee /tmp/pbch10-server-tsc.txt | wc -l` → **26** (the pinned 26-line / 6-file baseline; promoted PB-CH-5 spec:442). Report must paste the file-name set, diff-identical.
5. `cd app && npx tsc --noEmit | wc -l` → **34** (pinned app baseline; app untouched).
6. `cd app && npx vitest run src/analysis src/event-editor/right-pane/ai src/shared/session` → baselines green (PB-CH-5 spec pins: analysis 2/9, session 7/70 at dcf2de3f).
7. `cd app && npx vitest run` → failing-file SET set-identical to the **53-failed-file baseline** (`…0820-PB-CH-5 spec:89-90`); paste `comm -3` output proving identity (normalize path roots first — comm across trees false-diffs, spec:77-78).
8. Post-merge GATE (orchestrator executes, NOT the coder — never write into `tmp-orch/` from the worktree): copy `gate-pbch5-run3d.mjs` → `gate-pbch5-run4.mjs` (same selectors — `[data-testid='chat-input'] .chat-input__editor` from `app/src/event-editor/right-pane/ai/ChatInput.tsx:159`, `[data-testid='workstate-card']`/`-accept`/`-reject`; same 2-ask budget; new receipts dir `2026-10-07_orchgate4/`). Expected trail: `12-card-send1.hasAccept=1` (clean compiled card), accept leg fires → `21-accept-window-net.newAcceptCalls=1`, `22-card-spent-after-accept.stillVisible=0`, `23-main.yaml-sha-POST-ACCEPT` != `20-main.yaml-sha-PRE-ACCEPT` (accept legitimately writes the staged create + session doc — inverse of the reject-arm sha-invariant), `30-ctxB-analysis-tab-present=true`, `consoleErrors=[]`, final line `RUN4-DONE accepted=true`, and the two retro-close receipts `analysis-accepted-workstate.png` + `visible-in-B.png`.

## Worker contract

- Worktree `wt/PB-CH-10-lane2-l2t<tag>` off trunk `cl/integration-2` at claim time; branch `cl/PB-CH-10-lane2-l2t<tag>`.
- Report: `.hermes/plans/PB-CH-10-report.wip-l2t<tag>.md` (unique deliverable path; promote on merge).
- Server-only + data files; restart the lane stack ONLY if the gate needs it (config YAML is per-call-loaded in the compile path; the prompt md is process-cached via `promptCache` — a stack restart IS required for md edits to take effect live).
- Zero writes to `schema/`, `specification/`, `tmp-orch/`, receipts, or the task list.

## Reviewer bait (anticipate the adversarial review)

- **exactOptionalPropertyTypes (server tsconfig:13):** any new optional dep/context fields must use conditional spread (`AIHandlers.ts:431-433` comment is the canonical warning); never `{ block: undefined }`.
- **YAML-reload trap:** `analysis-composition.yaml` MUST stay per-call-loaded — do NOT “optimize” a process cache into `loadAnalysisCompositionPolicy` (`analysisCompile.ts:127-130` explicitly forbids it); but note the ASYMMETRY: the new prompt md goes through `loadPromptTemplate` which caches forever (`systemPrompt.ts:12-24`) — tests must not assume an md edit is visible mid-process, and the deployed lane stack needs a restart after merge.
- **Ontology/vocabulary terms:** the block must describe terms as knowledge-layer/spine language; do not call a recordId a “term” anywhere in the new text — the UNRESOLVED_TERM card is the very artifact under test.
- **Hardcode boundary:** zero kind nouns (`analysis-run`, …) and zero surface literals in the new TS — all from `referenceKinds` / `grounding.surfaces` in the policy YAML; a reviewer grepping the new module for `analysis-run|workspace.deck` must find nothing outside tests.
- **Warm/real prefix parity:** the block MUST be computed inside the shared prefix path (or identically on both), sorted by recordId, capped — otherwise warm and real prompts diverge (parity contract, `AgentOrchestrator.ts:999-1015`) and the KV warm cache silently dies.
- **Wrong-surface trap:** implementing only the `analysis` surface fails the actual gate (the gate sends live on `workspace.deck`) — the negative/positive surface arms in the capture test force this to be seen.
- **`newRun` shape:** MALFORMED_ENVELOPE newRun x1 this cycle — the block's shape example must mirror the schema oneOf exactly (`analysis-intent.schema.yaml:31-76`), not paraphrase it.

## Placement / ownership

Coder-owned: the in-scope server + data + test files only. Orchestrator-owned: claim, worktree bootstrap, gate script + receipts, task-list ticks, PB-CH-5 retro-close. Architect-owned: schema semantics, compiler policy, ledger/specification. This spec sits at `.hermes/plans/2026-10-07_1900-PB-CH-10-analysis-draft-args-grounding-DRAFT-l2t1855.md` until promoted.

## Stop-boundaries (return to orchestrator/architect, do not code around)

- ANY need to add/modify a schema (`analysis-intent`, `analysis-run`, …) or to widen `revisionKinds`/`runKinds`/`referenceKinds` (compiler policy = architect).
- ANY diagnosis that the fix requires loosening `analysisCompile.ts` resolution or the kind gate (architect).
- ANY change to `FORCED_DRAFT_TOOL_INSTRUCTION`, the intent enum, tool count, or `tool_choice` beyond the untouched default (LOCKED: one forced tool).
- ANY client/app change or new endpoint.
- ANY gate failure that occurs WITH the grounded block present in the outbound request (that is model-side compliance, not grounding — run-7 rule, orchestrator's call).

## Open questions (with recommendation)

1. **FORCED_DRAFT_TOOL_INSTRUCTION blind spot.** On `workspace.deck` the forced-mode instruction (`AgentOrchestrator.ts:492-506`) routes only event_graph/deck_layout and never mentions `compose_analysis`; 1yqvh0 answered in prose. Recommendation: keep it untouched and let the grounding block (which is pushed AFTER it in `systemSections`, adjacent in the system message) carry the compose_analysis routing rule; escalate to orch ONLY if the first gate run with the block still yields no-usable-args with the block verifiably present in the prompt (verifiable via `[agent …] promptChars=` jump in `.run/backend.log`).
2. **Is the compiler ever wrong here?** I found no reason to doubt it: every 3a-3d refusal matched declared policy (lab-run kind ∉ referenceKinds; coined term absent from the analysis tier-1 set). The one arguable softening — accepting a lab `RUN-` as a `newRun.inputs` data ref — is runner-policy territory (`analysisRunner.ts` per `analysis-composition.yaml:10-11` comment) and NOT needed for the accept leg. Recommendation: no architect question now; if a future gate needs run-data-as-input, that half goes to architect as its own item.
3. **Which clean envelope will the model pick, and does it matter?** With the block present, either `target.revision{ANREV-000001}+newRun` or `target.run{ANR-000001}` compiles to a clean accept-able card (both records exist, verified in the lane store index). Recommendation: the gate budget (≤2 sends) does not care which; do NOT bias the block's example toward one beyond what the schema needs.

## Checks performed but unresolved → resolved / remaining

- Task-list `files:` said `schema/knowledge/analysis-intent.schema.yaml`; actual path is `schema/workflow/analysis-intent.schema.yaml` (verified — `ls schema/knowledge | grep analysis` shows only the record-kind schemas). Coder follows the actual path.
- Prompt-token headroom: measured real sends at ~14.7K prompt tokens (`backend.log:29651`); a capped ~1KB block is safe — but state maxPerKind conservatively (6) in data.

DRAFT watermark: this file is a composer draft; the orchestrator reviews, rules the OQs, and promotes to the canonical `.hermes/plans/` spec path before any claim.
