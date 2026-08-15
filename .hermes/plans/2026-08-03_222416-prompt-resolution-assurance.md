# Prompt Resolution Assurance — auto-resolve vs confirm-with-user

**Goal:** Make the chat→compiler→event-editor pipeline *resolve* a user's plain-text
prompt automatically when it is sufficiently certain (threshold ≥ 0.9, the value Brad
confirmed he can live with), and route **below-threshold** compiles into the existing
confirmation dialogue (clarification cards) instead of silently acting.

**Architecture:** Add a single, aggregate **assurance/confidence score** computed from
signals the pipeline *already* produces (deterministic clause completeness, per-noun
resolution confidence, resolve-spine tier/score per material, unresolved refs, quantity
completeness, validation findings). Surface it on `CompileResult` → `AgentResult` →
the frontend, and add a threshold gate that decides `RESOLVE` vs `CONFIRM`. No new
ontology; no new LLM. Everything rides on the shared resolve spine and the existing
clarification loop.

**Tech Stack:** TypeScript (server `server/`, app `app/`), Vitest, Fastify SSE,
React. `exactOptionalPropertyTypes` is ON — use conditional spreads, never `field: undefined`.

---

## Current state (verified, end of resolver-spine session)

- **Pipeline:** prompt → (chat UI: `AiTabPanel` / `useChatThread` / `useAiChat`)
  → `POST /ai/draft-events/stream` → `AgentOrchestrator.run()` → runs the
  26-pass `chatbot-compile` pipeline → `PlateEventPrimitive[]` + gaps → `AgentResult`
  → preview/ghost in the deck + floating Accept bar.
- **Deterministic precompile already ranks:** `DeterministicPrecompilePass` computes
  `deterministicCompleteness` (0–1, fraction of clauses with no residual) and per-frame
  `confidence` (e.g. `Math.max(noun.confidence, 0.85)` at `DeterministicPrecompilePass.ts:1129`).
- **LLM gate already exists:** `ai_precompile` skips the LLM when
  `deterministicCompleteness >= 0.9 && residualClauses.length === 0`
  (`ChatbotCompilePasses.ts:841-847`).
- **Orchestrator short-circuit:** `shouldShortCircuit` returns when outcome is
  `'complete' | 'gap'` and artifacts exist (`AgentOrchestrator.ts:950-960`). Gaps are
  converted to clarification requests via `clarificationRequestsFromGaps`.
- **Material clarification loop (robust):** `forceMaterialClarifications` polices
  `no-ref` / `unverified-curie` / `needs-quantity`; cards render in
  `MessageLog`/`QuestionsPanel`, answered via `ClarificationPicker` reusing the resolve
  spine; answers round-trip via `handleClarificationsSubmit`.
- **Accept-gate (locked):** `bindOntologyMentions` with `persistNew:false` → draftOnly,
  zero store writes. Nothing persists until the user accepts the preview.
- **Noun resolution confidence exists per-tier** in `NounPhraseResolver` (0.5–1.0),
  and the **resolve spine attaches `score` (tier base + match bonus)** to every
  candidate.

## The gap

There is **no single aggregate assurance number** for a compiled prompt, and **no
threshold that routes high-confidence → straight to editor, low-confidence → confirm
dialogue**. Today the routing is coarse and binary on `outcome`:
- `'complete'` (no gaps) → preview directly (auto).
- `'gap'` → clarification cards.
- No numeric confidence; no weighted signal (tier level, substring-vs-exact, mint-vs-
  local, quantity present vs absent) feeding a `RESOLVE` vs `CONFIRM` decision.
- `compileResolver.ts` **discards** the spine score — it maps candidates to
  `{id, label, source}` and drops `tier`/`score`, so the compiler cannot reason about
  resolution quality even though the spine already computed it.

**This plan closes exactly that gap** — the "resolve the rest automatically, confirm
the uncertain parts with the user" behavior.

---

## Phased plan

### Phase 0 — Represent material resolution as a typed outcome (not a weak hit)
**Objective:** Fix the Phase 0/Phase 1 contradiction at the source. A tier-5 mint is NOT a
weak ontology hit with confidence 0.4 — it is a *distinct resolution outcome* that becomes
a hard blocker. Model it as a discriminated union so downstream assurance never has to
pretend mint == low-score hit.

**Files:**
- Create: `server/src/ai/MaterialResolution.ts` — the union (below)
- Modify: `server/src/ai/runChatbotCompile.ts` — build per-material `MaterialResolution`
  from existing signals (mention path, spine tier/score, `ontologyBindings` minted flags,
  mint_materials pass output)
- Modify: `server/src/compiler/precompile/NounPhraseResolver.ts` — thread real tier/score
  into `ResolvedNoun.confidence` for genuinely resolved nouns only
- Test: `server/src/resolve/conformance/ResolverConformance.test.ts` + a new
  `MaterialResolution.test.ts`

**Step 1 – Define the union** (single source of truth, no prose strings):
```ts
export type MaterialResolution =
  | { status: 'resolved'; localId: string; tier: 1 | 2 | 3 | 4; score: number }
  | { status: 'ambiguous'; candidates: Candidate[] }      // ≥2 plausible, no clear winner
  | { status: 'new_local_proposed'; mention: string; proposalId: string }
  | { status: 'unresolved'; mention: string };
```

**Step 2 – Write failing tests.** Assert:
- default/exact tier-1 → `{ status:'resolved', tier:1 }`
- a mention that hits the tier-5 mint path → `{ status:'new_local_proposed' }` (NOT
  `resolved` with score 0.4)
- ≥2 candidates within the "clear winner" margin → `{ status:'ambiguous' }`
- no candidate → `{ status:'unresolved' }`

**Step 3 – Run:** `cd server && npx vitest run src/ai/MaterialResolution.test.ts`
Expected: FAIL.

**Step 4 – Implement.** Build one `MaterialResolution` per material noun/mention in
`runChatbotCompile`. The tier-5 mint affordance remains **filtered out** of
`compileResolver` (unchanged — it has no CURIE and is not a search hit); instead it is
recognized on the mint_materials/ontologyBindings path and emitted as
`new_local_proposed`. Thread `tier`/`score` through `CompileOntologyHit` + add a small
tier→confidence calibration in `NounPhraseResolver` (only for `resolved` outcomes).

**Step 5 – Run:** full resolve suite. Expected: PASS.

**Step 6 – Commit:** `git add ... && git commit -m "feat(ai): typed MaterialResolution outcome (resolved|ambiguous|new_local_proposed|unresolved)"`

---

### Phase 1 — Assurance module: hard gates → per-slot → aggregate
**Objective:** Pure function implementing the gate hierarchy. The aggregate score is
**never the sole gate** — hard/semantic blockers and per-critical-binding checks run first.

**Decision formula (encode exactly this):**
```ts
decision =
  hardBlockers.length === 0 &&
  criticalBindings.every(b => b.confidence >= threshold) &&
  aggregateScore >= threshold
    ? 'RESOLVE'
    : 'CONFIRM';
```

**Files:**
- Create: `server/src/ai/assurance.ts`
- Test: `server/src/ai/assurance.test.ts`
- Reuse: `server/src/ai/MaterialResolution.ts` (Phase 0) + existing compile signals

**Step 1 – Define the finding + disposition types:**
```ts
type FindingDisposition = 'BLOCK' | 'REDUCE_ASSURANCE' | 'INFORMATIONAL';

interface AssuranceFinding {
  code:
    | 'UNRESOLVED_REFERENCE'
    | 'LOW_BINDING_CONFIDENCE'
    | 'AMBIGUOUS_BINDING'
    | 'NEW_LOCAL_ENTITY'
    | 'MISSING_REQUIRED_QUANTITY'
    | 'VALIDATION_ERROR';
  disposition: FindingDisposition;
  path?: string;
  mention?: string;
  score?: number;
  candidateIds?: string[];
  message: string;
}

interface AssuranceResult {
  score: number;
  threshold: number;
  decision: 'RESOLVE' | 'CONFIRM';
  blockers: AssuranceFinding[];     // disposition BLOCK (forces CONFIRM)
  degraders: AssuranceFinding[];    // disposition REDUCE_ASSURANCE (lowers score only)
  criticalSlotMinimum?: number;     // per-slot floor for critical bindings
}
```

**Step 2 – Write failing tests** (each asserts decision AND which findings populate
`blockers` vs `degraders`):
- fully-resolved prompt → `RESOLVE`, empty blockers.
- one material `new_local_proposed` → **CONFIRM with `NEW_LOCAL_ENTITY` in blockers**
  even if aggregate > threshold (KEY regression test — the weighted-average trap).
- one unresolved reference → `CONFIRM` via `UNRESOLVED_REFERENCE` blocker.
- missing required quantity → `CONFIRM` via `MISSING_REQUIRED_QUANTITY` blocker.
- a **type mismatch** (definition-level entity where a physical batch/instance is
  required) → BLOCK (not a penalty).
- a critical material binding below threshold → `CONFIRM` via `LOW_BINDING_CONFIDENCE`
  even if aggregate ≥ 0.9 (the averaging trap from your example).
- an ambiguity with no clear winner → `CONFIRM` via `AMBIGUOUS_BINDING`.
- a harmless formatting normalization → `INFORMATIONAL`/`REDUCE_ASSURANCE`, does **not**
  by itself block.
- threshold override (e.g. `threshold: 0.8`) flips a marginal RESOLVE.

**Step 3 – Run:** `cd server && npx vitest run src/ai/assurance.test.ts`. Expected: FAIL.

**Step 4 – Implement `computeAssurance(input): AssuranceResult`:**
1. **Hard/semantic gates first** — map to `blockers`:
   - any unresolved reference → `UNRESOLVED_REFERENCE` [BLOCK]
   - any `MaterialResolution.status === 'unresolved'` → `UNRESOLVED_REFERENCE` [BLOCK]
   - any `'ambiguous'` with no clear winner (≥2 candidates within margin) →
     `AMBIGUOUS_BINDING` [BLOCK]
   - any `'new_local_proposed'` → `NEW_LOCAL_ENTITY` [BLOCK]
   - any unverified external CURIE → `UNRESOLVED_REFERENCE` [BLOCK]
   - any missing required quantity/parameter on an entity that needs one →
     `MISSING_REQUIRED_QUANTITY` [BLOCK]
   - any validation error → `VALIDATION_ERROR` [BLOCK]
   - any resolved entity whose type doesn't satisfy the event slot (definition vs
     physical batch) → `VALIDATION_ERROR` [BLOCK]
2. **Per-critical-slot check** — for each critical binding (materials, cell lines, plates,
   physical batches): if `confidence < threshold` → `LOW_BINDING_CONFIDENCE` [BLOCK].
   Any one failing → CONFIRM, regardless of aggregate. (Critical set is the *scientific
   identity* slots — the ones you flagged.)
3. **Aggregate score** — computed only to explain/rank/calibrate (never the sole gate):
   ```ts
   score = 0.25*deterministicCompleteness
         + 0.35*resolvedMaterialGrounding      // avg over RESOLVED tiers (excl. mint)
         + 0.15*quantityCompleteness
         + 0.15*validationQuality              // INFORMATIONAL/REDUCE findings already applied
         + 0.10*(unresolvedRefs.length===0 ? 1 : 0)
   ```
   Minted/ambiguous/unresolved materials contribute **0 to score** here and are handled
   as blockers — never averaged into a passing number.
4. Aggregate findings into `blockers` / `degraders` (BLOCK / REDUCE_ASSURANCE /
   INFORMATIONAL) so the clarification loop gets structured `AssuranceFinding[]`, not
   prose to parse.
5. Return `AssuranceResult`. Pure, no IO. Call it **assurance**, never probability/
   confidence (not calibrated against a label corpus).

**Step 5 – Run:** test passes; full `runChatbotCompile*` suite green.

**Step 6 – Commit:** `git add server/src/ai/assurance.ts server/src/ai/assurance.test.ts && git commit -m "feat(ai): hard-gates + per-slot + aggregate assurance decision"`

---

### Phase 2 — Compute assurance in runChatbotCompile
**Objective:** Attach the `AssuranceResult` (structured blockers + degraders + decision) to
the compile result.

**Files:**
- Modify: `server/src/ai/runChatbotCompile.ts`
- Modify: `server/src/compiler/pipeline/CompileContracts.ts` (add optional `assurance` to `TerminalArtifacts`)
- Test: `server/src/ai/runChatbotCompile.test.ts`

**Step 1 – Write failing test.** A compile whose event graph includes a material that
produced `new_local_proposed` must yield `terminalArtifacts.assurance.decision === 'CONFIRM'`
**with `NEW_LOCAL_ENTITY` in `blockers`** (even if the aggregate would exceed threshold).

**Step 2 – Run.** Expected: FAIL.

**Step 3 – Implement.** In `runChatbotCompile`, after building `terminalArtifacts`, gather
the inputs the assurance module needs (already in-scope: `MaterialResolution[]` from Phase 0,
`ai.unresolvedRefs`, `terminalArtifacts.gaps`, event `details` for quantities, validation
findings). Call `computeAssurance(...)` and add
`terminalArtifacts.assurance = { score, threshold, decision, blockers, degraders }`
(conditional spread; omit when nothing to report). Keep it draft-only — no persistence.

**Step 4 – Run:** test passes; full `runChatbotCompile*` suite green.

**Step 5 – Commit:** `git add server/src/ai/runChatbotCompile.ts server/src/compiler/pipeline/CompileContracts.ts && git commit -m "feat(ai): attach assurance (blockers/degraders/decision) to compile artifacts"`

---

### Phase 3 — Route on assurance in AgentOrchestrator
**Objective:** `CONFIRM` → force the confirmation path (clarification cards built from the
**structured blockers**, not prose); `RESOLVE` → current auto-preview. Never return a silent
auto-preview on CONFIRM.

**Files:**
- Modify: `server/src/ai/AgentOrchestrator.ts` (`compileResultToAgentResult` + short-circuit ~L962)
- Modify: `server/src/ai/types.ts` (add `assurance` to `AgentResult`)
- Modify: `server/src/ai/clarifications.ts` — map `AssuranceFinding[BLOCK]` → `AgentClarificationRequest` (structured)
- Test: `server/src/ai/AgentOrchestrator.test.ts`

**Step 1 – Write failing test.** Path A short-circuit: when `assurance.decision === 'CONFIRM'`
but `outcome === 'complete'` (no legacy gaps), the AgentResult must carry a
clarification request **whose fields are derived from the structured blocker**
(mention/candidateIds populated, not a generic prose blob), events must be **held** (empty).

**Step 2 – Run.** Expected: FAIL.

**Step 3 – Implement.** In the short-circuit branch, before returning the mapped events:
- Read `compileResult.terminalArtifacts.assurance`.
- If `decision === 'CONFIRM'`: build `AgentClarificationRequest[]` from
  `assurance.blockers` (each structured `AssuranceFinding` → one request, carrying
  `mention`/`candidateIds`/`message`), set `events: []`, attach `assurance` to the
  `AgentResult`.
- If `decision === 'RESOLVE'`: current behavior (return events + any gaps).
- Always surface `assurance` on `AgentResult` (new optional field). `degraders` →
  `INFORMATIONAL`/review cues, not blocking questions.
Do NOT bypass the accept-gate — this only changes what the user sees before accepting.

**Step 4 – Run:** agent + orchestrator suite green; typecheck.

**Step 5 – Commit:** `git add ... && git commit -m "feat(ai): route CONFIRM to structured clarification cards, hold events"`

---

### Phase 4 — Frontend threshold gate in the chat hook
**Objective:** Show structured clarification/review cues instead of an auto-ghost when the
backend says `CONFIRM`; keep `RESOLVE` flowing straight to the preview grid. Reuse the
existing `QuestionsPanel`/`ClarificationPicker` pattern.

**Files:**
- Modify: `app/src/shared/hooks/useAiChat.ts` (the `done` event handler ~L458-516)
- Modify: `app/src/types/ai.ts` (assurance on `AiAgentResult`, incl. structured blockers)
- Test: `app/src/**/*.test.ts` (hook-level or reducer-level)

**Step 1 – Write failing test.** When a `done` event arrives with
`assurance.decision === 'CONFIRM'` and empty events, the hook must not set `previewEvents`;
it must surface the structured clarification state (simulating the existing
QuestionsPanel/ClarificationPicker path).

**Step 2 – Run:** `cd app && npx vitest run <hook test>`. Expected: FAIL.

**Step 3 – Implement.** In `useAiChat.sendPrompt`'s `done` handler: if
`result.assurance?.decision === 'CONFIRM'` and no events, skip `setPreviewEvents(...)` and
route `assurance.blockers` into the existing clarification surface (each structured
finding → a card; `mention`/`candidateIds` pre-fill the picker). RESOLVE → existing path
unchanged. `degraders` may show as non-blocking review cues.

**Step 4 – Run:** app tests green; `cd server && npx tsc --noEmit` + `cd app && npx tsc --noEmit` clean.

**Step 5 – Commit:** `git add app/src/shared/hooks/useAiChat.ts app/src/types/ai.ts && git commit -m "feat(ui): confirm below-threshold compiles via structured clarification cards"`

---

### Phase 5 — Threshold configuration + in-editor dial, docs
**Objective:** Make the threshold configurable and calibrate the default.

**Files:**
- Modify: `server/src/config/types.ts` + config plumbing (default `0.9`)
- Modify: `app` — a small per-surface override hook (advanced, optional)
- Docs: update `SPECIFICATIONS.md` / a short assurance note

**Steps:** wire `assurance.threshold` (and `criticalSlotMinimum` per critical binding) from
config; add a config test; document the weighting + blocker table and how to tune.
Lower-risk than Phase 0–4 — do last. `criticalSlotMinimum` should be seeded == threshold.

---

## Validation / acceptance criteria
1. `cd server && npx tsc --noEmit` — clean.
2. `cd app && npx tsc --noEmit` — clean.
3. New suites: `MaterialResolution.test.ts`, `assurance.test.ts`, extended
   `ResolverConformance`, `runChatbotCompile`, `AgentOrchestrator`, hook test — all PASS.
4. **Acceptance (hard-gate semantics):**
   - fully resolved at tier-1/2 with quantities and validation clean → straight to editor
     preview (`RESOLVE`).
   - **any** of: unresolved ref, unverified CURIE, minted `new_local_proposed`, missing
     required quantity, validation error, type mismatch, ambiguity with no clear winner, or
     a critical binding below threshold → **CONFIRM** (events held, structured card) **even
     if the aggregate score ≥ 0.9** — this is the explicit non-negotiable-in-either-direction
     property that the weighted-average trap would have violated.
5. **Regression guard:** run the resolver-relevant + runChatbotCompile + AgentOrchestrator
   suites from `server/` cwd (NEVER `-w server` from root — traverses stale worktrees).
   Zero new failures vs. the 153 known pre-existing drift snapshot.

## Risks / tradeoffs
- **Behavior change:** some previously-auto-previewed compiles will now pause for
  confirmation. Mitigate with the 0.9 default (matches existing LLM gate) + config.
- **Aggregate score is heuristic, not calibrated:** keep the BLOCK/REDUCE/INFORMATIONAL
  classification authoritative for the *decision*; the score is for explanation, logging,
  and calibration only — never the sole gate. Do not call it probability.
- **`criticalSlotMinimum` is domain judgment:** which slots are "critical" (identity:
  material/cell line/plate/batch) vs supporting. Start conservative (critical → must meet
  threshold); broaden only with labeled-prompt evidence.
- **Ambiguity "clear winner" margin is a tunable** — define it (e.g. winner score ≥ runner-up
  + 0.15, reusing the spine's existing tier-gap convention) in the material-resolution step.
- **Does not touch the accept-gate:** nothing persists until the user accepts — this plan
  only changes what the user sees and when they're asked.
- **Frontend gap:** no per-surface threshold UI exists; Phase 5 makes it config, not UI-first.
  YAGNI: don't build a UI dial until Brad asks.

## Open questions
- Should `CONFIRM` hold the WHOLE draft (like `forceMaterialClarifications` does today) or
  only the uncertain event subset? Recommend: hold whole draft (consistent with §9.3).
- Is 0.9 the final default for both `threshold` and `criticalSlotMinimum`? Default both to
  0.9 per Brad's "can live with > 0.9."
- Should a `REDUCE_ASSURANCE`-only outcome with aggregate ≥ threshold (no blockers)
  still `RESOLVE`, or surface a soft review cue? Recommend: RESOLVE + non-blocking
  `degraders` cue (so we don't block on cosmetic issues).

## Files changed (summary)
- server: `ai/MaterialResolution.ts` (+test), `resolve/compileResolver.ts`,
  `compiler/precompile/NounPhraseResolver.ts`, `ai/assurance.ts` (+test),
  `ai/runChatbotCompile.ts`, `compiler/pipeline/CompileContracts.ts`,
  `ai/AgentOrchestrator.ts`, `ai/types.ts`, `ai/clarifications.ts`,
  `config/types.ts`
- app: `shared/hooks/useAiChat.ts`, `types/ai.ts`

## Recommended next step
Execute Phase 0–1 (typed MaterialResolution + hard-gate assurance module) — both are isolated, low-risk,
TDD-friendly, and unblock everything else. Dispatch a `coder-27b` worker per phase with
this plan embedded, then a fresh `reviewer-27b`, then run lint/typecheck/tests myself.
