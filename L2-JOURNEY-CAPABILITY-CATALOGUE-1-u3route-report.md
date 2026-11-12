# L2-JOURNEY-CAPABILITY-CATALOGUE-1 — unit 3 (u3route) report

Worktree: /home/brad/cl-wt/L2-JCC-u3route-lane2
Branch: cl/lane2-journey-cat-u3route-1112
Base: dd161c3a (trunk tip containing u1 schema + u2 loader; STEP 0 gate satisfied)

## Status

STATUS: complete

## Commits

- cc139097 — RED route test for GET /journey/capabilities (4 failing cases)
- 167119b9 — serve GET /journey/capabilities from unit 2 admission
- (this report commit)

## Changed files (owned scope only)

- server/src/api/routes.ts
  - `RouteOptions.journeyCatalogueDir?: string` (optional; existing callers untouched)
  - one `fastify.get('/journey/capabilities', ...)` registration after the record routes
  - `DEFAULT_JOURNEY_CATALOGUE_DIR` resolved repo-relative via
    `new URL('../../../config/journey/capabilities', import.meta.url)` (forcedToolCompliance.ts:20 pattern)
- server/src/api/journeyCapabilities.routes.test.ts (new, `// @vitest-environment node`)

No other file touched. No handler-id literals, no `JourneyHandlers` class, no config seed data,
no edits to capabilityCatalogue.ts / schemas / server.ts / ai/**.

## Decision: delegate to unit 2's loader, not a second YAML reader

The brief's step (ii)/(iii) describes reading `*.yaml` into `{file, doc}` and calling
`admitCapabilityCatalogue`. Unit 2 shipped `loadCapabilityCatalogueDir(dir, knownHandlerIds)`,
which is exactly that composition (readdir + per-file parse with a diagnostic on unparseable
YAML + `admitCapabilityCatalogue`). The route calls the loader, so there is ONE reading path and
ONE admission authority; inlining a second readdir/parse loop in routes.ts would have been a
parallel resolver. The known-handler set is still `new Set(AGENT_ALLOWED_TOOLS)` from
`server/src/ai/index.js` — no literal list. The loader throws only on an unreadable directory
(per-file parse errors are already diagnostics), which the route catches into ONE named
diagnostic, satisfying case (d).

## RED (before the route existed)

Command: `cd server && npx vitest run src/api/journeyCapabilities.routes.test.ts`
Raw summary:

```
 Test Files  1 failed (1)
      Tests  4 failed (4)
```

All four failed with `expected 404 to be 200` (route absent). Full log:
/home/brad/.jcc-u3-scratch/red.log

## GREEN

Command: `cd server && npx vitest run src/api/journeyCapabilities.routes.test.ts src/compiler/journey/capabilityCatalogue.test.ts`

```
 ✓ src/compiler/journey/capabilityCatalogue.test.ts  (6 tests) 161ms
 ✓ src/api/journeyCapabilities.routes.test.ts  (4 tests) 187ms

 Test Files  2 passed (2)
      Tests  10 passed (10)
```

Cases: (a) empty dir => 200, `[]`/`[]`; (b) allowed handler_ref served + byte-identical second
response; (c) dangling handler_ref excluded, id named verbatim in diagnostics, 200; (d) absent
dir => 200, `[]`, exactly one diagnostic containing the directory path.

## MUTATION PROBE

Mutation: `new Set(AGENT_ALLOWED_TOOLS)` -> `new Set<string>()` in the route.
Raw summary:

```
→ expected [] to include 'journey.fixture.known'
 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
```

Case (b) RED, case (c) GREEN — the route is genuinely calling admission. Reverted; `git status
--short` showed only `M server/src/api/routes.ts` before the GREEN commit, and is clean at exit.

## VERIFY

1. `cd server && npx vitest run src/api/journeyCapabilities.routes.test.ts src/compiler/journey/capabilityCatalogue.test.ts`
   => 2 files passed, 10 tests passed (output above).
2. `cd server && npx tsc --noEmit` => zero output, `TSC_EXIT=0`.
3. `git status --short` => clean; `git log --oneline -3` => 167119b9, cc139097, dd161c3a.

## Environment notes (not product changes)

- This worktree had no `node_modules`; symlinked `node_modules` and `server/node_modules` to the
  sibling u2loader worktree (same base, gitignored).
- `cd server && npx vitest` needs the gitignored `server/schema -> ../schema` symlink that the
  canonical checkout has but fresh worktrees lack (scientist-intent vocabulary resolves from
  `process.cwd()`). Created it; it is gitignored and does not appear in `git status`.
- Pre-existing, unrelated: `src/api/handlers/LabSettingsHandlers.routes.test.ts` fails at this
  base because its stub lacks `recordHandlers.listDanglingReferences` (added by L2-DELREFS).
  Not edited (out of scope); my test's stub includes it.

## Next actions / blockers

None for this unit. Browser gate owns AC1/AC2/AC3 on :5193/:3093 after merge; the default
`config/journey/capabilities` directory does not exist yet (u4 seed unit), so the shipped default
currently answers `capabilities: []` with one named diagnostic — by design, never a 500.

Commit 444d120d6ddacdd0785d6b951f4c7f829c1c070d is the commit whose tree first carries this report
(its parent chain holds the u3route code commits 167119b91e715a076f959bdf2563aba412667007 and
cc139097); the marker token order and sha below were corrected in this follow-up commit, which
changes no product file.

L2-JOURNEY-CAPABILITY-CATALOGUE-1 UNIT 3 DONE 444d120d6ddacdd0785d6b951f4c7f829c1c070d
