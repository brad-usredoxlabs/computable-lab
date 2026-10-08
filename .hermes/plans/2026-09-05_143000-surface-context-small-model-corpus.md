# Small-Model Training Corpus Foundation: Lab Identity + Surface Context

> **For Hermes:** IMPLEMENTATION IS DIRECT-CODING (SOUL.md is marked ACTIVE: DIRECT
> CODING since 2026-09-05). The subagent-driven-execution handoff is NOT used — I
> code each task myself, TDD, one commit per task.

**Goal:** Build the *foundation* for a small-model training corpus by making computable-lab's
"where am I" deterministic and first-class — a declarative **lab identity** and a serializable
**SurfaceContext** (surface × selection × prompt) that flows through every work surface and into
the AI, so each confirmed round-trip becomes a high-value training pair.

**Architecture:** Two new declarative registries (lab identity + surface registry), one shared
`SurfaceContext` payload type (frontend + server mirrors), one broken path fixed (/find
selection→AI), all existing selection→AI seams standardized onto that payload, and the corpus
seam extended to capture surface-context pairs. Everything is data-first (repo rule #1); the AI
receives a deterministic "surface descriptor" on every turn; corpus capture is best-effort.

**Tech Stack:** TypeScript (app React+Vite, server Fastify), YAML JSON-Schema 2020-12 (Ajv),
existing `CorpusClient`/`IntentTrainingPairHandlers` corpus seam, existing `CollectionService`
(graph-search), existing `AiTabPanel` selection→AI pattern, vitest (both workspaces).

---

## Resolved design decisions (2026-09-05 — LOCKED, do not reopen)

These decisions are finalized with Brad and MUST be treated as fixed. The next
coding context starts from these.

1. **Model A — overlay / context, NOT navigation.** When a user searches from any
   surface (incl. inside a run), selects wells, and prompts the AI, the answer is
   scoped to their CURRENT surface and the selection is carried in as context. The
   AI NEVER yanks them out of their project/run. If they want to go elsewhere,
   they open a NEW TAB + start a NEW THREAD — that is the documented escape hatch.

2. **Dedicated "analysis" surface is TABLED for now.** Analysis today is a *verb*
   the AI performs in the right pane (interrogative goals like "what is the avg
   cell count…" are answered in place), NOT a navigable place. We WILL build an
   analysis surface soon after this foundation, but it is out of scope for this
   plan. Do not design context persistence around a landing surface that does not
   exist yet (so Task 3.3 "persist SurfaceContext" stays DEFERRED).

3. **Tab ↔ context invariant (the anti-"two chefs" rule).**
   - **A tab is a slot; a context is what the slot is scoped to.**
   - **ONE tab per canonical entity, EVER.** Stable tab ids (`run:<id>`, `project:<id>`,
     `claim:<id>`) already dedupe re-opens → focus, not duplicate (see
     `app/src/event-editor/workspace/types.ts` `runTabId` and `OpenTabsContext`
     reducer). Two live tabs on the SAME run/event-graph is FORBIDDEN — it's the
     worktree-collision problem (two chefs in one kitchen).
   - **MANY contexts per tab are normal.** Searching within a run and asking a
     question is a context shift IN the current tab (surface re-scopes, run stays
     put underneath). `navigate-active` / within-back/forward already mint fresh
     slot ids to change tab content without colliding with other open tabs.
   - **Many tabs within the same PROJECT are normal and encouraged** (project +
     run + claim coexist as one project's workbench).
   - Corpus capture = snapshot of THIS tab's context → prompt → accepted action.
     The tab invariant guarantees the capture is unambiguous (one canonical context
     per entity).

4. **Corpus north star** (unchanged): each confirmed `SurfaceContext → AI response →
   accepted next-surface/action` round-trip IS a small-model training example. Fix
   the /find send loop first; capture second.

## What's worth keeping from Brad's ramble (the curation)

Ground truth from the current code:

- **`ContextDescriptor`** (`app/src/shared/context/ContextDescriptor.ts`) already models "the
  active surface object + an optional selected subobject" for right-pane scoping. Real and extendable.
- **Selection→AI already works on two surfaces** via `AiTabPanel` custom-event handlers:
  `pdf-text-selection` (PDF text) and `protocol-step-selection` (protocol planning) both call
  `chat.send(<prompt>, ...)`. This is the canonical pattern.
- **/find "Send to AI" is a broken stub**: `GraphSearchPage.sendSelectionToAi` builds a
  collection/selection and calls `graphAiContext(...)`, but then only `setAiContext(<display string>)`
  — it never dispatches to the AI chat, never persists a context, never captures corpus. **This is
  the concrete thing to fix.**
- **`context.schema.yaml` (`CTX-…`) is computed well/plate state after replay** — NOT a UI
  "surface context." They are cousins, not the same thing; do not conflate them.
- **Lab identity pieces exist but are scattered**: `NamespaceSection` (baseUri/prefix) in Settings,
  seeded protocols/labware/ontology terms, a platform registry (instruments/equipment),
  `residentContext` (world map + in-use ontology vocab). There is **no unified declarative "THIS
  lab" manifest** the AI and corpus both ground on.
- **Corpus moat exists** (`CorpusClient` → cl-appliance corpus-service) but only captures
  `protocol-loop`/`event-editor` prompt→accepted-EVG pairs. It does **not** capture
  surface→selection→prompt→landing-context pairs.

**Keep (core — the plan builds these):**
1. **Thread "THIS lab" through everything.** Namespace is edited in Settings but not unified with
   instruments/protocols/reagents/ontology-namespace into a single declarative lab identity the AI
   and corpus ground on. Small models need a stable, complete "lab" preamble.
2. **Make "where I am" deterministic and serializable.** `SurfaceContext = { surface,
   activeObject, selection:Ref[], prompt }` — a YAML/JSON unit that flows surface→AI→next-surface.
   This is the insight, and it is NOT crazy: it is the generalization of the two working
   selection→AI seams + `ContextDescriptor`.
3. **Bundle-then-prompt is the seed for where the user lands.** Fix /find so "send N wells to AI"
   dispatches a real context into the AI chat, lands the user on whichever surface follows, and —
   crucially — is capturable as a training example.

**Defer (YAGNI — park it, don't build):** "deterministic context-based page building from a
library of components." The worth-keeping kernel is *surfaces are declared, not hardcoded* (a
surface registry). The generic component-tree page renderer is a big pivot unrelated to the corpus
goal; note it as a future direction only.

**North star:** each confirmed `SurfaceContext → AI response → accepted next-surface/action`
round-trip IS a small-model training example. Fix the loop first; capture second.

---

## Phase 0 — Baseline & inventory (no code)

**Objective:** Confirm current state so later tasks have exact ground truth.

- Run `npm run typecheck -w app && npm run typecheck -w server` → both clean.
- Run `cd server && npx vitest run src/graph-query src/corpus src/ai/residentContext.test.ts`
  → note passing/passing.
- Record the exact shape of `GraphSearchPage.sendSelectionToAi` (file lines ~159-172), the two
  `AiTabPanel` custom-event handlers (~490-530), and `CollectionService.toAiContext`.
- Commit: none (baseline only).

---

## Phase 1 — Declarative Lab Identity ("THIS lab")

### Task 1.1: Author the lab-profile registry YAML

**Files:**
- Create: `schema/registry/lab-profile/lab-profile.yaml`

Declarative, mirrors `material-profile.registry.yaml` / `biological-types.yaml` style. The
`namespace` block is the same `baseUri`/`prefix` the user edits in Settings — this registry is the
single source the AI and corpus read.

```yaml
version: 1
title: "Lab Identity Profile"
description: >
  THIS lab — the declarative identity the AI resident context and corpus training
  ground on. Namespace is edited in Settings; instruments/protocols/reagents are
  refs into the existing registries; ontologyNamespace is the local CURIE prefix.

profile:
  label: "Brad's bead-basher microbiome lab"
  namespace:
    baseUri: "https://example.org/records/"
    prefix: "example"
  ontologyNamespace: "cf"          # local CURIE prefix (cf:ROS, cf:PPARalpha …)
  instruments:
    - label: "QuantStudio5"
      ref: { kind: record, id: INSTDEF-…, type: instrument-definition }
    - label: "Bead Basher"
      ref: { kind: record, id: INSTDEF-…, type: instrument-definition }
  protocols:
    - label: "ZymoBIOMICS 96 MagBead DNA Kit"
      ref: { kind: record, id: prt-seed-biological-transfer, type: protocol }
    - label: "Biological Material Transfer"
      ref: { kind: record, id: prt-seed-biological-transfer, type: protocol }
  reagents:
    - label: "PBS pH 7.4"
      ref: { kind: record, id: mat-seed-pbs-ph74, type: material }
    - label: "Absolute ethanol"
      ref: { kind: record, id: mat-seed-ethanol-absolute, type: material }
```

**Step 1:** Write failing test `server/src/labProfile/labProfile.test.ts` — loads the registry,
  asserts `profile.namespace.prefix` + `profile.instruments.length >= 2` + refs have
  `{kind,id,type}`.
**Step 2:** Run → FAIL (no loader yet).
**Step 3:** Loader `server/src/labProfile/labProfile.ts` (normalize + validate, pattern after
  `server/src/ontology/biologicalTypes.ts`), export `loadDefaultLabProfile(schemaDir)`.
**Step 4:** Run → PASS.
**Step 5:** Commit `feat(lab-profile): declarative lab identity registry + loader`.

### Task 1.2: Serve the lab profile + read namespace from config

- Modify `server/src/api/routes/biological-types.ts` (or a new `lab-profile.ts`) → add
  `GET /api/lab-profile` returning the registry, overriding `namespace` from live repo config
  (`ctx.appConfig.repositories[0].namespace`).
- Test: `server/src/labProfile/labProfile.test.ts` asserts the endpoint-less pure helper
  `mergeNamespace(profile, repoConfig)` prefers live config over registry defaults.
- Commit `feat(lab-profile): GET /api/lab-profile with live namespace override`.

### Task 1.3: Surface lab identity in Settings

- Modify `app/src/shell/SettingsPage.tsx` (+ imported sections) → add a **Lab Profile** editable
  section (new `app/src/shell/settings/LabProfileSection.tsx`): shows label, namespace (baseUri +
  prefix), ontology namespace, and read-only instrument/protocol/reagent chips.
- Reuse `apiClient.getConfig()` + new `apiClient.getLabProfile()` (add to
  `app/src/shared/api/client.ts`).
- TDD: `app/src/shell/settings/LabProfileSection.test.tsx` renders label + chips from a mocked
  profile.
- Commit `feat(lab-profile): SettingsLab Profile section`.
- **Live-verify (SOUL rule):** open Settings → Lab Profile shows the label + namespace + chips.

### Task 1.4: Inject lab identity into AI resident context

- Modify `server/src/ai/residentContext.ts` → `buildResidentContext(registry, store, labProfile?)`
  adds a `THIS LAB` preamble (label, namespace, instruments, protocols, reagents, ontology prefix)
  when a profile exists (keep < ~1.5KB addition; guard empty).
- TDD: `server/src/ai/residentContext.test.ts` — a stub profile yields a preamble containing the
  lab label + ontology prefix; absent profile → no change (back-compat).
- Commit `feat(lab-profile):lab identity into AI resident context`.

---

## Phase 2 — Surface registry + SurfaceContext payload

### Task 2.1: Define the `SurfaceContext` type (frontend + server mirrors)

**Files:**
- Create `app/src/shared/context/SurfaceContext.ts`
- Create `server/src/surfaceContext/SurfaceContext.ts` (mirror)

```ts
export type SurfaceId =
  | 'project' | 'run-plan' | 'run-design' | 'run-execute'
  | 'results' | 'analysis' | 'knowledge' | 'find'

export interface ActiveObject {
  objectType: string; objectId: string; label: string;
  linkedProjectIds?: string[];
}

export interface SelectionItem { ref: Ref; label?: string }

export interface SurfaceContext {
  surface: SurfaceId;
  active: ActiveObject;           // what the surface is scoped to
  selection: SelectionItem[];     // arbitrary graph nodes / events / wells / text
  prompt: string;                 // user goal / instruction
  asOf?: string;                  // ISO timestamp
}
```

Exact-optional mode: every optional field via conditional spread (repo rule).
**TDD:** `app/src/shared/context/SurfaceContext.test.ts` + `server/src/surfaceContext/*.test.ts`
  assert serialize→parse round-trip to YAML keeps `selection` refs intact; empty `selection`/`prompt`
  are absent (not `undefined`).

### Task 2.2: Surface registry (declarative)

**Files:**
- Create `schema/registry/surfaces/surfaces.yaml`
- Create `server/src/surfaces/surfaces.ts` (loader, pattern after biologicalTypes)
- Create `app/src/shared/surfaces.ts` (client types)

```yaml
version: 1
surfaces:
  - id: find
    label: "Find / Search"
    path: "/find"
    objectTypes: [project, run, well, collection]
    selectableKinds: [well, cell, event, material]
    aiRole: "search selection → AI context"
  - id: run-design
    label: "Run · Design"
    path: "/project/:studyId/run/:runId"
    # plan→design→execute are MODES of ONE run surface — one tab per run, never
    # separate tabs (locked decision #3). Same surface id, mode field on context.
    objectTypes: [run]
    selectableKinds: [event, well, material]
    aiRole: "event-graph editing"
  …# project, run-plan, run-execute, results, analysis, knowledge, etc.
```

**TDD:** loader returns a surface for `find`/`run-design`; `getSurface(id)`; unknown id → null.
**Commit:** `feat(surfaces): declarative surface registry + loader + client`.

### Task 2.3: Context payload → first-class serialization helper

- Create `server/src/surfaceContext/surfaceContext.ts` (server) — `toYaml(ctx: SurfaceContext)`,
  `toJson(ctx)`, `parseSurfaceContext(yamlOrJson)`. Pure, deterministic.
- TDD: round-trips; a `SurfaceContext` with a well selection serializes to a stable YAML key order.
- Commit `feat(surface-context): deterministic YAML serialization`.

---

## Phase 3 — Fix /find "Send to AI" (the broken one)

### Task 3.1: Build a real SurfaceContext from the selection

- Modify `app/src/graph-search/GraphSearchPage.tsx` `sendSelectionToAi` (~159-172):
  - keep `createGraphCollection` + `createGraphSelection`,
  - replace the `setAiContext(displayString)` stub with a **SurfaceContext**:
    `{ surface:'find', active:{objectType:'collection',objectId:selection,label:'Find selection'}, selection:[...selectedIds as well refs], prompt: <user prompt captured from a small input>, asOf: new Date().toISOString() }`,
  - keep a terse status line for the testid `graph-search-ai-context`.
- Add a small prompt `<input>` in the right pane (default `"Analyze these wells"`) so the prompt is
  user-editable (matches the bundist-then-prompt idea).
- TDD: refactor the pure part into `app/src/graph-search/selectionToSurfaceContext.ts` (test the
  builder: ids → refs, surface, prompt defaults) — unit-test the pure fn.
- Commit `fix(find): Send to AI builds a SurfaceContext from the selection`.

### Task 3.2: Dispatch the context into the AI chat (the working pattern)

- Modify `GraphSearchPage` to emit a custom event `surface-ai-request` with detail
  `{ SurfaceContext }`, OR (preferred) accept an `onToAi?: (ctx: SurfaceContext) => void` prop.
- Modify `GraphSearchPage` and the `/find` host so the dispatched context lands in the
  **CURRENT tab's AI pane** (the run/project stays open underneath — Model A, locked #1). The
  AI message preamble: `"From the Find surface, selected N wells: <ctx as YAML>\nGoal: <prompt>"`.
- Add an `AiTabPanel` listener for `surface-ai-request` (mirror the two existing handlers at ~490-530).
- TDD: `AiTabPanel` handler test — dispatching `surface-ai-request` calls `chat.send` with a prompt
  that includes the surface id and well count.
- Commit `fix(find): Send to AI dispatches the SurfaceContext into the AI chat`.
- **Live-verify (mandatory):** app+server running; /find "wells with clofibrate" → select rows →
  "Send N to AI" → the AI right pane receives a message containing surface=find + the wells, and the
  status line shows it (testid `graph-search-ai-context`).

### Task 3.3: Revisit only when a landing surface exists (DEFERRED — locked #2)

- Do NOT persist SurfaceContext onto a landing surface yet — no analysis/landing
  surface exists, so it'd be speculative (YAGNI). Revisit when the analysis surface
  is specced. The corpus side does NOT need it: the capture is context→prompt→accepted,
  which works today.

---

## Phase 4 — Standardize other selection→AI seams onto SurfaceContext (light)

- `pdf-text-selection` → build `{ surface:'knowledge', selection:[{ref:{kind:'document',id,label}}], prompt: text }` first, then `chat.send`.
- `protocol-step-selection` → `{ surface:'run-plan', active:{run}, selection:[{ref: step}] , prompt }`.
- Add a tiny shared helper `app/src/event-editor/right-pane/ai/toSurfaceContext.ts` and reuse in both
  handlers; delete the inline string-building.
- TDD: both handlers now call the helper and emit a well-formed SurfaceContext; existing tests updated.
- Commit `refactor(ai): standardize selection→AI seams on SurfaceContext`.

---

## Phase 5 — Corpus capture of surface-context pairs (THE weekend goal)

### Task 5.1: Extend CorpusClient input kind

- Modify `server/src/corpus/CorpusClient.ts`:
  - add to `CorpusPrompt` a `surfaceContext?: Record<string, unknown>` field,
  - add `source` enum value `'Surface-context'` (alongside 'protocol-loop'|'event-editor'|...),
  - document that a pair =  { prompt( incl. SurfaceContext YAML ) → accepted next-surface/action }.
- TDD: `server/src/corpus/CorpusClient.test.ts` — a passed surface-context prompt round-trips + the
  anonymize step strips internal record ids/selected-well ids (opt-in anonymize).
- Commit `feat(corpus): SurfaceContext field on corpus prompts`.

### Task 5.2: Capture seam at an accept/confirm surface

- Pick the first high-value accept point: the run `execute`/accept path (the existing
  `persistAcceptedEventGraph` seam in the frontend + the AI-thread promote seam already post corpus).
- Add: when a SurfaceContext-annotated user turn leads to an accepted event/context change, post a
  `Surface-context` corpus entry:
  { prompt: { system, user: goal, surfaceContext: toJson(sc) }, acceptedGraph: <the accepted EVG/state>, confirmedBy:'accepted-EVG', confirmedAt }.
- Reuse `buildSurfaceContextCorpusEntry` pure helper (`server/src/corpus/surfaceContextCorpus.ts`, unit-testable) — no networking in the test (mock CorpusClient).
- TDD: helper builds the anonymized entry; accepts a valid SurfaceContext + a small accepted graph.
- Commit `feat(corpus): capture SurfaceContext→ accepted pairs`.

### Task 5.3: Local smoke-verify the corpus capture (no external dependency)

- Add a `CORPUS_DISABLE_EXTERNAL`-style guard / an env toggle so tests can capture to a local JSONL file
  (temp dir) instead of the cl-appliance service. Tie to the existing `corpus.enabled` +
  opt-in.
- TDD: a full local round-trip — send SurfaceContext → accept → entry written to temp JSON with
  prompt.surfaceContext present and acceptedGraph non-empty.
- Commit `feat(corpus): local JSON capture for surface-context pairs`.

---

## Deferred / open questions

- **"Page builder from a library of components"** — parked. The kernel (declared surfaces) ships in
  Phase 2; the generic renderer does NOT. Revisit only when surfaces are stable.
- **Landing surface after /find → AI** — deferred by locked decision #2: no analysis
  landing surface yet, so no persistence. Revisit when the analysis surface ships;
  the corpus capture does not depend on it.
- **`CTX-…` context vs `SurfaceContext`** — intentionally different; document the distinction in
  schema/context comments.
- **Namespace single-sourcing** — `GET /api/lab-profile` reads live repo config namespace, but the
  YAML registry also lists one; ensure `mergeNamespace` resolves the conflict deterministically
  (config wins), and test it (1.2).

## Risks / tradeoffs

- **Dependency on cl-appliance corpus-service for 5** — the moat service may be offline; 5.3's local
  JSON capture is the testable path and the delivery unit for a weekend. Don't rely heavily on the
  remote service.
- **SurfaceContext size** — keep selection refs lean (ids only, no full payloads); the corpus entry
  is prompt+accepted, not the whole graph.
- **Scope creep toward a page-builder** — resist; the plan stops at surface registry.

## Validation checklist (end of weekend)

- [ ] typecheck app + server clean
- [ ] vitest: labProfile, surfaces, SurfaceContext (app+server), graph-search fix, AiTabPanel
     handler, surface-context corpus helper all green
- [ ] Live: Settings shows Lab Profile; /find "wells with clofibrate" → select → "Send to AI"
     reaches the AI chat with surface=find + wells; AI responds; a confirmed pairing writes a local
     corpus JSON entry
- [ ] no regression: existing graph-query + corpus + residentContext tests still pass