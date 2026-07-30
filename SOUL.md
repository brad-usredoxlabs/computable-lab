# SOUL.md

## Agent Modes

**Default mode: Analyze, converse, and submit specs.** The primary workflow is to understand the codebase, discuss approaches, and drop spec `.md` files into `~/.hermes/specs/inbox/` for the kanban pipeline (architect → coder → reviewer → browser-reviewer) to process asynchronously.

**Intervention mode: Direct code fixes.** When the user explicitly asks to "intervene" or "fix this", switch to direct implementation mode. This is necessary when the coding loop itself is broken and can't self-repair, or when infrastructure/tooling issues block the pipeline. The agent will fix code directly, run tests, and verify the fix works.

## Codebase orientation

Before broad code search, read:

- `docs/agent/CODEBASE_OVERVIEW.md`
- `docs/agent/COMPONENT_INDEX.md`
- `docs/agent/INVARIANTS.md`

For API or integration work, also read:

- `docs/agent/API_MAP.md`
- `docs/agent/WORKFLOWS.md`

For entity relationships and data model, also read:

- `docs/agent/DATA_MODEL.md`

Treat these documents as orientation aids, not as authoritative replacements
for the code. Verify relevant interfaces and behavior in the implementation
before modifying them.

When code and documentation disagree, follow the code and update the
documentation in the same change.

## Core Philosophy

**If something can be expressed as data, it must be expressed as data.**
Business logic lives in declarative YAML specs, not in TypeScript. Schemas
define what's true; code enforces those rules.

**Context is everything in biology.** Context creates materials. Context
creates effects. A positive control is not a chemical — it is a complete
biological system in a specific state. The knowledge layer captures WHY
things work, not WHERE they sit.

**Two-pane layout is preferred.** The user explicitly rejects three-pane
layouts. The existing two-pane layout with a tabbed right pane is the pattern
to extend. Add tabs to the right pane, not new panels. Add surfaces to the
center, not new columns. Never add a left sidebar or third pane.

## Decision Rules

1. **Declarative first.** If a rule can be a YAML schema, lint spec, or UI
   spec, it must be. Code reads data files; code does not hardcode rules.

2. **Schema triplet.** Every record type has three YAML specs: `*.schema.yaml`
   (structural validation), `*.lint.yaml` (business rules), `*.ui.yaml`
   (rendering hints). All three must be consistent.

3. **Material hierarchy has different lifecycles.** Material/MaterialSpec use
   vocabulary lifecycle (proposed → active). MaterialInstance/Aliquot use
   inventory lifecycle (available → consumed). Never mix them.

4. **Protocol layers are const.** `protocolLayer: "universal"` for protocols,
   `"lab"` for local-protocols and planned-runs. These are const fields, not
   free text.

5. **AI thinking must be disabled for extraction.** Qwen3.5/3.6 thinking
   models consume all completion tokens on reasoning and return null content.
   Use `enableThinking: false` for deterministic extraction tasks.

6. **exactOptionalPropertyTypes.** `undefined` is not a valid value for
   optional fields. Use conditional spread `...(value ? { key: value } : {})`
   or omit the field entirely.

7. **CSS uses --cl-* tokens.** Never hardcode color values. All UI uses
   CSS custom properties defined in `shared/styles/tokens.css`.

8. **Server must start or nothing works.** Schema loading crashes the server
   on invalid schemas. Test schema changes before restarting.

9. **Records are YAML files.** The repo adapter (git or local) handles
   clone/pull/push/commit. `RecordEnvelope<T>` wraps every record with
   metadata. `recordId` is canonical identity.

10. **When code and docs disagree, follow the code.** Update the docs in the
    same change. A stale architecture document makes the agent confidently
    wrong, which is worse than code search.

## Build & Development Commands

```bash
# Both services
./start-app.sh                    # Launch backend + frontend
npm run typecheck                 # Typecheck both workspaces

# Backend (server/)
npm run dev -w server             # Dev server (tsx, port 3001)
npm run test:run -w server        # Tests once
npm run typecheck -w server       # Type check only

# Frontend (app/)
npm run dev -w app                # Vite dev server (port 5174)
npm run typecheck -w app          # Type check only
npm run test:unit -w app          # Unit tests (vitest)
```

## Configuration

`config.yaml` (gitignored) is the single source of truth for server
configuration. Contains API keys, AI inference endpoint, repo settings.
Changes require a server restart.

Verify AI connection: `grep "AI agent initialized" .run/backend.log`
