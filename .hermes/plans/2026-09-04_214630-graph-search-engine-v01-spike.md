# Graph Search Engine — v0.1 Spike Implementation Plan

> **For Hermes:** Implement task-by-task (TDD). Each task is a 2–5 min bounded
> unit with its own test + commit. Run tests from `server/` and `app/` cwds
> (NOT root `-w server` — that hits stale `.worktrees` phantom failures).

**Spec:** `specs/graph-search.md` (untracked, in the main checkout
`/home/brad/git/computable-lab/specs/graph-search.md`). This plan implements the
**§30 "Immediate Engineering Deliverables" spike** that proves the central
concept end-to-end:

```
Natural-language Find → structured graph query → graph execution →
plate/table results → user selects objects → AI receives canonical selection →
AI proposes event graph → existing compiler validates it
```

**Goal:** A single read-oriented graph query layer (GraphQueryService) served
through one HTTP route, one MCP tool set, and one Find UI, running over the
existing record store + JSON-LD index.

**Architecture:** Reuse the existing substrate rather than build a graph DB.
`JsonLdIndex` (sqlite FTS5, `server/src/jsonld-index/`) is already a record
index with `getRefs()` (a traversal primitive). `relationship` records
(`schema/knowledge/relationship.schema.yaml`) are first-class typed edges.
But wells/measurements/treatments are **not** first-class records — they nest
inside `event-graph` records and `plate-snapshot` records. The spike therefore
adds one **event-graph → canonical graph projector** that flattens those nested
events into queryable well/measurement/treatment nodes with synthetic stable
IDs and provenance pointers back to the owning record + event.

**Tech Stack:** TypeScript (server Fastify + app React/Vite), zod, better-sqlite3
(existing), `@modelcontextprotocol/sdk`, existing `dualRegister` MCP helper.

---

## Key Findings from Codebase Exploration (grounding this plan)

- **Graph substrate already exists:** `JsonLdIndex` (`server/src/jsonld-index/`)
  is an in-process sqlite FTS5 index over a JSON-LD projection of every record.
  It exposes `query(JsonLdQuery)` (full-text, `type`, `facets`, `refs`,
  paging via cursor) and `getRefs(recordIds)` → `Map<src, [{recordId,kind}]>`.
  `JsonLdProjector` (`server/src/jsonld/JsonLdProjector.ts`) produces the
  indexable docs. Wired into `RecordStore` via a write hook (`RecordStoreWriteHook`).
- **Search API already exists:** `server/src/api/handlers/JsonLdSearchHandlers.ts`
  → `POST /api/search/jsonld`, `/reindex`, `/projects` (with a 4-hop hierarchy
  walker). Registered in `server/src/api/routes.ts` as optional `jsonLdSearchHandlers`.
- **Typed edges exist:** `schema/knowledge/relationship.schema.yaml` is a
  first-class `relationship` record: `{sourceType, sourceId, targetType, targetId, verb, provenance}`.
  Verbs include `tests, supports, contradicts, performed_by, uses, operates, investigates, references`.
- **resolve() exists:** `server/src/resolve/` + MCP tool `resolve` already walks
  records → ontologies → vendor → mint. Reuse for §5.1.
- **MCP infra is mature:** `createMcpServer` (`server/src/mcp/McpServerFactory.ts`),
  `registerAllTools` aggregator (`server/src/mcp/tools/index.ts`), and the
  `dualRegister(server, registry, name, desc, zodShape, handler)` helper
  (`server/src/mcp/tools/dualRegister.ts`) registering each tool on both the MCP
  server and the AI ToolRegistry. Response helpers `jsonResult`/`errorResult`
  in `server/src/mcp/helpers.ts`.
- **RecordStore CRUD:** `get(recordId)`, `getByPath`, `list(RecordFilter`
  `{kind, schemaId, idPrefix, limit, offset}`, `exists`, `create/update/delete`.
  `server/src/store/types.ts`.
- **AppContext** (`server/src/server.ts:197`) already carries `store`,
  `indexManager`, `jsonLdIndex`, `jsonLdProjector`, `authorizationService`,
  `predicateRegistry`, `uiSpecLoader`, `resolve spine` access.
- **CONSTRAINT:** wells/samples/measurements are derived by flattening
  `event-graph` records (`schema/workflow/event-graph.schema.yaml`:
  `events[]` with `event_type` incl. `add_material`, `transfer`, `read`;
  `details.wells`, `details.material`, `details.channel`, `details.value`…)
  and `plate-snapshot` records. They are not stored as individual records.
- **UI:** single-pane shell; reuse `app/src/event-editor/focus/WellGrid.tsx`
  (plate/well grid with `selectedWellIds`, `previewWellIds`, `compositionStyles`)
  for the plate result view. `app/src/shared/api/client.ts` is the API client.
  Routes in `app/src/App.tsx` with lazy `Route`.

---

## Design: Canonical Graph Query Layer

### New module: `server/src/graph-query/`

```
graph-query/
  types.ts            # GraphQuery, GraphResult, GraphNode, GraphEdge, collection/selection types
  schema.ts           # zod mirrors of the YAML GraphQuery/GraphResult schemas
  GraphProjector.ts   # event-graph + plate-snapshot → well/measurement/treatment node projection
  GraphEdgeIndex.ts   # sqlite adjacency (UP/DOWN) over refs + relationship records + projected edges
  GraphQueryEngine.ts # resolve/get/find/traverse/path/neighborhood/lineage/aggregate/exists
  GraphResultSerde.ts # envelope builder + explain
  GraphValidation.ts  # structured repair errors (invalid_type/relationship/field/…)
  CollectionService.ts# ephemeral collection:xxx / selection:xxx handles (in-memory + sqlite)
  index.ts            # barrel + createGraphQueryFromContext(ctx)
```

### Graph object model

A **GraphNode** is any addressable thing: a record (material, instrument, run,
plate-snapshot, claim, evidence, relationship, ...) **or** a projected
well/measurement/treatment node derived from an event-graph. Every node has a
stable `id` and a `provenance` pointing back to the source record + path.

```
GraphNode {
  id: string                    // e.g. "MAT-000123", or synthetic "well:EVG-abcd:W-A1:plate:plate1"
  type: string                  // record kind or "well" | "measurement" | "treatment"
  label: string
  properties: Record<string, unknown>
  source: { recordId: string; path?: string; eventId?: string }  // provenance
}
```

An **edge** has a directed `sourceId --verb--> targetId`. Edges come from three
sources fused into one adjacency store:
1. record `refs` (the JSON-LD `record_refs` table — already extracted),
2. `relationship` records (typed first-class edges),
3. projected event edges (plot well → measurement, well → treatment).

### Result envelope (`GraphResult`)

```
{
  query_id, result_type: object|collection|subgraph|path|aggregate|scalar|boolean,
  objects: GraphNode[], relationships: Edge[], provenance: nodeId[],
  summary: { count },  explain?: string,  nextCursor?
}
```

### Query (`GraphQuery`) — structured, domain-oriented

```ts
type GraphQuery =
  | { op: 'resolve'; term: string; type?: string; scope?: Scope; limit?: number }
  | { op: 'get'; objectId: string; fields?: string[] }
  | { op: 'find'; type: string; where: Condition[]; scope?: Scope; limit?: number; order?: ... }
  | { op: 'traverse'; start: string|string[]; relationship: string; direction?: 'out'|'in'; depth?: number; targetType?: string; limit?: number }
  | { op: 'path'; from: string; to: string; relationshipTypes?: string[]; maxDepth?: number }
  | { op: 'neighborhood'; objects: string[]; depth: number; relationshipTypes?: string[]; limits?: {...} }
  | { op: 'lineage'; object: string; direction: 'up'|'down'; depth?: number }
  | { op: 'aggregate'; query: {op:'find';...}; groupBy?: string; measures: Measure[] }
  | { op: 'exists'; query: {op:'find';...} }
```

Conditions: `{field, operator: '='|'!='|'>'|'>='|'<'|'<='|'contains'|'in', value}` where
`field` supports dotted paths (`treatment.name`) resolved on projected nodes.

`Scope` = `{type:'Run'|'Experiment'|'Study'|'Plate'|'well'|..., id}` and
(optionally) a time interval. §8.

### Validation & repair (§17)

`GraphValidation.validate(query)` returns zone.zero `ZodError`-style structured
errors: `invalid_type`, `invalid_relationship`, `invalid_field`,
`operator_compatibility`, `invalid_scope`, `resource_limit`. Each includes the
offending element plus `allowed_*` where applicable so an agent can self-repair.

---

## Phased Decomposition (spike)

Phases 0–4 are backend and independently testable. Phase 5 is the API/MCP
surface. Phase 6 is the UI. Phase 7 binds the selection→AI loop and is the
end-to-end proof of the spec.

### Phase 0 — GraphQuery & GraphResult schemas (data first)

Schemas are data per repo rule. Two YAML schemas + zod mirrors.

**Files:**
- Create: `schema/query/graph-query.schema.yaml` (draft 2020-12; `$defs` for
  `FindQuery`, `TraverseQuery`, `Condition`, `Scope`, `Measure`, `AggregateQuery`).
- Create: `schema/query/graph-result.schema.yaml` (`GraphResult` envelope;
  `$defs` for `Node`, `Edge`, `ProvenanceEntry`, `Aggregate`).
- Create: `server/src/graph-query/schema.ts` — zod schemas (`GraphQuerySchema`,
  `GraphResultSchema`) used for MCP tool input validation and runtime guards.
- Create: `server/src/graph-query/types.ts` — TS interfaces mirroring both.
- Test: `server/src/graph-query/schema.test.ts`.

**Steps:**
1. Author `graph-query.schema.yaml` + `graph-result.schema.yaml`.
2. Author `zod` mirrors in `schema.ts`.
3. Test: `loadAllSchemas({basePath: 'schema', recursive:true})` — assert both
   schemas load and validate (`server/src/schema/GraphQuerySchema.test.ts`,
   following `PlateEventSchemaContracts.test.ts` pattern). Expected PASS.
4. Zod round-trip test: `GraphQuerySchema.parse({op:'find', type:'well',
   where:[{field:'treatment.name', operator:'=', value:'rotenone'}]})` → PASS;
   invalid op → structured error.
5. Commit: `feat(schema): GraphQuery and GraphResult canonical schemas`.

### Phase 1 — GraphProjector (event-graph → nodes/edges)

Flattens `event-graph` and `plate-snapshot` records into well/measurement/
treatment nodes + edges. This is what makes "wells treated with rotenone" and
"FITC measurement" queryable.

**Files:**
- Create: `server/src/graph-query/GraphProjector.ts`.
- Test: `server/src/graph-query/GraphProjector.test.ts`, plus a fixture event-graph.

**Steps:**
1. **Write failing test** `projectEventGraph(evg, labwareId)` given a small
   event-graph with one `add_material` (material "rotenone" → wells A1–A5) and
   one `read` (channel "FITC" → wells A1–A5, numeric values).
   Expect: 5 `treatment` nodes + 5 `measurement` nodes + edges
   `well:...:A1 --treated_with--> treatment`, `well --read_by/channel--> measurement`,
   with `source.recordId === evg.recordId` provenance. First expect FAIL.
2. Implement `GraphProjector`: iterate `evg.events[]`, dispatch on `event_type`:
   - `add_material`/`transfer` → for each well in `details.wells`, a
     `treatment` node (material = `details.material` label/ref), edge
     `well --treated_with--> treatment`.
   - `read` → per well a `measurement` node (`details.channel`, `details.value`,
     `details.value_type`), edge `well --measured_at--> measurement`.
   - Keep a `well → labware` map from `evg.labwares[]` addressing.
3. Run test → PASS.
4. Commit: `feat(graph-query): event-graph → well/measurement/treatment projector`.

### Phase 2 — GraphEdgeIndex (adjacency over refs + relationships + projections)

**Files:**
- Create: `server/src/graph-query/GraphEdgeIndex.ts` — builds/reuses a
  better-sqlite3 adjacency table (`graph_edges`:
  `source, verb, target, source_kind, target_kind, provenance`), populated from
  (a) `jsonLdIndex` `record_refs` (via `index.getRefs` — need a bulk reverse passthrough),
  (b) `relationship` records, (c) `GraphProjector` output.
- Create: `server/src/graph-query/GraphEdgeIndex.build.ts` — `build(ctx)` from
  `store.list()` + projector; idempotent rebuild.
- Test: `server/src/graph-query/GraphEdgeIndex.test.ts`.

**Steps:**
1. **Write failing test:** seed a run + relationship records + one event-graph,
   build index, assert `out("run:1")` and `in("material:X")` return correct
   `{target, verb, kind}` and direction filtering works. Expect FAIL.
2. Implement `GraphEdgeIndex` with `out(id)`, `in(id)`, `both(id)`, `pathBFS(from,to,maxDepth)`.
3. Implement reverse-ref passthrough: extend `JsonLdIndex` with a
   `getReverseRefs(targetIds)` (SQL over `record_refs`) — small additive method
   in `server/src/jsonld-index/JsonLdIndex.ts`.
4. Run test → PASS.
5. Commit: `feat(graph-query): adjacency index over refs + relationships + projections`.

### Phase 3 — GraphQueryEngine (the core primitives)

**Files:**
- Create: `server/src/graph-query/GraphQueryEngine.ts`.
- Create: `server/src/graph-query/GraphResultSerde.ts` (envelope + `explain`).
- Create: `server/src/graph-query/GraphValidation.ts` (structured repair errors).
- Test: `server/src/graph-query/GraphQueryEngine.test.ts`
  (one test per §5 primitive), `GraphValidation.test.ts`.

**Steps (each primitive TDD'd separately):**
1. **resolve** — delegate to `createResolveSpineFromContext(ctx)` (`server/src/resolve/`),
   map `RankedCandidate[]` → GraphNode[]. Test: term "rotenone" returns a
   material node.
2. **get** — `store.get(objectId)` → GraphNode (record) or lookup in the
   projected node store for synthetic ids. Test: well/record get.
3. **find** — `store.list(RecordFilter{kind})` + field-path filter over nodes +
   scope apply (§8 scope via `links.runId/experimentId/studyId` on records).
   Test: `find wells where treatment.name=rotenone` returns projected wells
   (scope appplied), plus a record-kinds find (`find material`).
4. **traverse** — `GraphEdgeIndex.out/in` from start, optional depth + targetType.
5. **neighborhood** — bounded BFS from `objects`, depth + limits.
6. **path** — BFS between two ids over `GraphEdgeIndex`; return `{path:[{from,verb,to}]}`.
7. **lineage** — `up`/`down` walk via relationship/refs with provenance; used for
   §5.7 sample/result/derived-material lineage.
8. **aggregate** — run a `find`, apply `groupBy` + measures
   (`count,sum,mean,median,min,max,stddev,first,last,distinct_count`) via a tiny
   in-memory reducer. Test: `mean ROS grouped by compound`.
9. **exists** — `find` with limit 1; return boolean.
10. **GraphResultSerde** — build envelope; `explain` renders a human sentence
    per op (reuse a small template). `GraphValidation` produces repair errors.
11. Commit: `feat(graph-query): core query engine primitives + envelope + explain + validation`.

### Phase 4 — CollectionService (ephemeral handles §7)

**Files:**
- Create: `server/src/graph-query/CollectionService.ts`.
- Test: `server/src/graph-query/CollectionService.test.ts`.

**Steps:**
1. **Write failing test:** `createCollection(nodeIds)` → `collection:q_xxx`;
   `getCollection("collection:q_xxx")` returns the node ids; `createSelection`
   from a collection subset → `selection:yyy`; handles resolve to ids. Expect FAIL.
2. Implement: sqlite-backed `collections(id, node_ids_json, created_at, principal)`
   + `selections`. Ephemeral semantics: TTL optional, in-process for spike.
3. Handle permission inheritance (§21): record `principal` at creation; `get`
   only returns if the requesting principal matches (stub principal = current
   request user, seeded from `AppContext.authorizationService` when present).
4. Run test → PASS. Commit: `feat(graph-query): ephemeral collection/selection handles`.

### Phase 5 — HTTP route + MCP tools

**Files:**
- Create: `server/src/api/handlers/GraphSearchHandlers.ts` (Fastify handler class,
  mirrors `JsonLdSearchHandlers`).
- Modify: `server/src/api/routes.ts` — add optional `graphSearchHandlers`,
  register `POST /api/search/graph`. Follow the existing optional-handler
  pattern exactly (add to `RouteOptions`, `registerRoutes` destructure).
- Create: `server/src/mcp/tools/graphTools.ts` — `registerGraphTools`, one
  `dualRegister` per §13 primitive:
  `lab.resolve`, `lab.get`, `lab.find`, `lab.traverse`, `lab.path`,
  `lab.neighborhood`, `lab.lineage`, `lab.aggregate`, `lab.evidence`,
  `lab.get_collection`, plus `lab.exists`.
- Modify: `server/src/mcp/tools/index.ts` — add `registerGraphTools` to
  `registerAllTools`.
- Wire into `server.ts` `initializeApp`: build `GraphQueryEngine` +
  `CollectionService` from context, attach `graphSearchHandlers`.
- Test: `server/src/api/handlers/GraphSearchHandlers.test.ts`,
  `server/src/mcp/tools/GraphTools.test.ts`.

**Steps:**
1. **Write failing test** for handler: `POST /api/search/graph` with a
   `find` query returns a `GraphResult` envelope and correct count. Expect FAIL.
2. Implement `GraphSearchHandlers.search` → `engine.execute(GraphQuerySchema.parse(body))`;
   wrap ZodError into `{error, details}` 400.
3. Register route in `routes.ts`.
4. Wire in `server.ts`.
5. MCP `graphTools.ts` — thin `dualRegister` wrappers calling the engine;
   `lab.evidence` = `lineage(up, depth)` + `find` for support records + a
   `relationship`-verb filter (supports/tests).
6. Add tools to aggregator. Run MCP server test (see `server/src/mcp/McpServer.test.ts`
   for the harness). Tests → PASS.
7. Commit: `feat(graph-query): HTTP route + lab.* MCP tools`.

### Phase 6 — Find UI (single-pane; table + plate views)

**Files:**
- Create: `app/src/graph-search/GraphSearchPage.tsx` — lazy route, mounts below
  shell; search box (NL + structured), result tabs.
- Create: `app/src/graph-search/GraphSearchTable.tsx` — generic table result.
- Create: `app/src/graph-search/GraphSearchPlateView.tsx` — renders `WellGrid`
  (`app/src/event-editor/focus/WellGrid.tsx`) with matched wells highlighted
  via `selectedWellIds`/`compositionStyles`.
- Create: `app/src/graph-search/GraphSearchResultExplorer.tsx` — lineage/evidence
  expandable rows (§11 relationship-column expansion).
- Modify: `app/src/App.tsx` — add `/graph-search` lazy route.
- Modify: `app/src/shared/api/client.ts` — add `graphSearch(query)` calling
  `POST /api/search/graph`.
- Test: `app/src/graph-search/GraphSearchPage.test.tsx` and
  `GraphSearchPlateView.test.tsx`.
- UI conventions (Brad): single-pane, no third pane, no pre-built widget libs;
  column expansion shows cardinality explicitly (nested/expandable), never
  silent row-dup.

**Steps:**
1. **TDD test** for API client method (mocked) and plate view well-highlighting
   from a `GraphResult` containing wells. Expect FAIL first.
2. Implement `client.graphSearch`.
3. Implement table + plate views.
4. Implement page with NL input that first calls a light NL→GraphQuery planner
   (Phase 7) OR, if unset, a structured builder fallback. For spike, wire the
   NL free-text box to `lab_NLPlanner` placeholder that returns the structured
   query for the demo corpus.
5. Route + lazy registration. Unit tests pass.
6. **LIVE-BROWSER PASS (Brad's hard rule):** bring up backend (`server/`:
   `APP_BASE_PATH=.. npx tsx --watch src/server.ts`) + Vite (`app/`:
   `npm run dev -w app`), ensure `/api/search/graph` served module carries the
   change, create a disposable study/run + event-graph with a rotenone
   add + FITC read via API, search "wells treated with rotenone" in the live UI,
   confirm the plate highlights A1–A5 and the table lists them. Report what's
   live-verified vs unit-only.
7. Commit: `feat(graph-search): Find UI with table + plate result views`.

### Phase 7 — NL→GraphQuery planner + selection→AI action (spike end-to-end)

**Files:**
- Create: `server/src/graph-query/NLPlanner.ts` — `plan(naturalLanguage) →
  {query: GraphQuery, explain}` using the existing compiler/intent pattern
  (LLM proposes structured intent; deterministic `GraphValidation` validates and
  returns repair errors on failure). Reuse `config.yaml ai.inference` client via
  the AI panel's existing client; if none configured, fall back to the
  deterministic clause-mapper (regex over a small verb/noun map) so the spike
  runs offline.
- Modify: `server/src/graph-query/CollectionService.ts` — add
  `toAiContext(selectionId, prompt)` → `{prompt, selection: nodeIds[], nodes}`.
- Modify: `app/src/graph-search/GraphSearchPage.tsx` — selection rows → create
  `selection:yyy` → inject into the AI panel context. Wire the AI panel's
  "Add rotenone to these" to receive the canonical selection ids.
- Test: `server/src/graph-query/NLPlanner.test.ts` (offline deterministic path),
  `server/src/graph-query/CollectionService.toAiContext.test.ts`.

**Steps:**
1. **Write failing test**: `plan("show wells treated with rotenone where ROS
   increased by less than 10%")` → a `find` query (wells, treatment.name=rotenone,
   measurement-channel constraint); validator accepts it. Expect FAIL.
2. Implement `plan`: deterministic clause-mapper for the offline path;
   validation+repair loop when an LLM path is configured.
3. `toAiContext` test + impl: resolves selection handle to the node ids + a
   compact `nodes` payload the AI can act on (well ids, current treatment).
4. Unit tests PASS.
5. **LIVE-BROWSER PASS:** the full §30 workflow in the running app under the
   user's nav — NL find → plate highlight → select 5 wells → AI pane receives
   `selection:yyy` → AI proposes an `add_material` (rotenone) event-graph → the
   **existing compiler** validates it (drop into the existing accept flow).
   Report live vs unit.
6. Commit: `feat(graph-search): NL planner + selection→AI context injection (spike e2e)`.

---

## Cross-cutting rules

- **exactOptionalPropertyTypes (on):** use conditional spreads, never set an
  optional field to `undefined`.
- **Schema-driven:** new edges use the `relationship` record kind (or the
  graph-edge projection table for projected nodes); do not hardcode domain
  verbs in TS logic beyond reading them from data. When a new well/measurement/
  material concept arises, mint/pull ontology CURIEs via the existing `resolve`
  spine (never free-text nouns).
- **Provenance:** every derived node carries `source.recordId` + `path`/
  `eventId`; aggregate is never a sole evidential gate (§ evidence is
  computable from the graph + provenance).
- **Mutation boundary (§22):** GraphQueryService is read-only. All writes go
  through the existing event-graph/compiler path. UI selections feed the AI
  panel which emits a proposed event-graph the existing compiler validates.

---

## Validation

- `cd server && pnpm exec vitest run` — new suites pass; full suite parity with
  baseline (only pre-existing failures, identical to main).
- `cd app && pnpm exec vitest run` — new tests pass.
- `pnpm typecheck` — full pass (server + app).
- **Live-browser pass is mandatory** for Phases 6 and 7 per Brad's rule: confirm
  services up, served module carries change, drive the real plate/selection/AI
  workflow, and report WHAT was live-verified vs unit-only.

## Risks / open questions

- **Projection fidelity:** event-graph `details` is `additionalProperties:true`,
  so well/measurement field names vary; the projector must defensively read
  `details.wells`/`details.material`/`details.channel`/`details.value` and treat
  absence as "no projection" (never throw the whole graph). A fixture
  corpus is needed for the demo — Brad's disposable-test-data rule applies.
- **Scale:** sqlite adjacency is fine for appliance-scale (~hundreds of records);
  if it grows, swap `GraphEdgeIndex` for a real graph store behind the same
  interface (§23 backend independence — the point of the AST abstraction).
- **Auth (§21):** spike assumes single-user principal passthrough; wire a real
  check only if multiuser identity is configured.
- **NL planner:** offline deterministic path is a demo affordance; the durable
  approach is the LLM-proposes / validator-repairs loop already proven in the
  compiler. Confirm which is acceptable for v0.1 before Phase 7.