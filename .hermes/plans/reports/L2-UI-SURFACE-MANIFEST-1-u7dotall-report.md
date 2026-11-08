# L2-UI-SURFACE-MANIFEST-1 — unit u7dotall

Worktree: /home/brad/cl-wt/wt-L2-UI-SURFACE-MANIFEST-1-u6checker
Branch: cl/lane2-ui-surface-manifest-1-u6checker

## What changed
- `scripts/check-ui-surfaces.py` only (2 files in this issue, the other is this report).
- `extract_route_elements` already compiled its `<Route ... element={...}/>`
  matcher with `re.DOTALL` from e9db2e35 (cycle-2 FIX-1); that fix is RETAINED
  and this leg closes the consumer half that the reviewer flagged as bait #1.
- `classify_non_page_routes`: collapses layout whitespace in the captured
  element before matching `ELEMENT_SHAPE_RULES`, so BOTH a multiline element
  body and a tag name followed by a newline (`<Navigate\n to=...`) hit the
  shape table instead of silently falling into `page_routes`.
- `_shape_detail`: redirect regex compiled with `re.S` so an object-literal
  `to={...}` spread over lines still yields a target.
- `main`: added a non-tautological covered-route guard
  `len(route_elements) == route_count` above the existing bucket-sum assert.

## Census (real app/src/App.tsx)
- Before (425de214 baseline + prior DOTALL): `ROUTES=41 DECLARED=7 MISSING=34 PHANTOM=0 CATCHALL=1 REDIRECT=2 SLOT-HOST=1`, `UNRESOLVED-IMPORTS=0`, exit 0.
- After: `ROUTES=41 DECLARED=7 MISSING=34 PHANTOM=0 CATCHALL=1 REDIRECT=2 SLOT-HOST=1`, `UNRESOLVED-IMPORTS=0`, exit 0 — EXACT pin, no drift.
- `deliverables/ui-surface-manifest-1/orphans.txt` sha256 unchanged:
  `6b12e355968f00bbf5756b0db2694c3afaead6689fe29e9065476cd13dca0afb` (before and after).

## Evidence (raw, probes in /tmp/u7probe, deleted before exit)
RED — pre-fix script (git show 425de214:scripts/check-ui-surfaces.py):
  [prefix] extract_route_elements -> {'/a': '<APage />'}
  [prefix] classify /b -> redirect=[] slot=[] catchall=[] page=['/b']
GREEN — after:
  [new] extract_route_elements -> {'/a': '<APage />', '/b': '\n <Navigate to="/x" replace />\n ', '/c': '\n <Navigate\n to="/y"\n replace\n />\n '}
  [new] classify /b -> redirect=[('/b', "<Navigate to='/x'>")] slot=[] catchall=[] page=[]
  [new] classify /c -> redirect=[('/c', "<Navigate to='/y'>")] slot=[] catchall=[] page=[]
Bucket membership proven, not just key capture (bait #1).

## Bait #2 — assert tautology, demonstrated
Same synthetic App, unmatched = ['/a','/b','/c']:
  [old] buckets: REDIRECT=0 ... bucket-sum assert would hold: 3 == 3 -> True   (two redirects silently dropped)
  [new] buckets: REDIRECT=2 ... bucket-sum assert would hold: 3 == 3 -> True
Old passes the sum assert with REDIRECT=0; new reports REDIRECT=2. The added
coverage assert (`len(route_elements) == route_count`, 1 vs 3 here) is the
non-tautological guard that catches this.

## Edge probe / residual (bait #4)
- Multiline `<Slot\n name="sidebar"\n/>` -> `[('/s', '<Slot name="sidebar">')]` slot-host. PASS.
- Nested-brace `element={<Foo bar={{ a: 1 }} />}` -> captured `'<Foo bar={{ a: 1 }'`:
  the non-greedy capture stops at the inner `}`; the truncated body still
  classifies as a page route (no misbucket; no `<Navigate`/`<Slot` marker), so
  census is unaffected. Residual NOT rebuilt (brace parser would exceed the
  smallest-fix budget); reported here.
- No hardcoded route/component names: shape table at :160 remains the only
  vocabulary; new literals are whitespace/regex only. `re.S` only.

## Verification (commands run in the worktree)
- `python3 scripts/check-ui-surfaces.py` -> exit 0, census line exact as above.
- `/tmp/u7probe/probe.py` against pre-fix and fixed script -> RED/GREEN above.
- `python3 -c "import ast;ast.parse(open('scripts/check-ui-surfaces.py').read())"` -> silent.
- `git -c core.fileMode=false status --short` -> only the pre-existing untracked
  advc review file (not mine; left alone).

## Marker hygiene (FIX-2)
Work commit is 732ce99760f0858f32e181968be5f8138f5fb728 (code only). This
report is a NEW file so the launcher's first-marker reader does not hit the
u6 report's :87. Marker names the work commit; marker line is committed in the
next commit (no history rewrite). Report commit sha omitted rather than guessed.

L2-UI-SURFACE-MANIFEST-1 UNIT u7dotall DONE 732ce99760f0858f32e181968be5f8138f5fb728
