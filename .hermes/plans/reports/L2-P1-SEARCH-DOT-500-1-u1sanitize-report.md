# L2-P1-SEARCH-DOT-500-1 / u1sanitize — report

Lane 2 · worktree /home/brad/cl-wt/L2-P1-SEARCH-DOT-500-1-u1sanitize-lane2 · branch cl/lane2-p1searchdot-u1-2305 · base 9b247778bfae31400028ed2b81d8532343a474bb

## What the defect was
POST /api/search/jsonld returned 500 {"error":"Search failed"} whenever the query q
contained a literal period: SQLite FTS5 parses a bare `.` as a column filter
(`fts5: syntax error near "."`), the throw is caught by the blanket catch-all at
server/src/api/handlers/JsonLdSearchHandlers.ts:40 and surfaced as a 500.
The gate-8 absence card's mount search (q = 'thermo optical-quality imaging plate,
384-well, black-walled, clear bottom (cat. a58941)') therefore 500'd on every mount.

## RED (raw output, on base + new test, commit d915816ba)
Command (from server/): `npx vitest run src/jsonld-index/JsonLdIndex.test.ts`

```
 ❯ src/jsonld-index/JsonLdIndex.test.ts  (12 tests | 1 failed) 25ms
   ❯ src/jsonld-index/JsonLdIndex.test.ts > JsonLdIndex > sanitizes operator characters in q so user input cannot break syntax
     → fts5: syntax error near ","

 FAIL src/jsonld-index/JsonLdIndex.test.ts > JsonLdIndex > sanitizes operator characters in q so user input cannot break syntax
SqliteError: fts5: syntax error near ","
 ❯ JsonLdIndex.query src/jsonld-index/JsonLdIndex.ts:208:8
    206|         `SELECT COUNT(*) AS c FROM ${fromClause} ${whereSql}`,
    207|       )
    208|       .get(filters.params);
       |        ^
    209|     const total = totalRow?.c ?? 0;
    210|   }
 ❯ src/jsonld-index/JsonLdIndex.test.ts:169:24
Serialized Error: { code: 'SQLITE_ERROR' }

 Test Files  1 failed (1)
      Tests  1 failed | 11 passed (12)
```

The new leg (inside the existing sanitize test, extended per brief): upsert of
recordId 'LBW-THERMO', kind 'labware', fullText
'Thermo imaging plate, 384-well, clear bottom (cat. a58941)'; query
q 'thermo plate, clear bottom (cat. a58941)' must return >=1 hit containing
LBW-THERMO. On base it THROWS (above).

## The fix (commit 03a0fb3df), one line, server/src/jsonld-index/JsonLdIndex.ts:441
BEFORE: `    .replace(/["()*:^<>-]/g, ' ')`
AFTER:  `    .replace(/["()*:^<>\-,\.]/g, ' ')`

The period is neutralised by replacement with a SPACE (preferred over deletion,
per brief) so `cat. a58941` becomes the two tokens `cat*` + `a58941*` — NOT glued
to `cata58941` — and the catalogue-number token still matches (test asserts the
hit list contains LBW-THERMO, total >= 1).

## Deviation from brief — measured, AC1 forces it
The brief pinned the RED q as 'thermo plate, clear bottom (cat. a58941)' and said
neutralise ".". Measured on this SQLite build (better-sqlite3 12.10.0, Node
v26.8.1): a bare COMMA in an FTS5 MATCH string is ALSO a syntax error
(`plate*` OK, `plate,*` and `a, b` → `fts5: syntax error near ","`), so
neutralising only `.` still threw on the catalogue sentence (which contains
commas). AC1's full sentence
('thermo optical-quality imaging plate, 384-well, black-walled, clear bottom
(cat. a58941)') contains commas, so `,` is neutralised alongside `.`. Both are
replaced with a space; no token is glued; the prefix-star line (446), the
query() signature, pagination and the handler catch-all are untouched.

## GREEN (raw output, final commit, from server/)
Command: `npx vitest run src/jsonld-index/JsonLdIndex.test.ts`

```
 ✓ src/jsonld-index/JsonLdIndex.test.ts  (12 tests) 21ms

 Test Files  1 passed (1)
      Tests  12 passed (12)
   Start at: 18:25:32
   Duration  463ms (transform 42ms, setup 0ms, collect 156ms, tests 21ms, environment 0ms, prepare 147ms)
```

Note on test count: the brief's "baseline 13" is off by one — the baseline file
has 12 tests (verified by a clean run on base 9b247778b: `Tests  12 passed (12)`);
the extension is added INSIDE the existing sanitize test (per brief: "extend THIS
test"), so the final total is 12, all passing. The two AC2 assertions
(`pcr ("mix` → total 1, `pcr<mix` → total 1) are the existing assertions inside
the same test and still pass.

## Typecheck
`npx tsc --noEmit` from server/: 410 errors on base AND on HEAD (identical count;
zero in any jsonld-index file). They are environmental — the lane worktree has no
root node_modules (pnpm install absent), so I symlinked node_modules from the
sibling lane worktree L2-SEEDLAB-u3-lane2 (gitignored; lockfiles differ but all
server deps resolve at the exact required versions: better-sqlite3 12.10.0,
vitest 1.6.1, typescript 5.9.3). No signature was touched by this change; the
delta is a regex literal. The symlink was removed at exit; the tree is clean.

## AC evidence
- AC1: unit-level equivalent green (test q 'thermo plate, clear bottom
  (cat. a58941)' against a doc containing the catalogue sentence returns the
  LBW-THERMO record, total >= 1). The full AC1 sentence differs only by extra
  words (optical-quality, 384-well, black-walled) — each sanitises to a plain
  prefix token; the lane-store LBW-THERMO record + browser/gate drive is the
  orchestrator/browser reviewer's lane.
- AC2: `pcr ("mix` and `pcr<mix` assertions (existing, same test) pass; plain
  q 'plate' style prefix queries covered by the 'full-text search with prefix
  matching' test — all 12 pass.
- AC3: only file changed is JsonLdIndex.ts (one regex line) plus the test file;
  JsonLdSearchHandlers.ts untouched (its blanket 500 remains for REAL failures);
  no endpoint behavior changed beyond queries containing `.`/`,` now 200ing.

## Commits (git log --oneline)
```
03a0fb3df fix(l2): L2-P1-SEARCH-DOT-500-1 u1sanitize — neutralise '.' (and ',') in sanitizeFtsQuery so FTS5 never parses them as syntax; 'cat. a58941' -> tokens cat* a58941* (not glued); catalogue-sentence query now returns the LBW-THERMO record instead of blanket 500. AC1 sentence contains commas, also FTS5 syntax errors on this SQLite build, so ',' is neutralised alongside '.'. Regex only; handler catch-all, query() signature, pagination and prefix-star untouched.
d915816ba test(l2): RED L2-P1-SEARCH-DOT-500-1 u1sanitize — q with literal period (catalogue sentence 'cat. a58941') throws FTS5 parse error -> blanket 500; pin catalogue-sentence query to LBW-THERMO labware doc
9b247778b handoff: lane2 tick l2t2550 (gate iter8 FIX-FUNCTIONAL 4 HIGH; AI-CHANNEL-COVERAGE u1declare dispatched; manifest fault self-resolved 995f8624d)
```

## Changed files (exactly the owned pair)
- server/src/jsonld-index/JsonLdIndex.ts (+1/-1, line 441 only)
- server/src/jsonld-index/JsonLdIndex.test.ts (+14, extension of the existing
  sanitize test)
`git -c core.fileMode=false status --short` at exit: empty (clean).

## Grounding
Governing line (architect-context-l2.md §2 + the honest-reason rule): the system
must never fabricate a result nor silently swallow a failure. The fix returns
REAL hits (the LBW-THERMO record) — it does not paper over the throw with an
empty 200 (the domain bait). No second authority created; no contract broken;
the 500 catch-all stays for genuine failures.

L2-P1-SEARCH-DOT-500-1 UNIT u1sanitize DONE bcd25919497417e58437464218d130a515736828
