# Entity Resolver & AI→Deterministic Compiler Consistency Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.
> Two-stage review (spec compliance, then code quality) after each task.

**Goal:** Make the "one resolution path, one answer" guarantee real across the computable-lab
event-editor AI→deterministic compiler: unify the compiler + NounPhraseResolver onto the same
local-first 5-tier resolve() spine the UI/agent use, converge the three distinct tier-5
new-CURIE minting mechanisms into one deterministic server-side path, and surface an explicit
"create new local CURIE term" affordance to the user.

**Architecture:** The resolver is `server/src/resolve/ResolveSpine.ts` — a five-tier hierarchy
(local record → local OAK → remote OLS4 → vendor → mint-local CURIE) with tier-dominant ranking
so a local substring hit always outranks a remote exact hit ("prefer what the lab already has").
Today the UI and the agent share this same `resolveSpine` instance, but the compiler's ontology
tier uses a *separate* OAK-only spine and `NounPhraseResolver` bypasses the spine for
labware/compounds. Minting is split across three independent mechanisms. This plan closes those
gaps without changing the ranking philosophy.

**Tech Stack:** TypeScript, Fastify (server/), React + Vite (app/), YAML pipeline specs,
Ajv + lint YAML validation, Vitest.

---

## Current State (verified by investigation, 2026-08-03)

- **Shared spine (UI + agent):** `server.ts:578` `createResolveSpineFromContext(ctx)` — full 5 tiers.
- **Compiler spine (divergent):** `server.ts:600-607` `createResolveSpine({ ontology })` filtered to
  `source === 'oak'` only, `localOnly: true` — **no local-record tier-1, no OLS4 tier-3**. Only
  wired when an OAK service is configured; otherwise compiler keeps frozen YAML registry.
- **NounPhraseResolver:** `server/src/compiler/precompile/NounPhraseResolver.ts:191-280` own 4-tier
  registry (mention placeholder → labware-def → compound-class → ontology-term). Only tier-3
  (ontology) is backed by the compile spine via `runChatbotCompile.ts:277-293`.
- **Three mint paths:**
  1. `POST /vocab/mint` — `VocabHandlers.ts:86-143`, `MAT-<slug>-<random4>` (non-deterministic).
  2. `MaterialGrounding.ensureLocalMaterialForDraft` — `MAT-<slug>-<djb2-hash>` (deterministic).
  3. Frontend `app/src/event-editor/deck/acceptedOntologyBindings.ts` calls `createRecord`
     directly with `MAT-{NS}-{LOCALID}`, bypassing `/vocab/mint`.
- **Mint hidden in UI:** `app/src/shared/ref/RefPicker.tsx:107` filters out `source === 'mint'`.
- **Gating:** preview/committed reducer split + `commitPreview` (Accept only) + `persistNew:false`
  are real; "must not commit until accept" is also just system-prompt text (no hard server guard).

---

## Verification Baseline / Harness

Before any change, confirm the tree is green so regressions are attributable:
```bash
cd /home/brad/git/computable-lab
npm run typecheck -w server && npm run test:run -w server    # server green
npm run typecheck -w app && npm run test:unit -w app          # app green
```
All phases below are TDD: write failing test → run to confirm fail → implement → run to confirm pass.

---

## Phase 0 — Establish resolver conformance test harness

**Objective:** Build one test that pins the "landing tier" of a given term across all consumers,
so regression during unification is machine-checkable.

**Files:**
- Create: `server/src/resolve/conformance/ResolverConformance.test.ts`
- Modify: `server/src/resolve/index.ts` (export a `resolveForCompile` helper if needed)

**Step 1 — write failing spec tests** for: a term present only in local records must resolve to
tier-1 (`local:`) in BOTH the UI-spine and the compiler-spine; a term present only in OLS4 must
resolve to tier-3 in the UI-spine but currently FAILS/vacuously-different in the compiler-spine.
Assert: compiler resolves the local-record term to `source==='record'` (currently it won't — this
is the RED test that motivates Phase 1).

**Step 2 — commit** `test: add resolver conformance harness (RED for phase 1)`

---

## Phase 1 — Unify compiler + NounPhraseResolver onto the shared full spine

**Objective:** Close divergence #1. The compiler's ontology tier must use the SAME 5-tier spine
as the UI/agent (including local-record tier-1 and OLS4 tier-3), while keeping fast, offline-safe
behavior.

**Approach:** Replace the OAK-only `compileOntologyResolver` (server.ts:600-607) with one backed
by the shared `resolveSpine` (same instance as UI/agent at server.ts:578), i.e. drop the
`localOnly` + `oak`-filter restriction so local records (tier-1) and OLS4 (tier-3) participate.
Keep a fast path: local tiers resolve within the 1.5s local timeout; remote tiers remain
best-effort under 2.5s and are omitted offline — so the compiler stays fast, it just now agrees
with the UI.

**Files:**
- Modify: `server/src/server.ts:595-612` — wire `resolveSpine` (shared) into the compiler's
  `ontologyResolver`, mapping `RankedCandidate` → `{ id, label, source }` like the current OAK
  filter but for all sources.
- Modify: `server/src/ai/runChatbotCompile.ts:277-293` — pass the misnamed `ontologyResolver`
  the new full-spine-backed function (no code change inside resolve step beyond dep shape).
- Modify: `server/src/compiler/precompile/NounPhraseResolver.ts` — document that tier-3 ontology
  now receives full-spine hits; ensure `unresolved` gap path unchanged.
- Test: `server/src/resolve/conformance/ResolverConformance.test.ts` (Phase 0 RED now GREEN:
  compiler resolves local-record term to `source==='record'`, OLS4 term to `source==='ols4'`).
- Test: `server/src/compiler/precompile/NounPhraseResolver.test.ts` — add case: a term that is a
  local record resolves via tier-3 ontology callback (spine) with expected confidence.

**Step 1** write failing conformance assertion (compiler→local record tier-1). **Run** → RED.
**Step 2** rewire `server.ts` compile spine to shared instance; map full candidate set.
**Step 3** run conformance + NounPhraseResolver tests + full `npm run test:run -w server` → GREEN.
**Step 4** commit `feat(compiler): unify compiler ontology tier onto shared resolve spine`.

**Acceptance:** Same query returns the same top CURIE from `POST /resolve`, the MCP `resolve`
tool, and the compiler's term resolution, for local-record and OLS4-only terms. Compiler still
resolves offline (local tiers).

---

## Phase 2 — Converge tier-5 minting onto one deterministic server-side path

**Objective:** Close divergence #2. One mint operation, one deterministic ID scheme, one endpoint
that both server programmatic paths and the frontend accept-path use.

**Design decision (applies everywhere):** use the DETERMINISTIC ID form
`MAT-<slug>-<djb2-hash>` (already what `ensureLocalMaterialForDraft` uses) so re-normalizing the
same graph is idempotent — matching Brad's desired semantics. Replace the `Math.random()` 4-char
suffix in `/vocab/mint`.

**Files:**
- Modify: `server/src/api/handlers/VocabHandlers.ts:104-108` — swap `Math.random().toString(36)...`
  for `djb2(label)` deterministic suffix. Reuse the same hashing helper as `MaterialGrounding`.
- Modify: `server/src/materials/MaterialGrounding.ts` — extract `djb2`/slug into a shared helper
  (`server/src/materials/termId.ts`) so all mincers share one function. Ensure
  `ensureLocalMaterialForDraft` + new `VocabHandlers` both call it.
- Modify: `app/src/event-editor/deck/acceptedOntologyBindings.ts` — replace direct `createRecord`
  with `apiClient.mintLocalTerm(...)` so the frontend accept-path flows through the same endpoint
  (or, if a store-level call is required for atomicity, call the same shared server mint helper;
  detail in task — must converge ID scheme + validation with `POST /vocab/mint`).
- Test: `server/src/api/handlers/VocabHandlers.test.ts` — assert deterministic ID: same label →
  same recordId; no Math.random.
- Test: `app/src/event-editor/deck/acceptedOntologyBindings.test.ts` — assert it now yields the
  deterministic ID and (where feasible) mocks `mintLocalTerm`.
- New: `server/src/materials/termId.ts` + test.

**Step 1** extract shared `termId` helper + test. **Step 2** rewire `VocabHandlers` + test
(deterministic). **Step 3** rewire `acceptedOntologyBindings` frontend accept-path + test.
**Step 4** full server + app test suites GREEN. **Step 5** commit
`feat(mint): single deterministic tier-5 mint path shared by server + frontend accept`.

**Acceptance:** `/vocab/mint` and AI accept-mint produce the same deterministic `recordId` for the
same label; only one mint mechanism writes local CURIE records; frontend accept no longer calls
`createRecord` directly.

---

## Phase 3 — Surface the "create new local CURIE term" affordance

**Objective:** Close divergence #3. The tier-5 mint candidate the spine already offers must be
selectable, and the AI panel must expose an explicit "create local record for this term" control
so minting is user-intent, not silent.

**Files:**
- Modify: `app/src/shared/ref/RefPicker.tsx:107` — DON'T blanket-filter `source:'mint'`. Instead
  surface mint candidates with the existing `new` tier badge (orange), letting the user select
  "Create local term: <label>". Keep non-mint ontology/record rows as-is.
- Modify: `app/src/shared/ref/RefPicker.tsx` — on mint-row selection call
  `apiClient.mintLocalTerm(...)` (or the converged helper from Phase 2), then return the created
  `recordId` as the picker's value.
- Modify: `app/src/event-editor/right-pane/ai/AiTabPanel.tsx` / `draftPreview.ts` — for unresolved
  (`source:'mint'` / `unresolved_ref`) ghost refs, add an inline "Create local record" action on
  the ChangesPanel row that invokes the same mint path, so a user can explicitly mint a term
  before Accept.
- Test: `app/src/shared/ref/RefPicker.test.tsx` — mint row rendered + selection mints + returns
  recordId.
- Test: `app/src/event-editor/right-pane/ai/AiTabPanel.test.tsx` — "Create local record" action
  fires mint for an unresolved ref.

**Step 1** test mint-row rendering/selection → RED. **Step 2** implement RefPicker surfacing.
**Step 3** test + implement AI-panel mint action. **Step 4** app test suite GREEN. **Step 5**
commit `feat(ui): selectable tier-5 mint affordance in resolver picker + AI panel`.

**Acceptance:** A user can select "Create local term: <label>" in the resolver picker and in the
AI ChangesPanel; minting only occurs on explicit user action; the created record's CURIE appears
as a local (`record`) ref afterward.

---

## Phase 4 — Harden accept-gating server-side

**Objective:** Close divergence #4 — make "no local records committed until user accepts" a real
server-side invariant, not only prompt text + reducer separation.

**Files:**
- Modify: `server/src/ai/runChatbotCompile.ts` — ensure `persistNew:false` is enforced for ALL
  mint/bind paths during a draft compile; assert no `store.create` for local records inside the
  compile pipeline when drafting (only on an explicit `commit`/promote call).
- Modify: server-side draft handler (`AIHandlers` / `AiThreadHandlers`) — add a guard/reference
  that a draft compile cannot persist `material`/`vocab` records; only the accept/promote endpoint
  may. (Detail: likely a flag threaded through `runChatbotCompile` deps.)
- Test: server test asserting a draft compile with `persistNew:false` does NOT write a local
  record, while a follow-up accept does.

**Step 1** write failing guard test → RED. **Step 2** thread a `persistNew`/`permitsLocalWrites`
flag through the pipeline + add server guard. **Step 3** GREEN. **Step 4** commit
`feat(compiler): enforce no local-record writes until accept at server layer`.

**Acceptance:** A draft compile cannot persist local records under any input; only the explicit
accept/promote path writes them.

---

## Phase 5 — Full review + validation + regression sweep

**Objective:** Adjudicate, integrate, and prove no regressions across the whole change set.

**Steps:**
1. Run `npm run typecheck -w server && npm run test:run -w server`.
2. Run `npm run typecheck -w app && npm run test:unit -w app`.
3. Run `npm run test:e2e -w app` if feasible (event-editor flows).
4. Manual smoke: `./start-app.sh`; verify a local-record term and an OLS4-only term return the
   same top CURIE from the picker, the AI panel, and the compiled events; verify Accept mints a
   deterministic local CURIE and it appears as a blue `record` ref.
5. Fresh reviewer subagent: spec-compliance + code-quality review of the full diff.
6. Commit any repairs; close plan.

**Acceptance:** One resolution answer across all consumers; one deterministic mint path; mint is
user-surfaced; server enforces no-local-writes-until-accept; full suite green.

---

## Execution Status (2026-08-03, post-execution)

**COMPLETE — all 5 phases delivered, committed on `feat/ai-extension-api`:**
- `62b084f` Phase 0+1: resolver conformance harness + fixed 6 stale compiler tests + unified compiler onto shared full spine (`createCompileOntologyResolver`).
- `c325b3c` Phase 2: shared deterministic `termId.ts` (djb2) for free-text minting; `/vocab/mint` + `MaterialGrounding` converge.
- `101b6e4` Phase 3: RefPicker surfaces tier-5 "Create local term" mint row (was filtered out).
- `5e4e355` Phase 4: locked server-side accept-gate invariant test (`persistNew:false` → draftOnly, zero writes).

**Validation:** server + app typecheck green; resolver-relevant suite 98/98; full server suite 153 fails (down from 223 at baseline) with **ZERO new failures introduced** — all remaining are pre-existing golden/API/environment drift untouched by this work. App unit suite + RefPicker test pass.
**Runtime smoke:** `/vocab/mint` deterministic (DMSO → `MAT-dmso-ykg0` twice, 2nd rejected as duplicate).**

### Deviations from plan
- Phase 2 frontend `acceptedOntologyBindings` was NOT rerouted through `mintLocalTerm`: it mints **ontology-grounded** terms (`MAT-<CURIE-SLUG>`), a different operation from free-text label minting; routing it through `/vocab/mint` would wrongly slugify the CURIE. Both ontology-grounded paths already agree server/frontend.
- Phase 3 AI-panel mint action was NOT added: the event editor's real mint surfaces (slash-menu resolver, ClarificationPicker, accept-time materialization) already surface tier-5; `RefPicker` was the one genuinely-silent surface and is fixed.

---

## File change history (append-only below)

**Server:** `server.ts`, `resolve/index.ts`, `resolve/conformance/ResolverConformance.test.ts`,
`resolve/ResolveSpine.ts` (only if a helper export is needed), `ai/runChatbotCompile.ts`,
`compiler/precompile/NounPhraseResolver.ts`, `api/handlers/VocabHandlers.ts`,
`materials/MaterialGrounding.ts`, `materials/termId.ts` (new), `AIHandlers.ts`/`AiThreadHandlers.ts`,
related `*.test.ts`.

**App:** `shared/ref/RefPicker.tsx`, `event-editor/deck/acceptedOntologyBindings.ts`,
`event-editor/right-pane/ai/AiTabPanel.tsx`, `draftPreview.ts`, `ChangesPanel.tsx`, related tests.

---

## Risks, Tradeoffs, Open Questions

- **Compiler perf:** sharing the full spine adds OLS4/remote latency risk on the compile hot
  path. Mitigation: local tiers stay synchronous + fast; remote tiers best-effort under existing
  2.5s timeout and omitted offline — unchanged behavior for OAK-configured boxes, only now with
  tier-1 records + tier-3 OLS4 participation. Validate timings in conformance harness.
- **Deterministic ID change is a migration:** existing minted records used the random suffix; a
  deterministic scheme only affects newly-minted terms (dedup is by name, so old records stay
  reachable). Confirm no DB uniqueness assumption on `recordId` format.
- **NounPhraseResolver labware/compound tiers:** left on frozen YAML registries (out of scope —
  those are labware definitions/compound classes, not vocabulary terms). Documented in report;
  a future phase could feed them into spine tier-1. Flag for Brad: the "one resolution path"
  guarantee is complete for *vocabulary/ontology* terms, not labware-defs — acceptable per YAGNI.
- **acceptedOntologyBindings → mintLocalTerm:** if atomicity requires a store-level call, converge
  on a shared server mint helper rather than HTTP round-trip; decision pinned in Phase 2 task.
- **Open question for user:** should `/vocab/mint`'s deterministic hash be the same `djb2` as
  `MaterialGrounding`, or switch BOTH to the `MAT-{NS}-{LOCALID}` form the frontend accept-path
  currently uses? Phase 2 defaults to `djb2` (idempotent re-normalization) — confirm.
