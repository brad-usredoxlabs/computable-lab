# Computable Lab — Codebase Overview

*Last verified against commit: `af32af9`*

## Monorepo Layout

```
computable-lab/
├── app/              # Frontend (React 18 + Vite, port 5174)
├── server/           # Backend (Fastify API, port 3001)
├── schema/           # Shared YAML schema definitions (not a workspace)
├── records/          # YAML record data (seed + runtime)
├── config/           # Platform configuration files
└── package.json      # npm workspaces: server + app
```

Two npm workspaces: `server/` (backend) and `app/` (frontend).
`schema/` and `records/` are shared data directories resolved via `APP_BASE_PATH`.

## Subsystem Map

| Subsystem | Path | Role | Key Files |
|-----------|------|------|-----------|
| **Schema Registry** | `server/src/schema/` | Load/resolve YAML schemas, `$ref` dependency resolution | `SchemaRegistry.ts`, `SchemaLoader.ts` |
| **Validation** | `server/src/validation/` | Ajv-based structural validation against JSON Schema | `AjvValidator.ts` |
| **Lint Engine** | `server/src/lint/` | Declarative business rules from `*.lint.yaml` (predicate DSL) | `LintEngine.ts`, `LintSpecLoader.ts` |
| **Record Store** | `server/src/store/` | CRUD orchestration: YAML parse/write, validation, linting | `RecordStoreImpl.ts` |
| **Repo Adapter** | `server/src/repo/` | Data persistence abstraction: Git/local/embedded modes | `createRepoAdapter.ts`, `types.ts`, `GitRepoAdapter.ts`, `EmbeddedGitRepoAdapter.ts`, `LocalRepoAdapter.ts` |
| **Index Manager** | `server/src/index/` | In-process record index with rebuild support | `index.ts` |
| **JSON-LD Index** | `server/src/jsonld-index/` | SQLite full-text index for advanced search (`*.ui.yaml` facet paths) | `index.ts`, `jsonld/JsonLdProjector.ts` |
| **API Routes** | `server/src/api/` | 40+ handler modules → Fastify routes (CRUD, AI, extract, protocol, etc.) | `handlers/index.ts`, `routes.ts` |
| **UI Spec System** | `server/src/ui/` | Load `*.ui.yaml` specs → form layout, list column rendering hints | `UISpecLoader.ts` |
| **AI/Inference** | `server/src/ai/` | Tool registry, agent orchestrator, inference client, prompt warmup | `index.ts`, `warm/PromptWarmupManager.ts` |
| **AI Threads** | `server/src/ai-threads/` | Per-(user, endpoint) chat conversation persistence | `index.ts` |
| **Extraction** | `server/src/extract/` | Document extraction pipeline: library matching, mention population | `ExtractionRunnerService.ts`, `OpenAICompatibleExtractor.ts` |
| **Ingestion** | `server/src/ingestion/` | Data ingestion pipeline, artifact blob storage | `ArtifactBlobStore.ts` |
| **Protocol** | `server/src/protocol/` | Protocol authoring, IDE, builder | `ProtocolBuilderHandlers.ts` |
| **Lifecycle** | `server/src/lifecycle/` | Material lifecycle state machines from YAML specs | `index.ts` |
| **Security** | `server/src/security/` | Identity (local + GitHub), authorization (ACL/policy) | `LocalIdentityService.ts`, `AuthorizationService.ts` |
| **MCP** | `server/src/mcp/` | Model Context Protocol server for AI tool integration | `index.ts` |
| **Frontend Shell** | `app/src/shell/` | App chrome: layout, navigation, theme, settings | `ThemeProvider.tsx`, `ErrorBoundary.tsx` |
| **Frontend Event Editor** | `app/src/event-editor/` | Live deck authoring, project workspace | `EventEditorPage.tsx` |
| **Frontend Knowledge** | `app/src/knowledge/` | Record browser, literature explorer, component library | `LiteraturePage.tsx` |
| **Frontend Shared** | `app/src/shared/` | API client, contexts, hooks, form helpers, AI panel | `api/client.ts`, `context/*`, `identity/` |

## Entry Points

### Server Startup (`server/src/server.ts`)

Initialization order:

1. **Config** — load `config.yaml` (env → basePath → parent dir fallback)
2. **Schema Registry** — scan `schema/` recursively, register all `*.schema.yaml`
3. **Validator** — Ajv instance, add schemas in topological order (deps first)
4. **Lint Engine** — load predicate registry + all `*.lint.yaml` specs
5. **Lifecycle Engine** — load `schema/core/lifecycles/*.yaml`
6. **Policy Bundles** — load `schema/core/policy-bundles/*.yaml`
7. **Repo Adapter** — factory selects Git / embedded-Git / local-filesystem
8. **Record Store** — wire adapter + validator + lint engine
9. **Identity + Authorization** — local admin user, owner-policy backfill
10. **Index Manager** — rebuild in-process record index
11. **UI Specs** — load all `*.ui.yaml` from `schema/`
12. **Platform Registry** — load platform manifests
13. **JSON-LD Index** — SQLite search index, seed from existing records
14. **Handler creation** — 40+ handler modules wired to `AppContext`
15. **Fastify** — register CORS, multipart, MCP plugin, all routes
16. **AI runtime** — lazy init: orchestrator, inference client, tool bridge

### Frontend Routing (`app/src/main.tsx` → `app/src/App.tsx`)

Provider stack: `ErrorBoundary → ThemeProvider → SelectionProvider → BrowserRouter`

Routes (all lazy-loaded via `<Suspense>`):

| Path | Component |
|------|-----------|
| `/` | `WelcomePage` — recent projects + "Open all" picker |
| `/create/study` | `CreateStudyPage` |
| `/project/:studyId` | `ProjectWorkspacePage` |
| `/project/:studyId/event-graph/:eventGraphId` | `ProjectWorkspacePage` |
| `/event-editor` | `EventEditorPage` |
| `/event-editor/:eventGraphId` | `EventEditorPage` |
| `/event-editor/fixit` | `Slot("event-editor.fix-it-route")` |
| `/runs/:runId/event-editor` | `EventEditorPage` |
| `/browser` | `LegacyModeRedirect("browser")` |
| `/protocols` | `LegacyModeRedirect("protocols")` |
| `/literature` | `LiteraturePage` |
| `/protocol-builder` | `ProtocolBuilderPage` |
| `/project/:studyId/run/:runId` | `RunWorkspacePage` |
| `/settings` | `SettingsRoute` |

Special: `?screen=labware-editor&fixture=…` bypasses App and mounts `LabwareEventEditor` directly.

Vite proxies `/api` → `http://localhost:3001`.

## The Schema Triplet

Every record type has three YAML specs in `schema/<domain>/`:

```
schema/core/context/
  ├── context.schema.yaml   # JSON Schema 2020-12 (structural validation)
  ├── context.lint.yaml     # Business rules (exists, regex, equals, all, any, not)
  └── context.ui.yaml       # Rendering hints (form layout, widgets, list columns)
```

Domains: `core/`, `studies/`, `lab/`, `knowledge/`, `workflow/`, `bio/`, `identity/`, `ingestion/`.

Shared: `schema/registry/` (predicate definitions, ontology terms, compile pipelines).

Processing chain: Schema → Ajv (structural) → Lint (business rules) → UI spec (form layout).

## Record Storage

Records are YAML files. Storage is abstracted through `RepoAdapter`:

| Mode | Adapter | Behavior |
|------|---------|----------|
| `embedded-git` (default) | `EmbeddedGitRepoAdapter` | Durable local bare repo in `~/.computable-lab` |
| `remote-git` | `GitRepoAdapter` | Clone from remote, auto-commit/push on write |
| `local-filesystem` | `LocalRepoAdapter` | Plain files, no git history (dev/testing) |

Every write goes through `RecordStoreImpl` which validates (Ajv + lint) before delegating to the repo adapter.

## Dependency Direction

```
         schema/ (YAML specs)
              ↑
         server/src/schema/  ← loads YAML, resolves $ref
         server/src/validation/  ← consumes schemas for Ajv
         server/src/lint/  ← consumes lint specs + predicate registry
         server/src/ui/  ← consumes UI specs
              ↑
         server/src/store/  ← depends on: adapter, validator, lint
         server/src/index/  ← depends on: adapter
              ↑
         server/src/api/handlers/  ← depends on: store, index, validators, UI, AI
              ↑
         server/src/server.ts  ← wires all handlers → Fastify
              ↑
         app/src/shared/api/client.ts  ← HTTP calls to server /api
              ↑
         app/src/App.tsx  ← consumes API client, renders routes
```

**Data flow**: YAML specs (`schema/`) → loaded by server core modules → consumed by RecordStore → exposed via API handlers → consumed by frontend API client → rendered by React routes.

**No circular deps**: Schema → Validation → Store → API → Frontend (strictly downstream).
