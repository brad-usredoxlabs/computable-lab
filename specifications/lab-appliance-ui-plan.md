# Lab Appliance UI — Implementation Plan

Status: Draft
Date: 2026-05-23
Authors: Brad (domain lead), Claude (architect)
Companion to: `specifications/lab-appliance-ui.md`
Related: `specifications/workflow-and-datatypes-manifesto.md`, `specifications/code-as-data.md`, `specifications/biology-compiler.md`

## 1. Purpose

`lab-appliance-ui.md` describes **what the appliance UI is**. This document describes **how we get there from where we are today**. It sequences the work, names the substrate that is missing, and fixes the decisions that have already been made so future contributors do not need to re-litigate them.

This plan is binding on `app/` and on the new server modules it calls out. It is not binding on the existing backend modules — schema, validation, lint, store, repo, compiler, foundry, extract, ingestion, ai, mcp — which are sufficient for the appliance and need no architectural change to support it.

## 2. Where We Are

The substrate is more mature than the UI suggests. A separate audit (in conversation) inventoried this in detail; the load-bearing facts are:

- **Backend is largely sufficient.** ~96 schemas across nine domains; the compiler emits the artifact targets the appliance needs (`pylabrobot`, `pyalab`, `opentrons_api`, plus `GeminiEmEmitter`, `QuantStudioEmitter`, `InstrumentApplianceJob`); the foundry, extraction, and ingestion pipelines are working; the MCP server exposes 44 tools including the external KBs (NCBI, UniProt, PDB, Reactome, ChEBI, PubChem, Europe PMC); `/api/ai/assist-stream` already routes by surface. The PRL boundary is clean — driver code lives in `../cl-appliance/`, not here.
- **The event-editor is the proven model.** `EventEditorShell` has the right shape: brand + endpoint-chip top bar, content stage, foot dock with AI dock and Fix-It launcher, dark-by-default via `data-theme`, scoped `--ee-*` tokens.
- **Three of the four endpoints exist as fragments.** `/browser` ≈ `RecordBrowser.tsx` + the legacy schema/records/registry/component-library/formulations/materials routes. `/protocols` ≈ `protocol-ide/` plus separate foundry status and jobs routes. `/literature` ≈ `LiteratureExplorer.tsx` plus `/ingestion`, `/extraction`, `/extraction/review`. None share a shell with the event-editor.
- **Three pieces of substrate are missing or partial.** A queryable JSON-LD index does not exist; the existing `server/src/jsonld/` module produces static representations. The TapTab editor uses TipTap as a container but renders form-style label+widget rows, not prose. The slash-command lookup (`/m /l /p /s /t`) is implemented in `ChatInput.tsx` only — not lifted to a shared extension and not mounted in TapTab.

## 3. Decisions Already Fixed

These are no longer open. They are recorded here so the plan does not appear to be choosing them in flight.

1. **`/browser` is 100% schema-driven.** No hardcoded route segments per record type. List columns, filters, and detail views are read from `*.ui.yaml`. Advanced search runs against a JSON-LD index over the entire record store.
2. **Tokens use the `--cl-*` namespace.** A hard rename. `--ee-*` is removed; no compatibility aliases. Done in Phase 0 to avoid two-name purgatory.
3. **No legacy URL redirects.** Old routes are deleted at cutover. Anyone with a bookmark gets a 404.
4. **AI threads are server-side per `(user, endpoint)`.** Stored under a transient server store (not committed to the records git tree). Survive reload and device switch. A "Promote to record" action turns a thread into a `conversation` record — first-class knowledge, searchable in `/browser`. Threads tied to compile passes that yielded accepted artifacts are auto-promoted with provenance.
5. **TapTab is prose-first.** A new `taptab.style: prose | form` flag in `*.ui.yaml` exists for the transition; default is `prose`. Form is the explicit opt-in, not the default.
6. **Slash menu is a shared TipTap extension.** Mounted in TapTab, AI chat, and any other rich-text input. Reads from the JSON-LD index. Source/target selections come from a generalized `SelectionContext`, not from `LabwareEditorContext` alone.
7. **JSON-LD index is in-process sqlite FTS5.** Single binary, no sidecar, fits the turnkey-box brief. If we outgrow it, swap is internal to the index module.

## 4. Sequencing

Work is sequenced so each phase produces something testable and shippable. Phases may overlap where dependencies allow, but the gates between them are real.

```
  Phase 0 ── Foundations
              ├── --cl-* tokens
              ├── AppShell extraction
              ├── AI thread server store + conversation schema
              └── SelectionContext generalization
                      │
                      ▼
  Phase 1 ── JSON-LD Index
              ├── projection generator
              ├── sqlite FTS5 store
              ├── background indexer
              └── /api/search/jsonld
                      │
              ┌───────┴───────┐
              ▼               ▼
  Phase 2 ── Shared Slash    Phase 3 ── /browser
              Menu Extension       (schema-driven, JSON-LD search)
              │                       │
              ▼                       │
  Phase 4 ── TapTab Prose             │
              Posture                 │
              │                       │
              └───────┬───────────────┘
                      ▼
  Phase 5 ── /protocols (unification)
                      │
                      ▼
  Phase 6 ── /literature (unification)
                      │
                      ▼
  Phase 7 ── Retirement (route deletion, settings to brand menu)
```

## 5. Phase 0 — Foundations

**Goal:** Make the chrome and substrate the other phases will compose against. No user-visible feature changes.

- **Tokens.** Lift `--ee-*` from `app/src/event-editor/styles/eventEditor.css` to `app/src/shared/styles/tokens.css` under the `--cl-*` name. Hard rename across all consumers. Delete `--ee-*`.
- **AppShell.** Extract the shell pattern from `EventEditorShell` into `app/src/shared/shell/AppShell.tsx`:
  - Slots: `brand`, `topbarMiddle` (endpoint-specific chips), `topbarRight` (theme toggle + four endpoint links + brand menu), `content`, `dock`, `fixItLauncher`.
  - Renders dark by default; `data-theme` switch is shell-level, not endpoint-level.
  - `EventEditorShell` becomes a thin caller of `AppShell` with its specific chips and dock.
- **AI thread server store.** New module `server/src/ai-threads/`:
  - File-per-thread under `var/ai-threads/{userId}/{endpoint}.json` (configurable root via env).
  - Read/write API: `GET/POST /api/ai/threads/:endpoint`, `POST /api/ai/threads/:endpoint/promote`.
  - Append-only writes with a snapshot rotation. Not git-committed.
- **`conversation` schema.** New `schema/knowledge/conversation.schema.yaml` + lint + ui. Fields: `endpoint`, `userId`, `messages[]`, `mentions[]`, `linkedArtifacts[]` (refs into records produced from this thread), `promotedAt`, `provenance`. The schema is what the promote action writes.
- **`SelectionContext`.** New context at `app/src/shared/context/SelectionContext.tsx`. Holds `source` and `target` selection state with a registration API so any endpoint can publish current selections (event-editor's well selections, `/browser`'s row selections, `/protocols`' candidate selections). `LabwareEditorContext` becomes a publisher into `SelectionContext`, not the source of truth.

**Done when:** Event-editor still works end-to-end on the new shell + tokens + selection context. All `--ee-*` references gone. AI thread roundtrip works in dev.

### 5a. What Phase 0 deliberately leaves to later phases

A few pieces named in §5 are intentionally not finished in Phase 0 because they have no consumer yet. They are listed here so they are not forgotten when the next phase starts.

- **Frontend AI thread client.** Server routes `GET/POST /api/ai/threads/:endpoint` and `POST .../promote` exist and are tested; no React client wraps them yet. **Picked up in Phase 2** (slash menu's chat input is the first consumer).
- **Topbar CSS re-scoped under `.cl-app`.** `EventEditorShell` still passes `rootClassName="event-editor"` so the existing `.event-editor .topbar*` selectors keep matching. **Picked up in Phase 3** when `/browser` ships its own AppShell instance and needs the same chrome.
- **Automatic thread promotion** on accepted compile artifacts. The promote endpoint exists; the auto-fire wiring does not. **Picked up in Phase 5** (foundry promotes a candidate → auto-promote the producing thread with `provenance.mode='automatic'` + `passId` + `linkedArtifacts`).
- **`WellSelectionContext` rename**, which happened in Phase 0 to free the `SelectionContext` name, is final — but the old per-plate well selector is still used by the legacy plate canvas. It will be retired naturally with the rest of the legacy graph editor in Phase 7.

## 6. Phase 1 — JSON-LD Index

**Goal:** A queryable index that `/browser` advanced search and the shared slash menu both target.

- **Projection generator.** Extend `server/src/jsonld/` with `JsonLdProjector` that emits a flat, index-friendly JSON-LD document per record: `@id`, `@type`, denormalized refs (resolved to label + id), full string content concatenated for full-text, plus a stable set of facet fields per schema (driven by `*.ui.yaml`'s existing column hints, with explicit `facet: true` opt-in for fields that should be facetable).
- **sqlite FTS5 store.** New module `server/src/jsonld-index/`:
  - `index.sqlite` under the same app base path as records.
  - One FTS5 virtual table over the full-text projection; one regular table for `@type`/`@id`/facets, joined on rowid.
  - Schema-versioned with a migration helper.
- **Background indexer.** Hooks into `RecordStoreImpl` write events. On record write: re-project, upsert; on delete: tombstone. A `reindex` admin endpoint forces a full rebuild from git.
- **Search API.** New route `POST /api/search/jsonld` with a small query DSL:
  - `q`: full-text string
  - `type`: one or many `@type`
  - `facets`: `{field: value | [values]}`
  - `refs`: filter by record IDs referenced
  - `limit`, `cursor`
  - Response: `{hits: [{id, type, label, snippet, facets}], total, facetCounts, nextCursor}`
- **Client.** New `app/src/shared/api/jsonLdSearchClient.ts` method, typed by the same DSL.

**Done when:** A cold reindex over the current `records/` finishes in under 30 seconds on the appliance class hardware. A query like `{type: ['material'], q: 'tris', facets: {pH: '<4'}}` returns hits with snippets and facet counts.

## 7. Phase 2 — Shared Slash Menu Extension

**Goal:** Lift the existing slash menu out of `ChatInput.tsx` into a reusable TipTap extension targeting the JSON-LD index.

- **Extension.** New `app/src/shared/taptab/slashMenu/`:
  - TipTap Suggestion-plugin-based extension.
  - Command registry — initially `material, labware, protocol, source, target` plus their aliases, with room to grow (every schema can register if its `*.ui.yaml` declares a `slashCommand` shorthand).
  - Renders the same badge-colored chip UI the AI chat uses today.
  - Emits the existing `[[kind:id|label]]` mention tokens — no server-side parser change.
  - Source/target read from `SelectionContext` (Phase 0), not from `LabwareEditorContext` directly.
- **AI chat migration.** `ChatInput.tsx` adopts the new extension. The inline detection/menu logic is removed in the same commit.
- **AI thread client (deferred from Phase 0).** New `app/src/shared/api/aiThreadClient.ts` wraps `GET/POST /api/ai/threads/:endpoint` and `POST .../promote`. `ChatInput.tsx`'s message log persists through this client instead of in-memory state, so reloads keep the conversation.
- **Mention rendering.** Mentions render as inline pills in TapTab and AI chat; on click, navigate to the record in `/browser` (deferred to Phase 3 — until then, they navigate to legacy routes).

**Done when:** Slash commands work identically in AI chat as today, plus in any TipTap surface that opts in. The inline implementation in `ChatInput.tsx` is deleted. AI chat messages survive a page reload via the AI thread client.

### 7a. What Phase 2 deliberately leaves to later phases

The slash menu, the mention node, and the AI thread client all shipped fully in Phase 2. A few wire-ups have no consumer until the relevant endpoint exists and were intentionally postponed:

- **Mention click navigation to `/browser`.** Mention pills render in both TapTab and AI chat but clicking them does nothing today — `/browser` does not exist yet. **Picked up in Phase 3**: when `/browser` lands, the mention node gains an `onClick` that dispatches to the router with the record id pre-selected (`/browser?id=…`).
- **Assistant + tool message persistence in `useAiChat`.** Today the hook persists user and final assistant messages. Streaming partials, tool messages, and structured fields (preview events, labware additions, clarifications) are not yet sent to `/api/ai/threads/:endpoint`. **Picked up in Phase 5**: the `/protocols` AI dock needs the structured shape on the wire so promoted threads carry the full conversation, including tool calls. The conversation schema (Phase 0) accepts these fields; the persistence path just needs to forward them.
- **EventEditorAiDock thread persistence.** The event-editor's bespoke AI dock keeps messages in memory only — it does not use `useAiChat` today. **Picked up in Phase 5** when `/protocols`'s dock and the event-editor's dock both consume the shared hook with their respective endpoint identifiers; the dock is the natural place to retire the bespoke state.

These are the *last* deferred items in the slash-menu / chat-persistence story. Phase 3 onward extends the substrate but does not need to re-litigate the wire format.

## 8. Phase 3 — `/browser`

**Goal:** One schema-driven destination for everything that has ever been recorded, with advanced JSON-LD search.

- **Shell.** Mounted under `AppShell` with endpoint-scoped AI dock. Top-bar middle chips: type filter, saved-view selector, facet toggle.
- **Topbar CSS re-scoping (deferred from Phase 0).** Move `.event-editor .topbar*` selectors in `eventEditor.css` up to `.cl-app .topbar*` in a new `app/src/shared/shell/AppShell.css`, so `/browser` (and the other new endpoints) get the chrome styling without copying `rootClassName="event-editor"`. Drop the `rootClassName="event-editor"` from `EventEditorShell` in the same commit; the `.event-editor` class then scopes only deck/lawn/dock CSS, which is its actual responsibility.
- **Layout.** Three regions:
  - **Sidebar.** Schema tree (driven by the SchemaRegistry, grouped by domain). Selecting a type narrows results to that `@type`.
  - **Results.** Table with columns from the selected schema's `*.ui.yaml`. Sort, paginate, multi-select. Search bar above the table accepts the JSON-LD query DSL in a human syntax: `pH:<4 type:material vendor:"Sigma"`. Saved views persist to the user's record (a new `saved-view` schema, optional in this phase).
  - **Detail.** When a row is selected: form view from `FormBuilder` against the same `*.ui.yaml`. Edit-in-place — no separate edit route.
- **No hardcoded type routes.** `/browser` has one route. Type, query, and selection are URL search params (`?type=material&q=tris&id=mat-1234`) so deep links are stable.
- **AI dock.** Scoped to the knowledge layer. Answers semantic questions over the JSON-LD index. Mentions resolved into the dock query the same way as elsewhere. Backed by the AI thread client introduced in Phase 2.
- **Mention click navigation (deferred from Phase 2).** The `slashMention` node gains an `onClick` that pushes `/browser?id=<recordId>` onto the router (and selects the corresponding type so the detail pane is in scope). Both TapTab and AI chat pills benefit automatically since the node is shared.
- **What folds in.** `SchemaList`, `RecordList`, `RecordViewer`, `RawRecordEditor`, `RecordRegistryPage`, `ComponentLibraryPage`, `FormulationsPage`, `MaterialsPage`, `RecordBrowser` — all collapse into `/browser`. The components are kept where they are reusable inside `/browser`'s panels; the routes are deleted in Phase 7.

**Done when:** Every record type is reachable from `/browser` with no per-type code. JSON-LD advanced search returns correct results. A user can sort by any column declared in `*.ui.yaml`, filter by any facet, and edit a record in the detail pane.

## 9. Phase 4 — TapTab Prose Posture

**Goal:** TapTab reads like a document, not a form. Mount it as the primary authoring surface beyond the record editor.

- **NodeView rework.** `FieldRow` becomes an *inline* TipTap node, not a block label+widget. The rendered template is a single line of prose with the widget rendered inline; the schema's `label` becomes a tooltip / focus affordance, not a stacked `<span>`. `Section` and `SectionHeading` render as proper heading nodes in the document flow.
- **`taptab.style` flag.** New optional field in `*.ui.yaml`: `taptab.style: prose | form`. Default `prose`. Existing UI specs that benefit from the form layout (e.g., dense reference data entry) opt in explicitly with `form`.
- **Document chrome.** `DocumentShell` gets the look of a writing surface: centered column, generous leading, no field gridlines. Help text moves to inline hover or a margin annotation, never a stacked sibling.
- **Slash menu mounted.** Phase 2's shared extension is enabled in TapTab. `/m /l /p /s /t` work inline while authoring.
- **Mount points.** TapTab becomes the editor in `/protocols` (Phase 5) for protocol prose, and remains the editor for record edit-in-place inside `/browser`. The event-editor does not adopt TapTab in this phase — the deck stage stays as it is.

**Done when:** A protocol record opened in TapTab reads as a document. Editing any field, including refs and arrays, is in-line. Slash commands insert mentions. The form-style stack only appears for schemas that opt in with `taptab.style: form`.

### 9a. What Phase 4 deliberately leaves to later phases

Phase 4 shipped the prose default, the `taptab.style` flag, the slash-menu mount inside TapTab, and the audit of dense schemas. One follow-up is intentionally deferred:

- **Slash-menu lint warnings.** Mentions inserted via `/m /l /p` land inside TapTab text fields, but the lint engine does not yet check that the *kind* of the mention is admissible for the slot. A `/m material` token dropped into a slot whose schema expects a `labware` ref is accepted silently today. **Picked up in Phase 5**, where `/protocols` makes mentions load-bearing for the compiler: the lint engine extends with a `mention-kind-matches-slot` predicate, fed by the new mention-aware slot metadata already produced by the projector. Same wire format, same node — only the validator changes.

Also recorded for visibility: Phase 4 took the pragmatic visual interpretation of "FieldRow becomes an inline TipTap node" — it stays a block atom in the ProseMirror model but renders inline-flow via CSS, so `serializeDocument` / `documentMapper` and their tests stay valid unchanged. A future phase that genuinely needs text wrapping *around* widgets in a paragraph would restructure `Section.content` to include paragraph nodes; nothing in Phase 5–7 forces that, but the door is open.

## 10. Phase 5 — `/protocols`

**Goal:** One destination for protocol authoring, compilation, and library management.

- **Shell.** `AppShell` with bridge-scoped AI dock and Fix-It launcher.
- **Facets** (URL search params, not routes):
  - `view=ide` — TapTab-backed protocol authoring with the compile/diagnostics rail.
  - `view=foundry` — foundry status, recommendations, quality verdicts.
  - `view=jobs` — acquisition jobs panel.
  - `view=candidates` — candidate review (variants awaiting selection).
- **Sub-components** (`ProtocolIdeShell`, `FoundryStatusPanel`, `FoundryAcquisitionJobsPanel`, `ProtocolIdeCandidateReviewPanel`) move into `app/src/protocols/` and become panels of `/protocols`, not routes.
- **AI dock.** Bridge-scoped. Proposes drafts, compiles, surfaces diagnostics, suggests fixes. Mentions resolve via the shared slash menu. Thread persisted via the AI thread client.
- **Fix-It launcher.** Visible whenever a compilable artifact is in scope. Same launcher as the event-editor's.
- **Automatic thread promotion (deferred from Phase 0).** When the foundry promotes a candidate (a compile pass that yields an accepted artifact), fire `POST /api/ai/threads/protocols/promote` server-side with `provenance.mode='automatic'`, the `passId`, and the artifact ref in `linkedArtifacts`. The thread that produced the artifact becomes a citable `conversation` record alongside it. The same hook fires from `/literature` (Phase 6) for accepted extractions.
- **Full-shape thread persistence (deferred from Phase 2).** Extend `useAiChat` so streaming partials, tool messages, preview events, labware additions, and clarifications all reach `/api/ai/threads/:endpoint`. Promoted `conversation` records (Phase 0 schema) need this to carry the *complete* trace, not just the user/assistant text. The shape on the wire stays the same; only the persistence-side filter loosens.
- **EventEditorAiDock unification (deferred from Phase 2).** The event-editor's bespoke dock retires its in-memory message state and adopts `useAiChat` with `endpoint: 'event-editor'`. The `/protocols` dock does the same with `endpoint: 'protocols'`. Both docks share the same chat primitives going forward; the surface-specific behaviour (deck-aware previews, fix-it launcher) stays where it is.
- **Slash-menu lint warnings (deferred from Phase 4).** Mentions are load-bearing for protocol compilation, so the lint engine grows a `mention-kind-matches-slot` predicate that fires when a TapTab slot's mention kind disagrees with the slot's schema-declared expectation (e.g. `/m material` dropped into a `labware`-typed slot). The projector already emits per-slot kind metadata; lint reads it. No wire-format change — only the validator pass is new.

**Done when:** Authoring, compiling, reviewing variants, and watching foundry jobs all happen inside `/protocols` with one shell and one AI dock. The four legacy routes (`/protocol-ide`, `/protocol-ide/:sessionId`, `/protocol-ide/foundry/status`, `/protocol-ide/foundry/jobs`) are unreachable except as facets. Promoting a candidate auto-promotes the originating thread.

### 10a. What Phase 5 deliberately leaves to later phases

Phase 5 delivered the shell, all four facets, the AI dock, the legacy-route retirement, the candidate auto-promote hook, and full-shape thread persistence (the `metadata` field on `messages[]` in the `conversation` schema). Two carry-overs remain:

- **EventEditorAiDock unification (still deferred from Phase 2).** The event-editor's dock still owns ~100+ lines of bespoke stateful logic (preview events, labware additions, fix-it seed) and does not yet use `useAiChat({ endpoint: 'event-editor' })`. The migration is mostly mechanical but needs care so the deck-aware preview semantics survive intact. **Picked up in Phase 7** as part of the retirement cleanup pass — the in-memory dock state is in essence legacy code that the shared chat primitives replace.
- **Slash-menu lint warnings (still deferred from Phase 4).** Needs a new `mention-kind-matches-slot` predicate in `PredicateEvaluator`, projector slot metadata extended with a `mentionKind` hint, and a server-side lint pass that walks payloads for `[[kind:id|label]]` tokens. **Picked up in Phase 6** where ingestion-extracted records first start carrying mentions across the validation boundary — the literature curator is the natural first consumer of the warning.

These are the last carry-overs from the earlier phases. Phase 6 and Phase 7 collectively close them out.

## 11. Phase 6 — `/literature`

**Goal:** One funnel from upstream prose to structured knowledge.

- **Shell.** `AppShell` with intake-scoped AI dock.
- **Facets:**
  - `view=explore` — literature search (Europe PMC, NCBI, internal SOPs) and PDF intake.
  - `view=ingest` — pipeline status, in-flight jobs, candidate queue.
  - `view=drafts` — extraction drafts list.
  - `view=review` — curator approval of a single draft, side-by-side prose + candidate YAML.
- **Sub-components** (`LiteratureExplorer`, `IngestionPage`, `ExtractionDraftsListPage`, `ExtractionReviewPage`) move into `app/src/literature/` and become panels.
- **AI dock.** Intake-scoped. Reads prose, proposes extractions, flags ambiguity. Never silently invents certainty. Thread persisted via the AI thread client; accepted extraction promotions also auto-promote the originating thread (the same hook as Phase 5).
- **Slash-menu lint warnings (deferred from Phase 4 → Phase 5).** Add a `mention-kind-matches-slot` predicate to `PredicateEvaluator` and a lint pass that walks payload text for `[[kind:id|label]]` tokens and validates each against the projector's per-slot `mentionKind` (added to the projection in this phase). Curator surfaces the warnings in the review pane: a mismatched mention shows as a lint diagnostic alongside structural validation errors. No wire-format change.

**Done when:** A curator can load a PDF, watch extraction run, review candidates, and promote to records without leaving `/literature`. The four legacy routes (`/literature`, `/ingestion`, `/extraction`, `/extraction/review/:recordId`) are unreachable except as facets.

## 12. Phase 7 — Retirement

**Goal:** Remove the legacy chrome and routes. No transitional aliases, no redirects.

- **Delete.** `/schemas`, `/schemas/:schemaId/records`, `/records/:recordId`, `/records/:recordId/edit`, `/new`, `/labware-editor`, `/labware-test`, `/runs/:runId`, `/runs/:runId/editor`, `/runs/:runId/editor/:mode`, `/registry`, `/component-library`, `/formulations`, `/materials`, `/literature` (replaced as facet), `/ingestion`, `/extraction`, `/extraction/review/:recordId`, `/protocol-ide`, `/protocol-ide/:sessionId`, `/protocol-ide/foundry/status`, `/protocol-ide/foundry/jobs`.
- **Keep.** `/browser`, `/event-editor`, `/protocols`, `/literature`, `/event-editor/fixit`. Plus `/runs/:runId/event-editor` as a deep-link into the event-editor.
- **Settings.** Moves out of nav. `/settings` is retained as an off-nav support route rendered inside `AppShell`; the brand menu (top-left brand click) is the only visible entry point and also exposes About and Theme. This keeps deep links and browser-back behavior without making settings an endpoint.
- **Layout.** `app/src/shell/Layout.tsx` is deleted. Everything goes through `AppShell`.
- **EventEditorAiDock unification (deferred from Phase 2 → Phase 5).** The event-editor's dock retires its in-memory message state in favour of `useAiChat({ endpoint: 'event-editor' })`. Surface-specific behaviour (deck-aware previews, fix-it seed, dock mode toggle) stays where it is; only the message log + persistence migrate to the shared hook. With this change every endpoint's AI dock runs the same primitives — the appliance has one chat path, not two.

**Done when:** `App.tsx` exposes the four endpoints plus support routes for `/settings`, `/event-editor/fixit`, and `/runs/:runId/event-editor`. The brand menu is the only visible way to reach settings. The nav exposes exactly the four endpoints; Theme lives in the brand menu. Layout.tsx is gone.

## 13. Tests

Each phase carries its own gate. Minimum bars:

- **Phase 0.** Existing event-editor unit + e2e tests pass on `AppShell` and `--cl-*`. New tests for the AI thread store and `SelectionContext`.
- **Phase 1.** Indexer round-trip tests (write record → query returns it). Query DSL parsing tests. A perf test that asserts the cold-reindex budget.
- **Phase 2.** Slash menu unit tests in isolation. AI chat e2e test that still passes after the migration. A new TapTab e2e test that drives `/m → select material` end-to-end.
- **Phase 3.** `/browser` e2e covering: type filter, advanced search, edit-in-place, AI dock query, mention navigation. No `/browser/material`-style routes anywhere.
- **Phase 4.** A TapTab e2e on a `taptab.style: prose` schema that verifies the rendered DOM has no `<label>` siblings to widgets. A second e2e on a `taptab.style: form` schema that asserts the opt-in still renders as form.
- **Phase 5.** A `/protocols` e2e that authors a protocol, triggers compile, reviews a candidate, and watches a foundry job — all in one route.
- **Phase 6.** A `/literature` e2e that uploads a PDF, runs extraction, reviews a draft, and promotes it to a record — all in one route.
- **Phase 7.** A nav e2e that asserts exactly four endpoint links and no settings link. A settings e2e that reaches `/settings` from the brand menu. A 404 e2e for each deleted route — explicit, not a redirect.

## 14. Risks and Open Items

- **Indexer performance on real data.** The 30-second cold reindex budget in Phase 1 is a guess against the current records corpus. If it exceeds, the answer is incremental indexing, not a different store — sqlite FTS5 stays.
- **TapTab prose styling cost.** Phase 4 is mostly CSS + NodeView templates, but the schemas that benefit from `taptab.style: form` need to be identified one by one. Worth a separate audit before Phase 4 starts so the prose default is not painful for dense schemas.
- **AI thread snapshot growth.** Append-only logs grow. Phase 0 ships with rotation thresholds set generously; revisit once we have weeks of real usage.
- **`SelectionContext` reach.** Generalizing source/target across endpoints is straightforward in the event-editor; `/browser` and `/protocols` need to decide what counts as a "selection" in their context. Decisions go into Phases 3 and 5 respectively, not earlier.
- **Conversation schema fields.** Phase 0 ships a minimal schema; promotion provenance and `linkedArtifacts` may need expansion once Phases 5 and 6 are real.

## 15. Stability Promise

This plan describes **how we build the appliance UI**. Phase boundaries and decision records are stable. The exact ordering of work *within* a phase, the names of new modules, and the precise field set of the new schemas may evolve. The seven-phase shape and the seven fixed decisions in §3 are stable.
