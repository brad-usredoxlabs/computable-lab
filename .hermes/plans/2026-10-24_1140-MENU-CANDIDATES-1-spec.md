# SPEC DRAFT — MENU-CANDIDATES-1 (l2t1030, audit-first)

Item: MENU-CANDIDATES-1 — "Material /m menu candidate generation returns degenerate lists
(12 identical aggregate rows, no per-component candidates despite per-component MAT records)".
Lane 2 · spec composer · 2026-10-24 · draft for orchestrator ratification (NOT dispatch-ready
until ratified). Repo read at cl-integration-2 tip 154746ef (docs tip; code tip verified via
`git -c core.fileMode=false rev-parse --short HEAD`).

## Goal (one sentence)

Make the material menu that ClarificationPicker drives return a deduplicated candidate list in
which per-component records surface whenever the card's query is an aggregate label — as a fix
to the MENU candidate-generation surface only, never to `clarificationsFromUnresolvedFacts`
(Ruling 4).

## Binding inputs

- Task block: task-list.md:12521-12543 (description/why/verified-by quoted verbatim below).
- Architect ruling: decisions/REVISEGHOST1-a5tier2-readingcard-decision-l2t0650.md, Ruling 4
  (lines 133-146): "The owner is the material MENU candidate-generation surface (the `/m`
  search the ClarificationPicker drives — menu results/dedup/layering), not
  `clarificationsFromUnresolvedFacts`, which passes candidates through untouched by design."
- Evidence: receipts/REVISE-GHOST-1/2026-10-24_062716-a5-tier2/ — report.md defect 4
  (lines 165-168: "aggregate formulation label repeated (12 identical rows) plus a mint row,
  and NO per-component candidate … the store holds per-component records
  (MAT-thermo-dmem-1vq1, MAT-thermo-fbs-1qbj, MAT-thermo-trypsin-edta-1fqu)");
  state-F1b-03-round0.json (role-gap card label `"Thermo trypsin-EDTA + Thermo DMEM + Thermo
  FBS + HepG2 cells"`; fraction-sum card label is the comma-joined aggregate).

## Acceptance criteria (verbatim from task list)

> Spec-phase first (audit every candidate-generation site). Then RED-first tests: aggregate
> dedup + per-component candidates present when MAT records exist. Browser gate if the fix
> changes the picker surface.

And the description's constraints, verbatim:

> Architect Ruling 4 …: defect 4 belongs to the material MENU candidate-generation surface
> (menu results/dedup/layering that ClarificationPicker drives), NOT
> clarificationsFromUnresolvedFacts (which passes candidates through untouched by design — the
> fix must not violate its pure-structural-map contract). … explicitly NOT a gate for the
> current hold (the role-gap card demonstrably answers fine through the picker today).

## Audited ground — every candidate-generation site feeding the material menu

The picker's whole candidate pipeline, end to end (all cites first-hand at 154746ef):

1. **Card shape (server, NOT to be touched).** `clarificationsFromUnresolvedFacts`
   (server/src/ai/shorthandChat.ts:521-561) is the pure structural map: it sets
   `menuProvider: '/m'` for domain-material facts (:540), **`query: fact.label` (:552)** — the
   card prefills the /m search with the fact's full aggregate label — and `options: []` (:556)
   with the bar's own candidates riding untouched on `unresolvedFact`. `allowCreateLocal` at
   :542. **The defect's fuel is this prefilled aggregate query; the fix is NOT here** (Ruling 4).
2. **Picker (app).** `ClarificationPicker` (app/src/event-editor/right-pane/ai/
   ClarificationPicker.tsx): `resolverFor` picks `resolveMaterial` for '/m' (:30-35); state is
   seeded `query = request.query ?? ''` (:164); the resolver is invoked with the prefilled
   query and optional `materialLayer` (:184-232, layer spread :211); streamed additions merge
   via `merge()` — **deduped by `s.key` only** (:68-79). Empty-query '/m' cards show nothing
   (:195-199). The picker SURFACE (input + SlashSuggestionList) is not part of the defect.
3. **Menu candidate generation proper (app) — THE OWNER.** `resolveMaterial`
   (app/src/shared/taptab/slashMenu/resolvers.ts:32-132):
   - First paint = `apiClient.searchMaterials({ q, limit: MATERIAL_PAGE * 2 })` (:52, cap
     constant `MATERIAL_PAGE = 12` at :30) **plus** `apiClient.getFormulationsSummary({ q,
     limit: MATERIAL_PAGE })` unless concept-scoped (:53-55).
   - `materialSuggestions` (materialSuggestions builder :594-651) merges formulations +
     records, **dedupes by `recordId` only** (:611-617), sorts by the hardcoded
     `MATERIAL_CATEGORY_RANK` (:586-592), and emits `key = entityKind:recordId` (:632) —
     **no label-level dedup anywhere**.
   - `initial = workspace.slice(0, MATERIAL_PAGE)` (:60) — the 12-cap that turns duplicate
     aggregate rows into a full page; mint row appended after the slice (:67-92), always last.
   - Ontology tiers stream in via `apiClient.resolve` (:99-129) → `ontologySuggestions`
     (:316-350) **drops `local-record` candidates** (:322-325), so the spine's tier-1 hits
     cannot rescue per-component rows either.
   - Layer-scoped branches (:40-42, :141-191) are not in the defect path (shorthand '/m'
     cards ship no `materialLayer`; that field is set by the protocol-thread gate —
     ClarificationPanel.tsx:218, ClarificationPanel.panelSemantics.ts:147).
4. **Server search endpoints (data shape only).**
   - `GET /materials/search` (routes.ts:591 → MaterialLifecycleHandlers.ts:481-540): scans
     `MATERIAL_SEARCH_SCHEMA_IDS` (materialSpec, vendorProduct, materialInstance, aliquot,
     material, term — :417-424); matching is **substring record-contains-query**:
     `matchesSearch` over recordId/title/subtitle/kind (:305-309) OR `payloadMatchesSearch`
     (:326-353); sorted by title (:537), capped 1..100 (:490). **No dedup, no label collapse.**
   - `GET /materials/formulations/summary` (routes.ts:566 → MaterialPrepHandlers.ts:535-903):
     recipe-driven; substring filter over recipe/output/role labels (:872-887), limit slice
     (:890-892). Contributes the `saved-stock`-ranked duplicate rows (rank 0, resolvers.ts:587).
5. **Server resolve spine (secondary site).** POST /resolve (routes.ts:491) → ResolveSpine
   (server/src/resolve/ResolveSpine.ts:1-17 doc; tier bases :44) with tier-1 record provider
   `f.includes(needle)` (server/src/resolve/providers/records.ts:60-90) — **same one-direction
   substring test**, so the spine shares the blind spot but is NOT on the picker's first-paint
   row path (its local-record hits are dropped at resolvers.ts:322-325).
6. **Where the duplicates come from (write side, out of scope).** `MSP-DRAFT-…`
   implicit material-specs are minted **per accepted event** with
   `implicitMaterialSpecId(eventGraphId, eventId)` (server/src/materials/AddMaterialSupport.ts:165-168),
   named `componentLabels.join(' + ')` (:227-235) — every accept/re-hold cycle adds another
   same-titled spec (live: 4x `MSP-DRAFT-EVG_MV7Q7F5I_…` + prior-drive `MAT-thermo-trypsin-
   edta-ther-1tuz`/`-1mlm` aggregate MAT records). Plus agent-minted aggregate MAT rows from
   earlier answer drives (state-F1b round picks; backend.log.extract.txt fold-null arm lines).

### Live reproduction (composer, 2026-10-24, on the live lane-2 stack, read-only GETs)

- `GET /api/materials/search?q=Thermo%20trypsin-EDTA%20%2B%20Thermo%20DMEM%20%2B%20Thermo%20FBS%20%2B%20HepG2%20cells&limit=100`
  → **6 items, 5 with byte-identical title** (4 material-spec + 1 material, distinct
  recordIds) → client shows identical-titled rows + mint. The evidence-day store had ≥12
  matches for the role-gap label, filling the page exactly.
- Same endpoint, `q=Thermo DMEM` → `MAT-thermo-dmem-1vq1 | material | Thermo DMEM` **exists**
  (the per-component records are real; report.md defect 4 names all three ids).
- `POST /api/resolve {term:<aggregate>,kinds:[material],localOnly:true}` → 7 candidates, 6 of
  them the SAME aggregate label + the mint row; per-component labels appear **nowhere**.

## Root cause (answers to (a)-(d))

**(a) Why 12 identical aggregate rows.** Not the cap alone and not a missing key-dedup — the
key-dedup (recordId) is working as coded. The rows are **distinct records that render
identically**: the per-accept MSP-DRAFT writes + prior-drive aggregate mints all share one
title; `materialSuggestions` dedupes only by recordId (resolvers.ts:611-617) and `merge()`
only by key (ClarificationPicker.tsx:68-79), so N same-titled records = N indistinguishable
rows; `slice(0, MATERIAL_PAGE)` (resolvers.ts:60, MATERIAL_PAGE=12 at :30) then fills the
whole page with them. Layering is not the culprit (the flat '/m' menu deliberately mixes
layers, resolvers.ts:44-60); the cap keeps the duplicates because nothing collapses them.

**(b) Why per-component MAT records never surface.** One-directional substring matching plus
an aggregate query. The card prefills `query = fact.label` (shorthandChat.ts:552) — the FULL
aggregate string. Every tier asks "does the RECORD contain the QUERY": matchesSearch
(MaterialLifecycleHandlers.ts:305-309), payloadMatchesSearch (:326-353), spine record provider
(records.ts:75-77), formulation summary (:872-887). A record titled `Thermo DMEM` does not
contain `Thermo trypsin-EDTA + Thermo DMEM + …`, so it is filtered out at the SERVER, before
any client logic sees it. The ontology streaming tiers would not help: they drop
`local-record` sources (resolvers.ts:322-325). So per-component records exist, are searched
kinds, and are structurally unable to match an aggregate needle.

**(c) Declarative surface vs hardcoded TS.** What IS data today: layer scoping
(`materialLayer` rides the request, ai.ts types app/src/types/ai.ts:287, set from
eligibility DATA via levelSpellings/LAYER_ALIASES in
schema/scientist-intent/material-eligibility/material-eligibility.yaml:106 +
ClarificationPanel.panelSemantics.ts:147); mint gating (nounShape DATA,
shorthandChat.ts:533). What is HARDCODED TS policy — flagged per the project rule "policy
must be data": (i) the menu page cap `MATERIAL_PAGE = 12` / `PAGE = 8` (resolvers.ts:29-30);
(ii) the flat-menu layer recipe (which endpoints to hit and in what order, resolvers.ts:51-129);
(iii) `MATERIAL_CATEGORY_RANK` display ranking (resolvers.ts:586-592). No config file governs
menu dedup/layering. The minimal fix should NOT widen these hardcoded sites; OQ4 asks whether
the orchestrator wants the cap/rank table migrated to config in this item or banked.

**(d) Smallest fix shape consistent with Ruling 4.** Two changes, both inside the app-side
menu candidate-generation surface (`app/src/shared/taptab/slashMenu/resolvers.ts`), zero
server changes, zero changes to `clarificationsFromUnresolvedFacts`, zero picker-SURFACE
changes (same input, same list, same mint floor — only the ROW CONTENT changes):

- **Fix A — display-label dedup.** In `materialSuggestions` (resolvers.ts:611-617), collapse
  rows that share `(entityKind, normalized title)` — keep the first (rank order already puts
  the best category first via :586-622; ties sort by title so first = deterministic). Key
  stays `entityKind:recordId` (distinct records remain distinct answers; dedup only removes
  visually indistinguishable duplicates). This turns 12 identical rows into one row per layer.
- **Fix B — aggregate-query component expansion.** In `resolveMaterial`, when the query
  contains the structural aggregate joiners that the platform itself writes (`' + '` from
  AddMaterialSupport.ts:234; `','` and `'/'` observed in live aggregate labels), additionally
  fire one `searchMaterials` per trimmed component token and merge the hits through the SAME
  dedup — exact-token titles land after the direct hits, before the mint row, via the existing
  streamed `onUpdate`/`merge` path (resolvers.ts:99-129, ClarificationPicker.tsx:68-79). This
  is a SEARCH-SHAPE change in the menu owner: it does not suppress mint, does not touch
  nounShape (explicitly forbidden by ruling lines 22-23), does not branch on `fact.reason`,
  and stays byte-identical for any query without the joiners.

**Does it change the picker SURFACE?** No — no component/prop/interaction change
(ai.ts `AiClarificationRequest` untouched; ClarificationPicker.tsx untouched). Per the
verified-by clause, no NEW browser gate is owed; the proof is RED-first unit tests plus one
scripted picker evidence-drive (the f1.mjs row-count pattern from the receipts dir) against
the live stack after merge. No live curl can prove Fix A/B because both are client-side menu
composition; the evidence-drive is the honest equivalent of the curl clause.

## Files

In scope:
- app/src/shared/taptab/slashMenu/resolvers.ts (Fix A: materialSuggestions :611-617; Fix B:
  resolveMaterial :32-132)
- app/src/shared/taptab/slashMenu/resolvers.test.ts (RED tests land here; mock-fetch pattern
  already established at :29-40 and :473-549)
- optionally a new alongside test file resolvers.menucandidates.test.ts if the existing file
  grows past reviewer tolerance

Explicitly OUT of scope (do not touch):
- server/src/ai/shorthandChat.ts (Ruling 4: pure-structural-map contract)
- server/src/api/handlers/MaterialLifecycleHandlers.ts / MaterialPrepHandlers.ts /
  routes.ts (server search semantics byte-identical)
- server/src/resolve/** (shared spine; blast radius includes the compiler — OQ1)
- app/src/event-editor/right-pane/ai/ClarificationPicker.tsx, QuestionsPanel.tsx
  (surface; QuestionsPanel is READING-CARD-ANSWER-1 territory anyway)
- server/src/materials/AddMaterialSupport.ts (duplicate-write leg — OQ3)
- config/drafting/shorthand-drafting.yaml nounShape (ruling lines 22-23 prohibition)

## First targeted check (proves the approach early)

Before writing Fix A, reproduce the degenerate list deterministically:
`npm run test:unit -w app -- run src/shared/taptab/slashMenu/resolvers.test.ts` with the NEW
RED test feeding 4 same-titled MSP-DRAFT items + 1 same-titled material from the mocked
searchMaterials/getFormulationsSummary: it must FAIL showing 5 rows for one label, and PASS
after Fix A with 2 rows (one per entityKind) + the mint row. That single test failing-then-
passing is the early proof that the dedup site is right.

## Verification commands (complete)

- RED first (must FAIL on trunk, pass after fix):
  `npm run test:unit -w app -- run src/shared/taptab/slashMenu/resolvers.test.ts`
  Expected pre-fix: new dedup + component-expansion tests fail (rows=5 duplicates; zero
  component rows). Post-fix: whole file green, including the byte-stability pin below.
- App suite + typecheck:
  `npm run test:unit -w app` → green; `npm run typecheck -w app` → clean.
- Server untouched, regression pin only:
  `npm run test:run -w server` → green (no server files changed; this catches accidental drift).
- Live evidence-drive after merge+restart (orch or coder, read-only): open the role-gap card
  on the canonical hold, row-count via `[data-slash-row]` in
  `[data-question-id="unresolved-c-4f2f51d965"] .message-log__clarification-picker` —
  expected: identical-title rows collapsed to ≤2 and at least one row labeled exactly
  `Thermo DMEM` / `Thermo FBS` / `Thermo trypsin-EDTA` present. Store-state caveat: the live
  store also needs the three MAT records (verified present today via
  `GET /api/materials/search?q=Thermo DMEM`).

## Worker contract

- Worktree: wt/MENU-CANDIDATES-1-lane2-l2t1030, branch `cl/lane2-menu-candidates-1-l2t1030`
  off the lane-2 trunk at ratification-time tip.
- Deliverable: `.hermes/plans/<ts>-MENU-CANDIDATES-1-report.l2t1030.md` + code on the branch;
  unique paths only (no shared-file writes).
- Collision: READING-CARD-ANSWER-1 (live) touches shorthandChat.ts / AgentOrchestrator.ts /
  QuestionsPanel.tsx + card model builder. Disjoint from this item's files — **dispatchable in
  parallel, no sequencing gate**; re-verify cites at dispatch tip regardless.
- No product-data writes; tests run against mocked fetch only.

## Reviewer bait (anticipated adversarial review)

- **Hardcode-boundary**: Fix B's joiner set must stay the exact structural joiners the
  platform itself emits (`' + '`, `','`, `'/'`) and must NOT become a label-shape hack or a
  reason-literal branch — it never suppresses mint, never removes the question, never keys on
  `composition-fraction-sum`/`composition-role-gap`. Any TS reasons list = instant reject.
- **Ruling-4 jurisdiction**: any diff line in server/src/ai/shorthandChat.ts, or any change to
  how `query` is set on the fact-map, is out of remit even if tempting ("fix the query at the
  source").
- **exactOptionalPropertyTypes sites**: the conditional-spread idiom is load-bearing in this
  codebase — resolvers.ts `...(item.subtitle && …)` (:642), `detail` optional fields (:302-313);
  ClarificationPicker.tsx:211 layer spread. New suggestion fields must ride conditional
  spreads, never `x: undefined`.
- **YAML-reload trap**: if OQ4 lands "cap/rank to config", the loader must run per call like
  `loadNounShape()` (shorthandChat.ts:533 comment) — a module-load-cached config breaks tests
  and hot-reload.
- **Ontology terms / two-local-terms**: a deduped row must keep its real recordId mention;
  collapsing rows must not mint or invent a term for "the aggregate" (the cardinal sin named
  in ruling lines 113-117). Dedup is presentation, selection is still a real record.
- **Byte-stability pin required**: a test pinning that a delimiter-free query (`'tris'`,
  `'dmem'`) produces byte-identical output to today (existing tests at resolvers.test.ts:117,
  :316 stay untouched and green is part of the pin).
- **Cap interaction**: dedup must run BEFORE `slice(0, MATERIAL_PAGE)` (resolvers.ts:60), or
  the reviewer is right that dedup still leaves 11 blank-feeling rows of older duplicates.

## Open questions for the orchestrator (with recommendations)

- **OQ1 — component-expansion placement.** App `resolvers.ts` (menu-only, minimal, exactly
  Ruling 4's owner) vs server `ResolveSpine` tier-1 (would also help the compiler's
  NounPhraseResolver but changes spine semantics for EVERY consumer,
  server/src/resolve/ResolveSpine.ts:1-17 "so they all agree"). RECOMMEND: app-side now;
  spine change is a separate knowledge-layer ruling if ever wanted.
- **OQ2 — dedup key.** `entityKind + normalized title` (recommended: a same-titled material
  concept and material-spec are different layers and both legitimately answer an unscoped
  '/m' card, resolvers.ts:36-42 doctrine) vs title-only collapse. RECOMMEND entityKind+title.
- **OQ3 — duplicate-write leg.** The per-accept `MSP-DRAFT-<EVG>_<EVT>` writes
  (AddMaterialSupport.ts:165-168, :227-235) are why 12 duplicates exist at all; menu dedup
  hides the symptom, does not stop accumulation. RECOMMEND: bank a hygiene/backlog note, do
  NOT fold write-side dedupe/idempotency into this item (different owner, needs its own
  ruling — precedent: MINT-IDEM-1 draft in specs-draft/).
- **OQ4 — cap/rank migration to data.** `MATERIAL_PAGE`/`MATERIAL_CATEGORY_RANK` are flagged
  hardcoded policy (c above). RECOMMEND: out of this item (would widen blast radius and the
  byte-stability pin); record as a standing hygiene observation.
- **OQ5 — fraction-sum card interplay.** After READING-CARD-ANSWER-1 merges, the fraction-sum
  card becomes a choice card and stops driving '/m'; this item's tests must therefore key the
  RED scenario on the ROLE-GAP label shape (`A + B + C`), not the fraction-sum comma label, so
  they stay meaningful post-READING-CARD. RECOMMEND: coder tests both shapes anyway (Fix B's
  joiner set covers both).

## Leg split

None needed. One leg, one coder, ~3 files, no server changes, parallel-safe against the live
READING-CARD-ANSWER-1 item (disjoint file sets). A second leg only materializes if OQ1 or OQ3
are ruled INTO remit (then split: leg 2 = spine/eligibility ruling + own spec).

STATUS: complete
