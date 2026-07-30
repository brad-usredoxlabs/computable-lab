# API Map — computable-lab

*Last verified against commit:* `af32af9`

## Service Boundaries

| Layer | Package | Role |
|---|---|---|
| **schema/** | Shared YAML | `*.schema.yaml` (JSON Schema), `*.lint.yaml` (lint DSL), `*.ui.yaml` (rendering) |
| **server/** | Fastify API :3001 | Record CRUD, validation, AI inference, execution, protocol, ingestion |
| **app/** | React + Vite :5174 | SPA; proxies `/api` → backend |
| **records/** | YAML on disk | Git-backed data store, one file per record envelope |

Flow: `HTTP → Fastify route → handler → RecordStore/Compiler/InferenceClient → YAML/Git/LLM`

---

## REST Routes

| Prefix | Handler | Purpose |
|---|---|---|
| `GET /health` | inline | Health check (schemas, lint rules, AI) |
| `GET /meta, POST /sync` | `metaHandlers` | Server metadata, sync |
| `GET/POST/PUT/DEL /records` | `RecordHandlers` | Generic record CRUD |
| `POST /claims/check-duplicates` | `RecordHandlers` | Claim dedup |
| `GET /records/:id/related` | `RelatedRecordsHandlers` | Reverse-reference query |
| `GET/POST /me, /users, /groups` | `IdentityHandlers` | Identity, users, groups |
| `GET/PUT /records/:id/access-policy` | `IdentityHandlers` | Access control |
| `POST /ai/search-records, /ai/precompile-record` | `RecordSearchHandlers` | AI record search |
| `GET /schemas*` | `SchemaHandlers` | Schema listing/retrieval |
| `POST /validate, /lint, /validate-full` | `ValidationHandlers` | Ajv validation + lint |
| `GET/POST /ui/*` | `UIHandlers` | UI specs, editor projections, slot suggestions |
| `GET/POST /git/*` | `GitHandlers` | Git status, commit-push, sync |
| `GET/POST /templates/*, /runs/*, /tree/*, /index/rebuild` | `TreeHandlers` | Templates, study hierarchy, inbox, run methods |
| `GET /runs/:id/workspace, /runs/:id/analysis-bundle, /runs/:id/ai-context` | `RunWorkspaceHandlers` | Run workspace, analysis bundle, AI context |
| `GET/POST /runs/:id/* (event-graph, meaning, readouts, results, evidence)` | `RunDraftHandlers` | Run-centered workflow: draft/accept |
| `GET/POST /library/*` | `LibraryHandlers` | Reuse library, promote ontology/context |
| `GET/POST /ontology/search, /resolve, /vocab/mint` | `OntologyHandlers, ResolveHandlers, VocabHandlers` | Ontology search, term resolution, minting |
| `GET/POST /vendors/*, /equipment/*, /chemistry/*` | `VendorSearchHandlers, EquipmentHandlers, ChemistryHandlers` | Vendor search, equipment, molecular weight |
| `GET/POST /semantics/*` | `SemanticsHandlers` | Instruments, readouts, assays, well groups/roles |
| `GET /tags/suggest` | `TagHandlers` | Tag suggestions |
| `GET/POST /materials/*` | `MaterialPrepHandlers, MaterialLifecycleHandlers, MaterialProfileHandlers` | Formulations, inventory, lifecycle |
| `GET /settings/lab` | `LabSettingsHandlers` | Lab settings |
| `GET /platforms/*` | `PlatformHandlers` | Platform manifests |
| `GET/POST /ingestion/*` | `IngestionHandlers` | Ingestion jobs, bundles |
| `POST /extract*, /extraction/drafts/*` | `ExtractHandlers` | Data extraction |
| `POST /ai/draft-events, /ai/draft-events/stream, /ai/assist/stream, /ai/context/warm/*` | `AIHandlers` | AI event drafting, assist, context warming |
| `POST /ai/extract-protocol` | `ExtractProtocolHandlers` | PDF protocol extraction |
| `POST /protocol-builder/*, /protocols/*` | `ProtocolBuilderHandlers, ProtocolHandlers, ProtocolPromotionHandlers` | Protocol extraction, drafting, promotion |
| `POST /runs/:runId/checkin, /runs/:runId/execution-events` | `CheckinHandlers` | Run check-in |
| `GET/POST /ai/threads/:endpoint/*` | `AiThreadHandlers` | AI chat threads |
| `POST /search/jsonld, /search/projects` | `JsonLdSearchHandlers` | JSON-LD search |
| `GET/POST /event-editor/fix/*` | `EventEditorFixHandlers` | Event editor AI fixes |
| `GET/POST /foundry/*` | `FoundryJobHandlers` | Foundry jobs |
| `GET/POST /protocol-ide/*` | `ProtocolIdeHandlers` | Protocol IDE: sessions, reviews |
| `POST /runs/* (from-local-protocol, bindings, sample-map, compile)` | `PlannedRunHandlers` | Planned runs |
| `GET/POST /components/*` | `ComponentHandlers` | Component graph CRUD |
| `GET/POST /execution*, /execution-plans*, /execution-tasks*, /execution-runs*, /planned-runs*, /robot-plans*, /measurements*` | `ExecutionHandlers` | Execution: adapters, plans, tasks, runs, measurements |
| `GET /biosource/:source/*` | `BiosourceHandlers` | BioSource proxy |
| `POST /ai/extract-knowledge/*` | `KnowledgeAIHandlers` | Knowledge extraction |
| `POST /ai/infer-source-kind, /ai/suggest-ingestion-mapping, /ai/explain-ingestion-issue` | `IngestionAIHandlers` | AI for ingestion |
| `POST /ai/analyze-ingestion` | `AiIngestionHandlers` | AI ingestion analysis |
| `POST /ai/draft-material, /ai/search-materials, /ai/review-material-composition, /ai/check-material-duplicate` | `MaterialAIHandlers` | AI material ops |
| `GET/POST /config/*` | `ConfigHandlers` | Config, AI profiles |
| `GET/POST /planned-runs/:id/procurement/*` | `ProcurementHandlers` | Procurement |
| `GET /prompt-templates/:id` | `PromptTemplateHandlers` | Prompt templates |
| `GET /ontology-terms/lookup, /verb-action-map/lookup, /predicates` | `OntologyTermHandlers, VerbActionMapHandlers, PredicatesHandlers` | Term/action/predicate lookup |
| `GET/PUT /studies/:studyId/workspace` | `WorkspaceHandlers` | Per-study workspace state |
| `GET /studies/:studyId/artifacts/:artifactId/blob` | `ArtifactBlobHandlers` | Artifact blobs |
| `POST /labware-definitions/search` | inline | Labware definition search |

---

## Frontend API Client (`app/src/shared/api/client.ts`) — 196 methods

| Group | Key Methods |
|---|---|
| **Identity** | `getMe, listUsers, createUser, updateMe, listGroups, createGroup, addGroupMember, removeGroupMember, getAccessPolicy, putAccessPolicy` |
| **Records** | `getRecord, createRecord, updateRecord, getRecords, listRecordsByKind` |
| **Schemas/UI** | `getSchemas, getSchema, getUiSpec, getRecordWithUI, getRecordEditorProjection, getEditorDraftProjection, getRecordEditorSlotSuggestions` |
| **Search** | `searchProjects, searchRecords, getRelatedRecords, precompileRecord, draftRecord` |
| **Event Graph** | `saveEventGraph, loadEventGraph, listEventGraphs, draftRunEventGraph, acceptRunEventGraph` |
| **Materials** | `getFormulationsSummary, getMaterialInventory, createFormulation, draftFormulationFromText, executeRecipe, searchMaterials, getMaterial, createMaterialInstance, createMaterialDerivation, getMaterialLineage` |
| **AI Materials** | `draftMaterialFromText, smartSearchMaterials, reviewMaterialComposition, checkMaterialDuplicate` |
| **Protocol IDE** | `createProtocolIdeSession, suggestProtocolStructure, listFoundryReviews, getFoundryStatus, getFoundryReviewContext, synthesizeFoundrySpec, promoteFoundryDraftSpec, rerunProtocolIdeSession, submitProtocolIdeFeedback, selectProtocolIdeVariant` |
| **Protocol** | `saveProtocolFromEventGraph, getProtocolContext, useProtocolInRun, specializeProtocolForExperiment, promoteRunMethodToProjectTemplate, bindProtocol` |
| **Execution** | `createPlannedRun, orchestrateExecution, validateExecutionPlan, emitExecutionPlan, ingestMeasurement, executeInstrumentApplianceJob` |
| **Run Workflow** | `getRunWorkspace, getRunAnalysisBundle, draftRunMeaning, acceptRunMeaning, getRunReadouts, createRunResults, approveRunResults, draftRunEvidence, acceptRunEvidence, interpretResults, assembleEvidence` |
| **Planned Runs** | `createPlannedRunFromLocalProtocol, updatePlannedRunBindings, setPlannedRunSampleMap, compileRunPlan` |
| **Ingestion** | `listIngestionJobs, createIngestionJob, runIngestionJob, inferSourceKind, analyzeIngestion` |
| **Components** | `listComponents, createComponent, publishComponent, instantiateComponent, getComponentInstanceStatus` |
| **Templates** | `searchTemplates, materializeTemplate` |
| **Ontology** | `resolve, mintLocalTerm, searchLibrary, promoteContext` |
| **Semantics** | `listSemanticsInstruments, listSemanticsReadouts, createMeasurementContext, createWellGroup, createWellRoleAssignment` |
| **AI Context** | `warmAiContext, getAiWarmStatus` |
| **Config/Git/Vendor** | `getConfig, getGitStatus, commitAndPush, searchVendorProducts, searchEquipmentExa` |
| **Workspace** | `loadWorkspace, saveWorkspace, artifactBlobUrl` |

---

## Key Call Chains

### PDF → Protocol → Run → Execute

```
1. POST /protocol-builder/extract-pdf-text      → extract text from PDF URL
2. POST /protocol-builder/extract                → AI extracts structured protocol
   └→ ProtocolBuilderHandlers.extractProtocol()
      └→ ProtocolExtractionService.ts → InferenceClient.complete() → LLM
3. POST /protocol-builder/promote                → save as protocol record
   └→ RecordStore.create() → YAML in records/
4. POST /protocol-actions/use-in-run             → instantiate run from protocol
   └→ ProtocolHandlers.useProtocolInRun()
5. POST /runs/:id/compile                        → compile run plan
   └→ PlannedRunHandlers.compileRunPlan()
6. POST /execution/orchestrate                   → start execution
   └→ ExecutionHandlers.orchestrateExecution()
      └→ ExecutionOrchestrator.ts
         └→ StepGraphCompiler / OpentronsCompiler / ManualCompiler
         └→ ExecutionRunner dispatches to adapters
```

### AI Inference Flow

```
POST /ai/draft-events (or /stream)
  → AIHandlers.draftEvents() [server/src/api/handlers/AIHandlers.ts]
  → AgentOrchestrator.run() [server/src/ai/AgentOrchestrator.ts:1877]
      1. resolveMentionsForPrompt() — resolve [[mention]] tokens
      2. buildSystemPrompt() [server/src/ai/systemPrompt.ts]
      3. runChatbotCompile() [server/src/ai/runChatbotCompile.ts]
         15 passes: extract_entities → tag_prompt → ai_precompile → expand_biology_verbs
         → resolve_labware → apply_directives → expand_patterns → expand_protocol
         → resolve_roles → mint_materials → compute_volumes → compute_resources
         → derive_execution_scale_plan → plan_deck_layout → validate
      4. InferenceClient.complete() [server/src/ai/InferenceClient.ts:309]
         └→ POST <baseUrl>/chat/completions, 3 retries (2s/4s/8s backoff), 120s timeout
      5. Multi-turn: LLM calls compile tool → server validates → feeds back
      6. parseAgentFinalResponse() → normalizeDraftMaterialRefs() → stampDraftProvenance()
  → SSE stream (AgentEvent chunks)

Context warm: POST /ai/context/warm → PromptWarmupManager pre-encodes KV cache prefix
```

### Event Graph Lifecycle

```
CREATE: saveEventGraph(null, { events, labwares, runId })
  → POST /records (schema: event-graph.schema.yaml)
  → RecordHandlers.createRecord() → RecordStore.create() → YAML at records/event-graphs/<id>.yaml
  → If links.runId: back-fills run.methodEventGraphId

SAVE: saveEventGraph(graphId, { events, labwares })
  → PUT /records/:id → RecordHandlers.updateRecord() → RecordStore.update()
  → onEventGraphMutated(runId) → PromptWarmupManager.refresh()

LOAD: loadEventGraph(graphId)
  → GET /records/:id → RecordStore.get()

COMPILE: runChatbotCompile() → StepGraphCompiler.ts
  → OpentronsCompiler.ts | ManualCompiler.ts | AssistPlusCompiler.ts
```

### Record CRUD (`server/src/api/handlers/RecordHandlers.ts`)

```
CREATE (POST /records):
  1. Validate schemaId + payload, resolve user identity
  2. normalizeEventGraphMaterialUsage() → authorization check on parents
  3. Inject provenance (createdAt, createdBy), inherit FAIR fields from parent
  4. createEnvelope() → RecordStore.create()
     → AjvValidator.validate() → LintEngine.lint()
     → GitRepoAdapter: write YAML → git commit
  5. ensureOwnerPolicy() → IndexManager.rebuild()

UPDATE (PUT /records/:id):
  1. Resolve user + check write access
  2. normalizeEventGraphMaterialUsage() → checkLifecycleTransition()
  3. RecordStore.update() → validate → lint → git commit
  4. If event-graph: onEventGraphMutated() → warm context

DELETE (DELETE /records/:id):
  1. Resolve user + check write access
  2. RecordStore.delete() → git remove → IndexManager.rebuild()
```

### Workspace State (`server/src/api/handlers/WorkspaceHandlers.ts`)

```
GET /studies/:studyId/workspace → reads <recordsRoot>/studies/<studyId>/workspace.yaml
  Returns parsed WorkspaceState or defaultWorkspaceState() on ENOENT

PUT /studies/:studyId/workspace → atomic write (tmp + rename)
  Validates WorkspaceState (studyId, tabs[], activeTabId, rightPaneMode, paneWidths)
  studyId forced from URL; not trusted from body
```

---

## Core Files

| File | Lines | Role |
|---|---|---|
| `server/src/api/routes.ts` | 1071 | All route registration |
| `server/src/api/handlers/RecordHandlers.ts` | 825 | Generic CRUD |
| `server/src/ai/AgentOrchestrator.ts` | 1877 | Multi-turn AI agent loop |
| `server/src/ai/InferenceClient.ts` | 309 | OpenAI-compatible HTTP client |
| `server/src/ai/systemPrompt.ts` | — | System prompt builders per AI surface |
| `server/src/ai/runChatbotCompile.ts` | — | Deterministic compile pipeline |
| `server/src/protocol/StepGraphCompiler.ts` | — | Event graph → step graph |
| `server/src/protocol/ProtocolExtractionService.ts` | — | PDF → protocol extraction |
| `server/src/execution/ExecutionOrchestrator.ts` | — | Execution orchestration |
| `server/src/execution/ExecutionRunner.ts` | — | Adapter dispatch |
| `server/src/api/handlers/AIHandlers.ts` | 644 | AI route handlers |
| `server/src/api/handlers/WorkspaceHandlers.ts` | 153 | Per-study workspace YAML |
| `server/src/api/handlers/ProtocolBuilderHandlers.ts` | — | Protocol extraction/drafting |
| `server/src/api/handlers/ExecutionHandlers.ts` | — | Execution pipeline |
| `server/src/api/handlers/RunDraftHandlers.ts` | — | Run-centered workflow |
| `app/src/shared/api/client.ts` | 4191 | Frontend API client, 196 methods |
