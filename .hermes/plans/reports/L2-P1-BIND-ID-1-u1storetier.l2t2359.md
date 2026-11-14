# REPORT — L2-P1-BIND-ID-1 / unit u1storetier

Worktree: /home/brad/cl-wt/L2-P1-BIND-ID-1-u1storetier-lane2
Branch: cl/lane2-p1-bindid-u1storetier-2359
Base: 9d53ec3aaf248be02020892302426e1166977be0
Coder: cl-coder-fallback (deepseek-v4.1-flash via OpenRouter; appliance-2 unreachable)

## Grounding quoted before acting

architect-context-l2.md §2 item 7:
  "**Identity is a record id, never a name.** Names, labels and aliases only pre-select a candidate;
   a miss is a named unresolved slot."
Owning decision: `.hermes/plans/decisions/LABWARE-INSTANCE-DEFINITION-IDENTITY-l2-20261113.md`
(and the unit's named decision, `DEFINITION-IDENTITY-UNIQUENESS-l2-20261113.md`: one id minted once,
two read sources unioned, no name/slug bridge).

## What changed

1. `server/src/api/labwareDefinitionSearch.ts`
   - `searchLabwareDefinitions` now returns `{ hits, total, storeTier }` (hits/total semantics
     unchanged). `storeTier` is the discriminated union
     `{ status: 'searched' } | { status: 'unavailable'; reason: string }` — no optional `reason`,
     so `exactOptionalPropertyTypes` is satisfied without assigning `undefined`.
   - Absent store → `{ status: 'unavailable', reason: 'no-store' }`.
   - `list()` throws → `{ status: 'unavailable', reason: <message || name || String(error)> }`;
     the vendored tier still renders (the old bare `catch {}` is gone, and its comment no longer
     promises silence).
   - Union order, dedupe key (`def.id`, registry wins), `fold`, every-token matching, limit clamp
     (1..50, default 12) and `toHit`/`lwoClass` are untouched.
2. `server/src/server.ts` — exactly one added option plus its one-line comment inside the
   `routeOpts` literal: `recordStore: ctx.store,`. Nothing else in that file.
3. `server/src/api/labwareDefinitionSearch.test.ts` — five new cases in the existing file:
   seed-shaped store payloads (mirroring the two shipped YAML records) returning both 12-channel
   records BY recordId with `storeTier.searched`; a route-level case through the real
   `registerRoutes` + `app.inject`; the two AC2 branches (no store / throwing store); and a
   textual wiring pin on `server.ts`'s `routeOpts` literal.

Commits:
  a58f1e1c  u1storetier: RED — pin the record-store tier and its honest status (5 fail, 9 pass)
  6012f3cb  u1storetier: wire the record store into routeOpts and report the store tier (14/14 green)

## RED first (raw, at a58f1e1c, before the fix)

```
→ expected undefined to deeply equal { status: 'searched' }
→ Cannot read properties of undefined (reading 'status')
→ expected undefined to deeply equal { status: 'unavailable', …(1) }
→ Cannot read properties of undefined (reading 'status')
→ expected 'const routeOpts: import('./api/route…' to match /recordStore:\s*ctx\.store,/
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  ... > returns the shipped 12-channel records by recordId, and says it searched the store
 FAIL  ... > route: POST /labware-definitions/search reaches the store through registerRoutes
 FAIL  ... > AC2: no store is reported, not hidden, and the registry tier still renders
 FAIL  ... > AC2: a store whose list() throws is reported, and the registry tier still renders
 FAIL  ... > wiring: server.ts routeOpts hands ctx.store to the search route
      Tests  5 failed | 9 passed (14)
```

## GREEN on the final commit

`cd .../server && pnpm exec vitest run src/api/labwareDefinitionSearch.test.ts`

```
 RUN  v1.6.1 /home/brad/cl-wt/L2-P1-BIND-ID-1-u1storetier-lane2/server
 ✓ src/api/labwareDefinitionSearch.test.ts  (14 tests) 1786ms
 Test Files  1 passed (1)
      Tests  14 passed (14)
```
The 9 pre-existing tests pass unchanged (baseline 9 passed; now 14).

## Mutation probes (applied, run, reverted; tree clean after)

Mutation 1 — removed ONLY `recordStore: ctx.store,` (and its comment) from `routeOpts`:
```
 FAIL  ... > wiring: server.ts routeOpts hands ctx.store to the search route
      Tests  1 failed | 13 passed (14)
```
Honest limit: the route-level case stays GREEN under mutation 1 because it builds its own
`RouteOptions` and cannot see `server.ts`'s inline literal (that literal is assembled inside the
boot closure; no unit harness reaches it). Rather than leave the caller pin unobservable — which
is exactly the false-pin trap the brief names — the wiring is pinned textually (the wiring case
above), and the route-level case pins the OTHER end: with `store: recordStore` absent at
routes.ts:1021 the response would be `storeTier.status === 'unavailable'`, so that case fails.
I did not edit prohibited `routes.ts` to prove it; the RED run already showed that case fails when
the store read does not surface. Net: both ends of the wiring have a pin; the pins are of different
kinds and I say so rather than claim a runtime proof I do not have.

Mutation 2 — restored the bare-catch shape (reason replaced by a constant, the thrown error
dropped):
```
→ expected 'list-failed' to be 'store offline' // Object.is equality
 FAIL  ... > AC2: a store whose list() throws is reported, and the registry tier still renders
      Tests  1 failed | 13 passed (14)
```

## Typecheck

`cd .../server && pnpm exec tsc --noEmit -p tsconfig.json` → no output, `TSC_EXIT=0`, 0 errors.
No error names any of the three owned files. Measured 0, NOT the brief's baseline of 6 — the
repository wins, and I report the disagreement: at this commit the four files the brief lists
(AIHandlers.ts, AiIngestionHandlers.ts, ExtractProtocolHandler.ts, sequences/sequenceRoutes.ts)
produce no diagnostics here. Also confirmed with `--incremental false`: still 0. Note
`tsconfig.json` excludes `**/*.test.ts`, so the test file is not typechecked by that command; it is
only exercised by vitest's transform. I am not claiming the test file is type-safe beyond what
vitest accepted.

## Stale brief claims found (repository wins)

1. The brief's "On `server/src/mcp/**`: `searchLabwareDefinitions({ q })` is called there
   deliberately without a store" does NOT hold in this tree: `grep -rn searchLabwareDefinitions`
   over `server/src` returns only `labwareDefinitionSearch.ts`, `routes.ts:82/1020`, and the test
   file. There is no MCP caller today, so there is no MCP call to preserve; the no-store status it
   would now receive is `{ status: 'unavailable', reason: 'no-store' }` regardless.
2. `server/src/api/handlers/InventoryShelfHandlers.test.ts` — the pattern the brief told me to
   copy — is itself RED in this tree when run anywhere: from `server/` its route import dies on the
   cwd-relative scientist-intent vocabulary (`join(process.cwd(),'schema',...)`), and from the repo
   root its stub lacks `recordHandlers.listDanglingReferences` (routes.ts:317). I adapted the stub
   (added that one member) and, inside the route case only, point `process.cwd` at the repo root
   for the dynamic `import('./routes.js')` and restore it in `finally` (vitest 1.6 workers forbid
   `process.chdir`, measured). That awkwardness is pre-existing harness debt, not introduced here.

## Not verified (stated plainly)

- AC1 (live): NOT run. It requires a restarted served revision, and the brief forbids restarting
  the lane stack. The read path and wiring are proven by tests; the live `POST
  /api/labware-definitions/search {"q":"12-channel"}` probe is owed by whoever restarts the stack.
- The browser-side consequence (clarifier offering the record) is explicitly waived by the brief;
  it is graded by the prompt-1 bundle re-drive.

## Scope

Files changed: exactly the three owned paths. `git -c core.fileMode=false status --short` clean at
exit. No installs, no scratch inside the worktree, no seed/records edits, no registry edits.

L2-P1-BIND-ID-1-u1storetier UNIT L2-P1-BIND-ID-1-u1storetier DONE 53db433489b66bb2bfdc0886619330e91cfaf67b
