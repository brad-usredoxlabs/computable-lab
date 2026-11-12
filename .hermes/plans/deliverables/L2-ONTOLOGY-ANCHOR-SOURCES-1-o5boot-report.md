# L2-ONTOLOGY-ANCHOR-SOURCES-1 — unit o5boot (lane 2)

Worktree: /home/brad/cl-wt/L2-ONTO-SRC-o5boot-lane2
Branch: cl/lane2-ontologysrc-o5boot-1355
Base: 8d964dce81533f6d7fa70077853b059d60d91dcd (trunk cl/integration-2 tip at compose)

## Decisions
- Added ONE exported function `warmLocalOboSources(options)` to localObo.ts, reusing the
  existing `loadLocalOboSources` + `loadTerms` (parse-once cache, successful parses only).
  No second parser/registry reader, no source id/prefix/path literal in TS.
- `searchLocalObo` untouched: same signature, return shape, failure shape, cache semantics.
- Boot wiring in server.ts is deferred with `setImmediate` (a synchronous warm must not block
  the boot sequence), fire-and-forget, silent on success, ONE `console.warn` per failed source
  carrying id + path + error. Registry-level read failure is warned once with its message,
  never rethrown, so boot cannot fail on an unreadable registry.
- Registry YAML and schema untouched (read-only DATA). No caching of the registry or of the
  warm result: `loadLocalOboSources` is called per invocation.

## Changed files (3 files, +82 / -2)
- server/src/resolve/providers/localObo.ts  — `warmLocalOboSources` (+19)
- server/src/server.ts                      — boot warm block after the OLS4 warm (+21)
- server/src/resolve/providers/localObo.test.ts — cases (d)/(e) + row helper (+44/-2)

Commits:
- a40c0ef2 o5boot: RED pins (d)(e) for boot warm of local-obo sources
- a9de3505 o5boot: warmLocalOboSources — boot warm over enabled local-obo rows
- bff41f40 o5boot: warm local-obo sources at boot; one named warn per failed source

## Verification (raw)
RED (before the function existed):
  ❯ src/resolve/providers/localObo.test.ts  (5 tests | 2 failed) 44ms
  TypeError: warmLocalOboSources is not a function
  Test Files  1 failed (1)
       Tests  2 failed | 3 passed (5)

Targeted tests (after implementation):
  ✓ src/resolve/providers/localObo.test.ts  (5 tests) 15ms
  Test Files  1 passed (1)
       Tests  5 passed (5)
  Duration  1.79s

Typecheck (one run, final):
  cd server && npx tsc --noEmit → tsc_rc=0, zero output lines.

Mutation probe (`return [];` unconditionally):
  expect(statuses).toHaveLength(2)
  - 2
  + 0
  Test Files  1 failed (1)
       Tests  2 failed | 3 passed (5)
  Reverted; `git status --short` empty; targeted suite back to 5 passed.

Boot leg — healthy (this worktree, PORT=3095, lane2 config, CL_DATA_DIR in scratch):
  grep -c 'local-obo source' .run/backend.log → 0 (zero lines)
  curl /api/health → health_http=200
  curl '/api/ontology/search?q=plate' → LWO:0000100 labware, LWO:0000120 microplate,
    LWO:0000121 well plate (LWO rows returned)

Boot leg — broken registry (AC1): scratch copy of the worktree (config/ copied, not the
committed file), leq path pointed at a missing file, PORT=3096:
  local-obo source leq failed to load from /home/brad/.ont-o5boot-scratch/missing-leq.obo:
    ENOENT: no such file or directory, open '/home/brad/.ont-o5boot-scratch/missing-leq.obo'
  warn line count: 1
  curl /api/health → health_http=200
  (lwo still served: LWO:0000100 in the search response)

Literal boundary (AC2): grep -i 'lwo\|leq' over server.ts and localObo.ts → rc=1 (no match).
Lane 2 stack :3093 left untouched and still answers 200; scratch dir deleted.

Tree: `git -c core.fileMode=false status --short` → clean at exit.

STATUS: complete

L2-ONTOLOGY-ANCHOR-SOURCES-1-o5boot UNIT unit DONE bff41f407e5c3b4863d12494e8ec90af842c0be7
