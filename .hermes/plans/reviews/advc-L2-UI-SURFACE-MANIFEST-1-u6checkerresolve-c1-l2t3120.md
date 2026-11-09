ADVERSARIAL REVIEW — L2-UI-SURFACE-MANIFEST-1 / unit u6checkerresolve (cycle 1)

Reviewer: cl-adversarial-reviewer (deepseek/deepseek-v4.1-flash)
Worktree: /home/brad/cl-wt/wt-L2-UI-SURFACE-MANIFEST-1-u6checker
Branch:   cl/lane2-ui-surface-manifest-1-u6checker
Delta:    20797969..HEAD (b300876a code + report body, 425de214 marker commit)
Files in delta (git diff --name-only 20797969..HEAD):
  scripts/check-ui-surfaces.py
  .hermes/plans/reports/L2-UI-SURFACE-MANIFEST-1-u6checkerresolve-report.md
(relocated by the brief to .hermes/plans/reports/; deliverables/ui-surface-manifest-1/ holds only orphans.txt.)

VERDICT: FIX  (1 MAJOR, 1 MINOR; core unit claim verified green otherwise)

=====================================================================
ACCEPTANCE CRITERIA (verbatim from the brief) AND HOW I CHECKED EACH
=====================================================================
AC1 census: "ROUTES=41 DECLARED=7 MISSING=34 PHANTOM=0 CATCHALL=1 plus
    REDIRECT=2 SLOT-HOST=1, and UNRESOLVED-IMPORTS=0".
    CHECKED — ran the checker in the worktree (output quoted below); exact match.

AC2 shape-driven classification as data; "do not hardcode the three route
    strings ... the classification must follow the element shape in App.tsx,
    so a fourth redirect route added later is classified automatically" (B3).
    CHECKED — grepped the script for every literal route path (none); inserted a
    4th <Navigate to="/chat" replace /> route in a /tmp copy -> REDIRECT=3.
    Confirmed shape-driven. NOTE: holds only for single-line elements (see FIX-1).

AC3 "MISSING must stay 34"; "never by deleting a route from extract_routes or
    by swallowing the append at :303/:307".
    CHECKED — ran the checker on trunk /mnt/vast/home/brad/git/cl-integration-2
    (baseline MISSING=34 UNRESOLVED-IMPORTS=3) and in the worktree (MISSING=34).
    extract_routes untouched; classify_non_page_routes re-buckets, does not drop.

AC4 unchanged internals: lazy-spec resolution + exit-1 guard, PHANTOM, chat-host
    axis, orphan scan, census token order up to CATCHALL.
    CHECKED — corrupted a lazy specifier in /tmp copy -> ERROR + EXIT=1. Census
    token prefix byte-identical up to CATCHALL=.

AC5 non-vacuity both directions.
    CHECKED — deleted the "/analysis" surface entry in /tmp copy ->
    DECLARED=6 MISSING=35 naming /analysis; restored -> DECLARED=7 MISSING=34.

AC6 `python3 -c "ast.parse(...)"` silent.
    CHECKED — silent (script is valid Python; runs to completion).

AC7 tree clean at exit; diff exactly the two owned files.
    CHECKED — git -c core.fileMode=false status --short clean; diff --name-only
    = the two files above. config/ui/surfaces.yaml and app/src/App.tsx untouched.

AC8 report cites the DONE marker and real command output.
    CHECKED — marker present (see FIX-2 for its provenance defect); the quoted
    RED/GREEN outputs reproduce.

=====================================================================
RAW COMMAND OUTPUTS (run in the worktree unless noted)
=====================================================================
$ cd /home/brad/cl-wt/wt-L2-UI-SURFACE-MANIFEST-1-u6checker
$ python3 scripts/check-ui-surfaces.py
EXIT=0
ROUTES=41 DECLARED=7 MISSING=34 PHANTOM=0 CATCHALL=1 REDIRECT=2 SLOT-HOST=1
--- Non-page route shapes ---
  catch-all: 1
    * — path '*' (router catch-all)
  redirect: 2
    /protocol-builder — <Navigate to='/ingestion'>
    /project/:studyId/run/:runId — RunWorkspaceRedirect renders <Navigate to="runId ? `/runs/${runId}` : '/runs'">
  slot-host: 1
    /event-editor/fixit — <Slot name="event-editor.fix-it-route">
  Routes without chat-surface mount: 27   (redirect/slot/catch routes removed from that list)
$ python3 scripts/check-ui-surfaces.py 2>&1 1>/dev/null
UNRESOLVED-IMPORTS=0
$ cd /mnt/vast/home/brad/git/cl-integration-2 && python3 scripts/check-ui-surfaces.py 2>&1 | grep -E 'ROUTES=|UNRESOLVED|no element'
UNRESOLVED-IMPORTS=3
ROUTES=41 DECLARED=7 MISSING=34 PHANTOM=0 CATCHALL=1
    /event-editor/fixit — no lazy import for Slot
    /protocol-builder — no element resolved
    /project/:studyId/run/:runId — no element resolved
    * — no element resolved
$ python3 -c "import ast,sys; ast.parse(open('scripts/check-ui-surfaces.py').read())"   # silent
$ git -c core.fileMode=false status --short                                              # (clean)

Structural probe (all 41 routes captured, correct element bodies):
  routes extracted by extract_routes: 41 catchall: 1
  route elements captured: 41
  routes NOT captured by extract_route_elements: []
  '/event-editor/fixit' -> '<DeferredRoute><Slot name="event-editor.fix-it-route" /></DeferredRoute>'
  '/protocol-builder'   -> '<Navigate to="/ingestion" replace />'
  '/project/:studyId/run/:runId' -> '<RunWorkspaceRedirect />'
  '*'                   -> '<NotFoundRoute />'

B1 (fake resolution) — /tmp copy:
  bogus page route /bogus-review-route -> ROUTES=42 DECLARED=7 MISSING=35 (names it)
  corrupt lazy spec ./chat/NoSuchPage  -> ERROR: lazy specifier ... does not resolve / EXIT=1
  missing ?raw target (chat-hosts.yaml?raw -> NO_SUCH_FILE) -> UNRESOLVED-IMPORTS=1
    (the split("?",1)[0] does NOT swallow a genuine miss)

B3 (shape-driven) — /tmp copy, 4th <Navigate to="/chat"> route:
  ROUTES=42 DECLARED=7 MISSING=35 PHANTOM=0 CATCHALL=1 REDIRECT=3 SLOT-HOST=1
  /tmp-probe-redirect — <Navigate to='/chat'>

Non-vacuity — /tmp copy:
  remove "/analysis" surface entry -> DECLARED=6 MISSING=35 naming /analysis
  restore                         -> DECLARED=7 MISSING=34

=====================================================================
DEFECTS
=====================================================================
FIX-1  [MAJOR]  scripts/check-ui-surfaces.py:171  (extract_route_elements)
  Rule violated: the brief's B3 property ("a fourth redirect route added later
  is classified automatically") and reviewer check #4 ("a silent undercount is
  a defect").
  The regex `<Route\s+path="([^"]+)"\s+element=\{(.+?)\}\s*/>` is compiled with
  NO re.DOTALL, so `.` cannot cross a newline. When a Route's ELEMENT is
  formatted across lines (exactly what Prettier does to a long `element={...}`),
  the route is silently absent from route_elements: it is not matched by any
  shape rule, falls into `remaining`/page_routes, prints "no element resolved",
  and the census REDIRECT / SLOT-HOST silently undercounts while MISSING stays
  34 and NOTHING errors or warns. Reproduced end-to-end (element on the next
  line for /protocol-builder):
      ROUTES=41 DECLARED=7 MISSING=34 PHANTOM=0 CATCHALL=1 REDIRECT=1 SLOT-HOST=1
        /protocol-builder — no element resolved
  (REDIRECT 2->1, no failure). Path-on-its-own-line is fine; only the element
  body triggers it. The `assert` at :438 does NOT catch this — see OBS-1 — so
  nothing guards the undercount.
  Fix direction: compile extract_route_elements with re.DOTALL (and/or replace
  the regex with a brace-depth scanner), AND add a coverage assertion that every
  path returned by extract_routes() is present in route_elements (fail loud, do
  not fall through to `remaining`).

FIX-2  [MINOR]  .hermes/plans/reports/L2-UI-SURFACE-MANIFEST-1-u6checkerresolve-report.md:87
  (DONE marker provenance)
  The marker `DONE b300876a2373d084e0a1781cd702d87c3007abcd` names commit
  b300876a, which does NOT contain the marker line — the marker was appended in
  the following/containing commit 425de214 (HEAD).
      $ git show b300876a:.hermes/plans/reports/...report.md | tail -1
        ...are untouched and remain with the orchestrator; no facts invented here.
      $ git show HEAD:.hermes/plans/reports/...report.md | tail -1
        L2-UI-SURFACE-MANIFEST-1 UNIT u6checkerresolve DONE b300876a...
  So a reader who checks out the marker sha finds a report that lacks the marker:
  the marker is self-referentially off by one commit (names the parent). The
  brief's "sha read from git rev-parse HEAD" wording produces this; still a
  provenance defect per repo convention (marker should name the containing
  commit). Fix direction: have the marker name the commit that contains it
  (append marker, commit, then have the marker cite that commit — or the
  orchestrator's convention should pin a commit whose tree carries the marker).

=====================================================================
OBSERVATIONS (not defects)
=====================================================================
OBS-1  scripts/check-ui-surfaces.py:438 — the assert
  `redirects+slot_hosts+catchalls+page_routes == missing_count` is tautological:
  classify_non_page_routes appends EVERY unmatched path to exactly one bucket
  (remaining when no shape matches), so the sum can never differ from
  len(unmatched). It is decorative; the real invariant (every extract_routes
  path present in route_elements) is unwatched — that gap is what lets FIX-1
  pass silently.
OBS-2  scripts/check-ui-surfaces.py:161-162 — markers "<Navigate " and "<Slot "
  require a trailing space, so a no-space `<Navigate/>` element would not
  classify. Not present in the current App.tsx; latent only.
OBS-3  Report line 77-78 self-stat says "report ~60 lines"; the report is 87
  lines. Cosmetic self-report inaccuracy.
OBS-4  Report location: the brief's SCOPE names .hermes/plans/reports/ and the
  report is there; the task-handoff paraphrase ("deliverables/ui-surface-manifest-1/")
  is not the brief's path. Not a defect — the report exists and is found.

=====================================================================
CRITERIA I COULD NOT FULLY INDEPENDENTLY RE-DERIVE
=====================================================================
- The report's diagnosis that the trunk UNRESOLVED-IMPORTS=3 are exactly the
  three `?raw` YAML imports: corroborated, not independently proven at trunk.
  I confirmed the three import sites exist and their YAML targets exist
  (composition-fraction-convention.yaml, composition-participation-convention.yaml,
  chat-hosts.yaml), and that non-test `?raw` importers are exactly these three
  (test-file ?raw imports are excluded by find_orphans). Consistent.

=====================================================================
EVIDENCE HYGIiene
=====================================================================
All probing was done in /tmp copies; the candidate worktree's only change from
my session is this review file (untracked). I removed a scripts/__pycache__/
my import-based probe created; `git status --short` is clean again. I made no
edits to the reviewed files, did not commit, and did not touch config or App.tsx.

VERDICT: FIX
