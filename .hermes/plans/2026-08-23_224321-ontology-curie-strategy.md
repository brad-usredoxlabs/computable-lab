# CURIE / Ontology Strategy — Final Plan: Canonical `term` Identity Spine (Option B)

> **Goal:** Move the lab to a **single canonical `term` identity node** per named thing, replacing the
> fragmented per-type namespaces (MAT / VPR / LWD / INST / FORM / ALQ / LOT…) and demoting real ontology
> CURIEs and vendor catalog SKUs to a *provenance/linkout* role. Result: **one id universe** where
> "ethanol" (CHEBI:1234 / NCIT:8765 / Thermo:13579 / Sigma:4321) and "F praaus / FPRAUS / F pruas / f praaus"
> are provably the same thing by inspection of data tables.
>
> **Status:** FINAL PLAN — Option B committed. Plan-mode only; nothing implemented. Read-only pass done.
> Preserves all non-negotiables: schemas + git repo fully reconstruct the app; identity deterministic;
> grounding NL-first; CURIE is provenance-not-identity.

---

## 0. Why B is correct (the decision, committed)

The user chose B: a single canonical identity spine. Justification from prior compare/edit:
- B solves synonymy AND vendor/grade/volume AND ontologies with **one** node carrying
  `preferredLabel` + `aliases[]` + `linkouts[]` (ontology CURIEs, vendor SKUs, action verbs). No dual-home
  drift (A's wart). Concepts like "Zymo DNA extraction kit" (a kit, not a tube-fillable material) and
  "96-well plate" (labware) and "incubate" (a verb) all get a home that `material` alone cannot hold.
- B is the correct long-term foundation if the lab grows to many collaborating labs or publishes
  datasets against a shared external vocabulary; A's dual-id would only get harder to unwind over time.
- Cost acknowledged: this is the highest-risk refactor in the system (cross-cutting identity replumbing
  under schema-enforced refs, `unevaluatedProperties:false`, and the "no hardcoded, rebuildable from
  git" rule). It must be staged, gate-checked, and tested at every phase.

**The sub-decision that makes B tractable (and is the load-bearing design choice below):**
`term` (and its `material`/`vendor`/`labware`/`instrument`/`verb`/`kit` KINDS) subsumes the **concept-level**
identity. The **physical/instantiation records (material-spec, material-instance, material-lot, aliquot,
specific labware unit) REMAIN** as role records hanging off the term. We do NOT flatten the physical
hierarchy into term; we re-anchor its *root* identity onto term. This is the least-destructive faithful
version of B and keeps the material provenance stack (concept→formulation→instance→aliquot) intact.

---

## 1. Goal

Deliver a **unified `term` identity spine** with:

1. One canonical `term` record per named thing (materials, vendor products, labware, instruments, action
   verbs, kits, organisms, conditions).
2. `term.kind` discriminating the concept domain; physical/instantiation role records (spec/instance/lot/
   aliquot/labware-unit) hang off the term via a `root_ref` (now pointing at TERM ids, not MAT ids).
3. `term.preferredLabel`, `term.aliases[]`, `term.linkouts[]` — the mixed ontology+vendor+verb basket on
   ONE row. Real CURIEs are linkouts (provenance), not identity.
4. Resolve spine **tier 0 = termProvider (alias-first)** so a spelled variant beats a remote exact hit;
   compiler, UI picker, MCP tool, and agent all resolve to the one truth.
5. Backward-compatible read path during AND after migration: legacy `MAT-…` refs keep resolving (via a
   term-linkup), so the system never breaks mid-migration.

**Architecture (3 sentences):** New record type `term` (`schema/core/term.schema.yaml`), minted with the
existing deterministic `labelHash`/`labelSlug` helpers (id `TERM-<slug>-<hash>`). It is the canonical
identity node; `kind` (material/vendor/labware/instrument/verb/kit/organism/condition/other) scopes its
role, and physical/instantiation records link to it via a `root_ref` (`ref.kind: record`, `type: term`).
The resolve spine gains a tier-0 `termProvider` that matches `aliases[]` first; the JSON-LD index is
re-anchored so a `term` hit surfaces the linked physical records. Old namespaces are migrated in place
(legacy MAT/VPR/LWD/INST ids become aliases or get a term linkup) so no consumer breaks.

**Tech stack:** TypeScript (server + app), Ajv2020 + lint YAML (declarative rules), `resolve/` spine +
`termId.ts`, JSON-LD sqlite index, `taptap/slashMenu/` (protocol editor only), FoundryHumanReview
(confirm-once linking).

---

## 2. Current context / evidence (identity surface, mapped)

- **~40 record kinds** (measured via `const: "…"` scan of `schema/`): `material`, `material-spec`,
  `material-instance`, `material-lot`, `aliquot`, `vendor-product`, `vendor-offer`, `labware-definition`,
  `labware-geometry`, `instrument-definition`, `instrument-log`, `equipment-class`, `readout-definition`,
  `library-bundle`, `plate-layout-template`, `verb-definition`, `event-graph`, `protocol`, `local-protocol`,
  `graph-component(-version)`, `execution-*`, `planned-run`, `person`, `qualification-record`, etc.
  Each carries its **own id namespace prefix** (MAT-, MSP-, ALQ-, LOT-, VPR-, LWD-, INST-, FORM-, LBW-…).
- **`Ref` two-kind union** (`ref.schema.yaml`, mirrored `server/src/types/ref.ts` +
  `app/src/types/ref.ts`): `kind: record|ontology`. The ontology node is where CURIEs currently live
  (`material.class[]`).
- **Resolve spine** (`ResolveSpine.ts`): 5 tiers `local-record→oak→ols4→vendor→mint`; emits
  `local:<recordId>` for local records (records.ts provider) and real ontology CURIEs. No tier matches
  `aliases[]` specifically today (`hasLexicalSupport` matches name/label only).
- **JSON-LD index** (`JsonLdIndex.ts`): sqlite FTS5, keys by `recordId`+`kind`, writes from RecordStore
  hooks. `/browser` advanced search + slash-menu `/m /l /p` lookups depend on it. This is the primary
  discovery index that must be re-anchored to term.
- **Material rooting** (`AddMaterialSupport.ts` 730 LOC, `MaterialGrounding.ts` 259,
  `bindOntologyMentions.ts` 256): mint `MAT-…`, ground ontology refs INTO material, publish
  material-spec/instance/lot/aliquot — all keyed on `recordId` + `kind:'material'`.
- **Consumer wiring**: compiler (NounPhraseResolver via `compileResolver`), deck ghost, event graph
  material_refs, `jsonld-index` facets ($.vendor facets exist), UI picker (`useResolveSearch`), MCP
  `ontology_search`, Foundry review. All consume `IT / the spine / recordId`.
- **Already modeled (no build needed):** vendor+catalog+grade (`vendor-product`), lot supplier
  (`material-lot`), labware catalogNumber (`labware`), kit/library (`library-bundle`), EXACT verb
  ontology (`exact.yaml` → compiler verbs). These are candidates to *become* term.kind rows, not new
  builds.

---

## 3. Design — the unified `term` spine (Option B)

### 3a. The `term` record (canonical node)

```
term:
  kind: material | vendor | labware | instrument | verb | kit | organism | condition | other
  id: TERM-<slug>-<hash>            # deterministic labelHash/labelSlug
  preferredLabel: "Faecalibacterium prausnitzii" | "ethanol" | "96-well plate" | "incubate"
  aliases: [ "F praus", "FPRAUS", "F pruas", "f praaus" ]   # normalized + alias-linted
  status: proposed | in_review | active | rejected | deprecated   # vocabulary lifecycle ONLY
  label: "…"                       # optional free-text notes
  domain: <controlled vocab>       # optional material/physical-domain hint (chemical, cell_line, …)
  linkouts: []                     # mixed basket, discriminated
  externalIds: []                  # optional refs to existing physical/instantiation records
  notes, createdAt, createdBy, provenance
```

`linkouts[]` discriminated union (mirrors `Ref`, refactor-friendly):
```
{ kind:'ontology', namespace:'CHEBI', curie:'CHEBI:1234', uri?, label? }
{ kind:'ontology', namespace:'NCIT',  curie:'NCIT:8765',  uri?, label? }
{ kind:'vendor',   vendor:'Thermo',  catalog_number:'13579', grade?, volume?, label? }
{ kind:'vendor',   vendor:'Sigma',   catalog_number:'4321',  grade?, volume?, label? }
{ kind:'action',   verb:'incubate',  exact?:'EXACT:Class_49', label? }
{ kind:'external', url, label? }
```

### 3b. Role records (physical/instantiation) re-anchor to term

- `material-spec`, `material-instance`, `material-lot`, `aliquot`, plus specific labware units and
  instrument/equipment instances: their `material_ref`/root reference **re-points to a `term` id**
  (`ref.kind:'record'`, `ref.type:'term'`). The physical hierarchy (concept→formulation→instance→aliquot)
  is unchanged; only the *root* changes identity namespace.
- Migration back-compat: a legacy `MAT-…` id still resolves because the record either (a) becomes a `term`
  with `kind:'material'` and keeps reading as `MAT-…` on the old store path, OR (b) gets a `term_ref`
  back-pointer so `term → MAT-…` and `MAT-… → term` both survive. Phase 3 selects one (recommend: turn
  concept-level `material` records into `term(kind:material)`; keep spec/instance/lot/aliquot as role
  records pointing at the term).

### 3c. Resolve spine tier 0 — alias-first term provider

- `termProvider` (source `canonical-term`) matches `aliases[]` FIRST (exact > prefix > substring over
  normalized aliases), then `preferredLabel`, outranking every remote tier. A lab alias beats OLS4 exact —
  the existing "prefer what the lab has" now extends to spelling variants.
- When the winning term `kind:material`/`vendor`/`labware`, the provider returns the linked physical
  record's `local:<recordId>` CURIE (or the term CURIE + a hint to follow `externalIds`) so deck-ghost
  and event-graph material_refs keep the shape they expect.
- The compiler's resolver (`compileResolver`) and `/api/resolve` share this one spine → one truth.

### 3d. AI grounding — confirm-once linkouts

- New `term` mentioned in free text: AI proposes `aliases[]` (spelling variants it sees) + a candidate
  `linkout` (ontology CURIE or vendor SKU). Human confirms ONCE (FoundryHumanReview-style). After that it's
  data — reused forever.
- No auto-mint of a bare-CURIE `MAT-…` record on first hit. Merging two terms on operator decision becomes
  a first-class operation (both keep their aliases; the loser's aliases fold into the winner, loser is
  marked `rejected`/`merged`).

### 3e. UI / interaction

- NL-first picker: type "f praaus" → one canonical `term` outranks vendor hits; aliases shown as chips;
  CURIE/vendor linkouts as badges (purple external, grey catalog), not editable identity fields.
- Slash menu (`/m`, `/s`, `/t`) stays ONLY in the protocol TapTap editor; resolves aliases → term via the
  spine with no author-facing change. Term editor surface exposes `aliases[]` + `linkouts[]` rows.

---

## 4. Step-by-step plan (TDD, bite-sized, staged & gated)

> Because this is a foundation migration, phases are ordered to keep the system green at every gate.
> Run tests from `server/` cwd (root `-w server` hits stale worktrees → phantom fails). Commit after each task.

### Phase 0 — Freeze identity contract + back-compat decision (gated, no code)
1. Write down the exact identity mapping table (namespace → becomes): MAT concept→`term(kind:material)`;
   VPR → `term(kind:vendor)`; LTD/LWD labware-definition → `term(kind:labware)`; INST/equipment-class →
   `term(kind:instrument)`; verb-definition / EXACT verbs → `term(kind:verb)`; material-spec/instance/lot/
   aliquot and specific labware units → role records re-pointed to term; message. Save to
   `docs/` + the plan.
2. Pick the legacy-id strategy for Phase 3 (recommended: concept-level MAT→term in place w/ alias back-ref).
3. **Gate:** confirm mapping table + legacy strategy with the user before Phase 1 (one round).

### Phase 1 — `term` record type (schema-first; TDD)
- **Files:**
  - Create `schema/core/term.schema.yaml` (JSON Schema 2020-12, `$ref` FAIRCommon,
    `unevaluatedProperties:false`, `kind` enum, `aliases[]`, `linkouts[]` union, `status` vocab lifecycle).
  - Create `schema/core/term.lint.yaml` (declarative: preferredLabel/alias non-empty, id pattern
    `^TERM-[a-z0-9-]+-[0-9a-z]{4}$`, dup-normalized-alias across terms fails, `linkouts[].kind` enum,
    `externalIds` must be `kind: record`).
  - Create `schema/core/term.ui.yaml` (form hints: aliases chip editor, linkouts row editor).
- **Steps:** write each schema; add Ajv all-schemas-load test asserting: valid term passes; alias-less
  term fails; dup normalized alias across two terms fails; bad linkouts.kind fails. Run
  `pnpm run test -w server` (from `server/`) + `pnpm run typecheck -w server`. Commit.

### Phase 2 — term minting + alias normalization (TDD)
- **Files:**
  - Modify `server/src/materials/termId.ts`: add `localTermIdForLabel(label)` reusing `labelSlug`+
    `labelHash` (e.g. `("F praaus") === ("FPRAUS")`, `("96-well plate")` distinct).
  - Create `server/src/terms/alias.ts`: `normalizeAlias(s)` (trim/lower/collapse non-alnum spans,
    retain `raw`), `aliasesEquivalent(a,b)`.
  - Create `server/src/terms/EnsureTerm.ts`: `ensureTermForLabel(store,label,kind)` mirroring
    `ensureLocalMaterialForDraft` (dedup by normalized alias; mint deterministic id).
- **Tests:** idempotency ("DMSO"/"dmso" same id); alias equivalence ("F praaus"/"FPRAUS"); EnsureTerm
  dedups by alias + reuses existing term. Commit.

### Phase 3 — Root-anchor migration (the big one; TDD, gated)
- **Files:**
  - New `server/src/terms/MigrateTerms.ts`: `migrateConceptRecordsToTerms(store)` — for each concept-level
    `material`/`vendor-product`/`labware-definition`/`instrument-definition`/`verb-definition` record,
    mint-or-reuse a `term(kind:X)` carrying the record's name + synonyms as aliases + its CURIE/SKU as
    `linkouts[]`, then re-point the material-spec/instance/lot/aliquot `material_ref` to the term id.
    Handle legacy refs (MAT-…→term alias back-ref) so nothing breaks.
  - Modify `server/src/materials/AddMaterialSupport.ts`,`MaterialGrounding.ts`,`bindOntologyMentions.ts`:
    mint/ground to a `term` (kind:material) instead of a bare `MAT-…`; keep emitting/modifying the
    material role records.
  - Modify `server/src/store/types.ts` + `RecordStoreImpl.ts` if a `root_ref`-aware read/back-compat path
    is needed (re-point resolution of legacy ids via term alias).
- **Steps (each gated on green tests):**
  1. migration CLI/script + dry-run over a fixture workspace (assert no orphaned refs, all re-pointed).
  2. Add a conformance test: every `material_ref`/root ref in migrated records targets a `term` id.
  3. Re-anchor `jsonld-index` facets/refs to term (upsert reads term as the primary row; physical records
     carry `term_ref`).
  4. Run full server tests + typecheck; a dedicated browser pass (browser-reviewer subagent) over the
     lab/material screens to confirm deck-ghost + event-graph material refs still render.
- **Gate:** after migration, run `grep -r "MAT-" records/` — legacy bare-MAT concept ids should be gone
  (only role records/material-instance may still reference namespace via term alias, by decision).
  Commit.

### Phase 4 — Resolve spine tier 0 (canonical-first; TDD)
- **Files:**
  - Modify `server/src/resolve/ResolveSpine.ts`: add `termProvider?`, tier 0 (source `canonical-term`),
    `TIER_BASE[0]`, extend `ResolveSource`.
  - Modify `server/src/resolve/compileResolver.ts` + its doc comment (alias-first).
  - Extend `server/src/resolve/types.ts`.
- **Tests:** `ResolveSpine.test.ts`: "f praaus" (alias) outranks remote exact; unknown→tier-5 mint;
  compiler resolver never emits tier-0-mint; alias beats label. Verify `curl /api/resolve?q=f%20praaus`
  → canonical term at tier 0. Commit.

### Phase 5 — AI grounding: CURIE/vendor as confirm-once linkouts (TDD)
- **Files:**
  - Modify `server/src/ai/mentions/bindOntologyMentions.ts` + `buildMaterialResolutions.ts`: no bare-CURIE
    MAT auto-mint on first hit; attach CURIE/SKU as **proposed `linkout`** on a `term`, require
    confirmation (`requiresReview:true`) — mirror existing `draftOnly` semantics.
  - Add term-merge operation (aliases fold, loser→`merged`/`rejected`) surfaced to Foundry during review.
  - Extend `runChatbotCompile` path wired in `AgentOrchestrator.ts`.
- **Tests:** F-praus fixture — "f praaus" and "FPRAUS" in different prompts resolve to same term after one
  confirmation; no bare-CURIE auto-mint before confirm; merge folds aliases + marks loser. Commit.

### Phase 6 — author-facing NL picker + alias/linkout capture (UI; TDD / browser)
- **Files:**
  - `app/src/shared/hooks/useResolveSearch.ts` — no consumer-contract change; tier-0 improves ranking.
  - `app/src/shared/ref/RefPicker.tsx` + `RefBadge.tsx` — show `term.preferredLabel`, alias chips as hint,
    linkout badges; CURIE shown as external badge not editable identity.
  - Term editor surface (aliases + linkouts rows) reusing FormBuilder/UI spec; protocol slash-menu
    resolves to terms unchanged for the author.
- **Verify (browser-reviewer subagent):** type "f praaus" → one canonical term above vendor hits, aliases
  shown, vendor linkout badge, deck ghosts existing local material. Visible in Brad's navigated state, not
  hidden-condition-only (memory). Commit.

### Phase 7 — Lint rules + docs + backfill (schema-first)
- **Files:**
  - `schema/core/term.lint.yaml`: dup-normalized-alias across terms fails; enforce ≥1 alias for
    `kind:organism|material`; linkouts.kind enum.
  - `docs/` — "canonical term spine & linkouts" note (identity-vs-linkout, aliases are data, B migration
    story, legacy MAT compatibility).
  - Optional backfill job to attach `term_ref` to existing physical records.
- **Verify:** full `pnpm run test` (server + app) + `pnpm run typecheck`; restart backend
  (`./start-app.sh` or `cd server && APP_BASE_PATH=.. npx tsx --watch src/server.ts`); run the
  F-prausnitzii browser pass end-to-end. Commit.

---

## 5. Components touched (the full list the migration reaches)

- **Id namespaces:** unified into TERM. Legacy MAT / VPR / LWD / INST / FORM / ALQ / LOT concept ids become
  term ids (with back-compat aliases). Physical/instantiation records keep their ids but re-anchor their
  root refs to term.
- **Schemas:** new `term.{schema,lint,ui}.yaml`; per-type `material.schema.yaml`,
  `vendor-product.schema.yaml`, `labware-definition.schema.yaml`, `instrument-definition.schema.yaml` get
  `unevaluatedProperties:false`-safe role handling (term kind stays canonical, per-type fields stay on
  role records when needed); `ref.schema.yaml` unchanged (two-kind union still works; `type:'term'` added
  as a valid record-ref type).
- **Server modules:** `termId.ts`, new `terms/{alias,EnsureTerm,MigrateTerms}.ts`, `resolve/ResolveSpine.ts`
  + `resolve/compileResolver.ts` + `resolve/types.ts`, `materials/{AddMaterialSupport,MaterialGrounding}.ts`,
  `ai/mentions/bindOntologyMentions.ts`, `ai/buildMaterialResolutions.ts`, `ai/AgentOrchestrator.ts` (wiring),
  `foundry/FoundryHumanReview.ts` (confirm-once + merge), `store/RecordStoreImpl.ts` + `store/types.ts`
  (back-compat read / root_ref), `jsonld-index/JsonLdIndex.ts` (re-anchor primary row + facets).
- **Frontend:** `ref/RefPicker.tsx`, `ref/RefBadge.tsx`, `hooks/useResolveSearch.ts`, `types/ref.ts`, term
  editor component, plus any material/editor pickers that show ids.
- **Index:** `jsonld-index` schema/migration (or full reindex) so `/browser` + slash-menu lookups hit
  terms + their linked physical records.

## 6. Tests / validation

- Unit: term schema (Ajv all-schemas, 4 assertions), alias normalization/idempotency, EnsureTerm dedup,
  spine tier-0 alias-vs-label-vs-remote, mint determinism, bindOntologyMentions F-praus + merge.
- Migration: dry-run CLI over fixture → assert zero orphaned refs, every root ref → term; conformance test
  for fully-migrated store; `grep` legacy bare-MAT concept ids absent.
- Integration: `curl /api/resolve?q=f%20praaus` → term at tier 0; `/browser` returns term + linked records.
- E2E/browser (browser-reviewer): NL picker ranks alias-local term above vendor; vendor linkout badge;
  deck ghosts local material; slash-menu in protocol editor resolves aliases.

## 7. Risks, tradeoffs, open questions

- **Highest risk = foundation refactor.** Staged + every gate green + back-compat alias path keeps the
  store green. Do NOT attempt as a single monolithic card; the migration (Phase 3) is the only place a
  full re-point + reindex happens, and it is dry-run-gated.
- **`unevaluatedProperties:false`:** every new field (kind, aliases, linkouts, term_ref, externalIds)
  must exist in `term.schema.yaml` (or the role schema) or Ajv rejects them. The known material-instance
  status bug is a live warning — `term` uses the **vocabulary** lifecycle only; physical records keep
  inventory lifecycle (available/…) and must NOT get `lifecycleId`/`provenance`.
- **`exactOptionalPropertyTypes:`** — optional `term_ref`/`linkouts`/alias: conditional spread / omit, never
  `undefined`.
- **Dual-id during migration:** back-compat alias is the bridge. Once migrated, prefer term; legacy aliases
  remain as data (they ARE aliases) — not a permanent separate namespace.
- **Term-merge correctness:** merging two terms is an operator decision; must fold aliases, keep linkouts,
  re-point role records, mark the loser — schema/lint-enforced, not free-text.
- **Effort reality check:** this is a multi-week, multi-gate effort (migration + spine + grounding + UI +
  index). It's warranted because the user chose correctness/future-proofing over A's lower risk. If scope
  must be reduced, the spine-tier-0 + term node (Phases 1–2, 4) deliver most of the synonymy win
  independent of the full Phase 3 migration — but the *single-id* guarantee requires the migration.
- **Open Qs to confirm in Phase 0 gate:** (1) which concept types become term kinds first (material+
  vendor+labware+instrument+verb, or scope-creep to kits/conditions); (2) the exact back-compat legacy
  strategy; (3) whether concept-level `material` records are rewritten-to-term or term-linked-with-backref
  (recommended: rewrite-to-term for new records, backref for legacy).