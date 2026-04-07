# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo Structure

```
computable-lab/             # npm workspaces root
├── server/                 # Backend (Fastify API)
├── app/                    # Frontend (React + Vite)
├── schema/                 # Shared schema definitions (YAML)
├── records/                # Data directory (YAML records)
├── config/                 # Platform configurations
└── start-app.sh            # Launches both services
```

## Build & Development Commands

```bash
# Both services
./start-app.sh                    # Launch backend + frontend
npm run typecheck                 # Typecheck both workspaces

# Backend (server/)
npm run dev -w server             # Dev server (tsx, port 3001)
npm run test -w server            # Tests in watch mode (vitest)
npm run test:run -w server        # Tests once
npm run typecheck -w server       # Type check only
npm run build -w server           # Compile TypeScript (tsc → dist/)

# Frontend (app/)
npm run dev -w app                # Vite dev server (port 5174)
npm run typecheck -w app          # Type check only
npm run test:unit -w app          # Unit tests (vitest)
npm run test:e2e -w app           # E2E tests (playwright)
```

The backend resolves `schema/` and `records/` relative to `APP_BASE_PATH` (defaults to `process.cwd()`). `start-app.sh` sets this to the monorepo root. Symlinks in `server/` also point to the root for when running from the server directory directly.

## Backend Architecture (server/)

**computable-lab** is a schema-driven laboratory information system. The core principle: **if something can be expressed as data, it must be expressed as data.** Business logic lives in declarative YAML specs, not in TypeScript.

### The Schema Triplet

Every record type has three YAML specs in `schema/`:
- `*.schema.yaml` — Structural validation (JSON Schema 2020-12, validated by Ajv)
- `*.lint.yaml` — Business rules (declarative predicate DSL: exists, regex, equals, all, any, not)
- `*.ui.yaml` — Rendering hints (form layout, widgets, list columns)

Schemas are organized by domain: `core/`, `studies/`, `lab/`, `knowledge/`, `workflow/`.

### Source Modules (server/src/)

| Module | Role |
|--------|------|
| `schema/` | SchemaRegistry, SchemaLoader — loads YAML schemas, resolves `$ref` dependencies |
| `validation/` | AjvValidator — Ajv-based structural validation (sole validation authority) |
| `lint/` | LintEngine — interprets lint DSL from YAML (never hardcoded rules in TS) |
| `repo/` | RepoAdapter interface + GitRepoAdapter (simple-git) + LocalRepoAdapter |
| `store/` | RecordStoreImpl — CRUD orchestration, YAML parsing, record storage |
| `ui/` | FormBuilder, UISpecLoader — UI spec interpretation, form generation |
| `api/` | Fastify route handlers (records CRUD, schemas, validation, lint, UI, git) |
| `types/` | Shared type definitions (RecordEnvelope, ValidationError, Ref) |

### Request Flow

```
HTTP → Fastify Route → Handler → Core Module (Store/Validator/LintEngine/Repo) → YAML/Git I/O
```

### Records & Git

Records are stored as YAML files. The repo adapter handles clone/pull/push/commit. `RecordEnvelope<T>` wraps every record payload with metadata. `recordId` is canonical identity (not in payload).

## Frontend Architecture (app/)

The frontend is a React SPA that consumes the backend API. It is organized into feature modules:

| Module | Purpose |
|--------|---------|
| `shell/` | App chrome — Layout, nav, settings page |
| `editor/` | TapTab record editor, forms, materials, formulations |
| `graph/` | Event graph / labware editor, run workspace |
| `knowledge/` | Record browser, literature explorer, component library |
| `ingestion/` | Data ingestion pipeline UI |
| `shared/` | Cross-cutting: API client, AI panel, contexts, hooks, form helpers |
| `types/` | Frontend type definitions |

### Key conventions

- `shared/` is strictly for code used by 2+ modules. Do not add speculatively.
- The API client lives at `shared/api/client.ts` (~2100 lines, ~114 methods).
- Vite proxies `/api` to the backend at `http://localhost:3001`.
- Routes are defined in `App.tsx` with lazy loading for large modules.

### Frontend Tech Stack

- React 18, React Router 6, TypeScript
- Vite 5, Tailwind CSS 4
- TipTap 3 (rich text / TapTab editor)
- CodeMirror 6 (JSON/YAML editing)
- Vitest (unit), Playwright (e2e)

## Non-Negotiable Rules

1. **Specs first, code second.** Before editing TypeScript, identify what belongs in schema/lint/UI specs.
2. **No hard-coded domain logic in TS.** No schema-name branching, no inline business rules. Business logic lives in lint YAML.
3. **Ajv is the single validation authority.** No fake validation, no runtime Ajv mutation.
4. **No type-system resets.** Never recreate shared types to silence errors. Fix the call site.
5. **Tests are the gate.** Behavioral change requires a failing test first.
6. **`exactOptionalPropertyTypes` is on** (backend). Optional means absent OR value — never `undefined`.
