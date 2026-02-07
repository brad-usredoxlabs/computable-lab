# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run build          # Compile TypeScript (tsc → dist/)
npm run dev            # Dev server with tsx (npx tsx src/server.ts)
npm start              # Run compiled server (node dist/server.js)
npm test               # Run tests in watch mode (vitest)
npm run test:run       # Run tests once
npx vitest run src/store/RecordStore.test.ts   # Run a single test file
npm run lint           # ESLint (eslint src/)
npm run typecheck      # Type check only (tsc --noEmit)
```

## Architecture

**computable-lab** is a schema-driven laboratory information system. The core principle: **if something can be expressed as data, it must be expressed as data.** Business logic lives in declarative YAML specs, not in TypeScript.

### The Schema Triplet

Every record type has three YAML specs:
- `*.schema.yaml` — Structural validation (JSON Schema 2020-12, validated by Ajv)
- `*.lint.yaml` — Business rules (declarative predicate DSL: exists, regex, equals, all, any, not)
- `*.ui.yaml` — Rendering hints (form layout, widgets, list columns)

Schemas live in `/schema/` organized by domain: core, studies, lab, knowledge, workflow.

### Source Modules (`/src`)

| Module | Role |
|--------|------|
| `schema/` | SchemaRegistry, SchemaLoader — loads YAML schemas, resolves `$ref` dependencies |
| `validation/` | AjvValidator — Ajv-based structural validation (sole validation authority) |
| `lint/` | LintEngine — interprets lint DSL from YAML (never hardcoded rules in TS) |
| `repo/` | RepoAdapter interface + GitRepoAdapter (simple-git) + LocalRepoAdapter |
| `store/` | RecordStoreImpl — CRUD orchestration, YAML parsing, record storage |
| `jsonld/` | JSON-LD derivation — @id and @context derived deterministically from recordId + namespace |
| `index/` | IndexManager — JSONL-based record index for tree queries |
| `config/` | Configuration loader with YAML parsing and env var substitution |
| `workspace/` | WorkspaceManager — ephemeral Git workspace lifecycle |
| `ui/` | FormBuilder, UISpecLoader — UI spec interpretation, form generation |
| `api/` | Fastify route handlers (records CRUD, schemas, validation, lint, UI, git) |
| `types/` | Shared type definitions (RecordEnvelope, ValidationError, Ref, Collection, Context) |

### Request Flow

```
HTTP → Fastify Route → Handler → Core Module (Store/Validator/LintEngine/Repo) → YAML/Git I/O
```

### AppContext

Server initialization builds an `AppContext` containing all core services (SchemaRegistry, AjvValidator, LintEngine, RepoAdapter, RecordStoreImpl, IndexManager). Routes receive this context and delegate to the appropriate module.

### Envelope-First Pattern

`RecordEnvelope<T>` wraps every record payload with metadata. `recordId` is canonical identity (not in payload). Metadata (createdAt, createdBy, commitSha, path) lives in `envelope.meta`, derived from Git. Never smuggle fields between payload and envelope.

### Records & Git

Records are stored as YAML files in Git (source of truth). The repo adapter handles clone/pull/push/commit. Workspaces are ephemeral (`/tmp/cl-workspaces/`). Configuration in `config.yaml` controls repositories, auth, sync mode, and CORS.

## Non-Negotiable Rules

These are enforced project conventions (from `.clinerules`). Violations are incorrect even if the build passes:

1. **Specs first, code second.** Before editing TypeScript, identify what belongs in schema/lint/UI specs. Propose spec changes first, then write minimal generic code.
2. **No hard-coded domain logic in TS.** No schema-name branching, no inline business rules, no defaults or required-field logic. Business logic lives in lint YAML.
3. **Ajv is the single validation authority.** No fake validation, no runtime Ajv mutation, no hacks. Formats are startup-only.
4. **Deterministic derivations.** No time, randomness, or environment-dependent logic in derivations. All derivations are pure and tested.
5. **No type-system resets.** Never recreate or redesign shared types (`types.ts`, `RecordEnvelope`, `ValidationResult`) to silence errors. Fix the call site, not the contract.
6. **Tests are the gate.** Behavioral change requires a failing test first. Never loosen types to silence errors.
7. **`exactOptionalPropertyTypes` is on.** Optional means absent OR value — never `undefined`. Fix construction logic, not types.
8. **Don't edit `src/types/**` or `*types.ts`** unless a failing test proves the contract wrong.

## Tech Stack

- **Runtime:** Node.js 20+, ES modules
- **Framework:** Fastify 5
- **Validation:** Ajv 8 (JSON Schema 2020-12, strict mode, discriminator, union types)
- **Git:** simple-git
- **Test:** Vitest (globals enabled, v8 coverage)
- **TypeScript:** Strict mode, ES2022 target, declaration maps
