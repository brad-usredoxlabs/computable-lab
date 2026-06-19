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

## Knowledge Layer (canonical model)

The substance of computable-lab is the **knowledge layer**: a plate sets the *biological context* for a scientist's *assertions* about *globally reusable claims*; a plate read produces *evidence* that supports or refutes those assertions in that context.

### The "Computable Lab Way" — Context Is Everything in Biology

**Context creates materials. Context creates effects.** A positive control is NOT a chemical. It is a **complete biological system in a specific state**. Rotenone does not create ROS in a vacuum. It requires: viable cells + functional mitochondria + culture medium + perturbation + detection method.

**Conditioned medium is also a context.** Adipocytes + DMEM → 48h → 2x10^6 cells/5mL → differentiated → context of creation → conditioned medium (MATERIAL). The material IS the context. "Conditioned medium" is meaningless without: what cells, what starting medium, how many hours, how many cells, what volume, differentiated or proliferating.

The knowledge layer captures WHY things work, not WHERE they sit.

- **Context** = biological state (cells + medium + perturbation + detection + duration + cell count + volume + state)
- **Context-Role** = reusable role properties (e.g., "positive-control" requires: living system + functional target machinery + known perturbation + detection method)
- **Assertion** = "This context produces [effect]" with scope and predicted outcome
- **Measurement-Context** = how we read it (plate, instrument, channel)
- **Evidence** = post-read: supports/refutes assertion with quantitative data

**Context creates materials.** Conditioned medium, formulations, cell lysates — all are materials defined by their context of creation. Remove any component (dead cells, broken ETC, no detection, wrong duration) → no longer the same thing. When the AI proposes evidence, it must reference the complete context: "supports assertion because context contains all necessary components for [role] and measurement shows [quantitative result]." Not well positions — the full context graph.

Before authoring or editing anything that touches `claim`, `context`, `context-role`, `assertion`, `evidence`, `mechanism-model`, or `experiment-narrative` records — or any UI/orchestration that drives them — read `docs/knowledge-layer-canonical-example.md`. It works the PPARα → ROS hypothesis through the full record graph and pins down the model that conflates easily otherwise (claim ≠ context ≠ assertion; mechanism chains live in `mechanism-model`, not as nested claims; context-roles are reusable records with optional machine-checkable prerequisites).

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
7. **Controlled vocabularies over free text.** The repo is schema-driven and ontology-based. Nouns used by users are purposefully ontology terms. Without controlled vocabularies, we're pushed back into Babel. Ontology search exists in this repo (`server/src/foundry/`) and locally in `cl-appliance`. Users who insist on new nouns/verbs should author them as CURIE-style terms with a local namespace punned to the lab (e.g., `cf:ROS`, `cf:PPARalpha`, `cf:conditioned-medium`). The AI should always prefer ontology terms over free text, and suggest CURIE-style local terms when a new concept arises.
8. **Materials are a hierarchy of provenance, not a flat list.** A material concept (clofibrate) is NOT a formulation (1mM in DMSO) which is NOT a material instance (weighed 43.2mg, dissolved 2024-03-15) which is NOT an aliquot (cryobox A1, 50µL). Each layer adds provenance. Biological materials have temporal state (passage number, differentiation state). Compositions have components at specified concentrations. Derived materials (conditioned medium, cell lysate) are defined by their biological context of creation. Containers, consumables, and lots are materials too — the plate type changes fluorescence. The AI must distinguish: concept ≠ formulation ≠ instance ≠ aliquot ≠ composition. Never collapse the hierarchy.
