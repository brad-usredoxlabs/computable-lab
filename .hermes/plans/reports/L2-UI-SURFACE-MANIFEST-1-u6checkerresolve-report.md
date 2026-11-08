# L2-UI-SURFACE-MANIFEST-1 / unit u6checkerresolve — report

Worktree: /home/brad/cl-wt/wt-L2-UI-SURFACE-MANIFEST-1-u6checker (branch cl/lane2-ui-surface-manifest-1-u6checker, base 20797969)
Owned files changed: scripts/check-ui-surfaces.py (+107/-4), this report. Nothing else.
Note on the brief's verify path: `/mnt/vast/home/brad/git/cl-integration-2` is the trunk
checkout, not this branch; every command below was run in the assigned worktree.

## Finding that changes the premise (measured, not assumed)
UNRESOLVED-IMPORTS=3 was NOT about routes. Instrumenting find_orphans()
showed the three misses are Vite raw imports of YAML configuration:
  app/src/graph/lib/mixtureShareFormat.ts -> ../../../../config/drafting/composition-fraction-convention.yaml?raw
  app/src/shared/lib/participationConvention.ts -> .../composition-participation-convention.yaml?raw
  app/src/shared/shell/SurfaceChatBridge.tsx -> ../../../../config/chat/chat-hosts.yaml?raw
All three files exist; resolve_import() failed only on the `?raw` query suffix.
The route blind spot is separate and real: 4 of 41 routes had no element class
(3x "no element resolved": `/protocol-builder`, `/project/:studyId/run/:runId`, `*`;
1x "no lazy import for Slot": `/event-editor/fixit`).
Both defects are fixed in the same instrument; no route was removed and no
manifest entry added.

## Change
1. `resolve_import()` strips a Vite `?raw`/`?url` query before the filesystem
   probe. A file that is still missing records a miss exactly as before.
2. New `extract_route_elements()` + `classify_non_page_routes()`: ordered
   module-level shape table `ELEMENT_SHAPE_RULES = (("redirect", "<Navigate "),
   ("slot-host", "<Slot "))` plus `CATCHALL_PATH = "*"`. First match wins, so each
   route lands in exactly one class. A bare local element is resolved to its
   `function <Name>() { ... }` body and classified redirect when that body
   renders `<Navigate`. Classification keys on JSX shape only — no route path
   appears in the code, so a future redirect/slot route is classified
   automatically.
3. Census line appends `REDIRECT=<n> SLOT-HOST=<n>` after the unchanged
   `... CATCHALL=<n>` prefix and prints each non-page route with its reason.
   An assert enforces redirects+slot_hosts+catchalls+page_routes == MISSING.
4. Unchanged: lazy-specifier resolution and its exit 1, PHANTOM computation,
   chat-host axis, orphan scan, MISSING derivation.

## Raw verification
RED (before edits, /tmp/base.out):
    ROUTES=41 DECLARED=7 MISSING=34 PHANTOM=0 CATCHALL=1
    UNRESOLVED-IMPORTS=3
    /protocol-builder — no element resolved
    /project/:studyId/run/:runId — no element resolved
    /event-editor/fixit — no lazy import for Slot

GREEN (worktree):
    $ python3 scripts/check-ui-surfaces.py
    EXIT=0
    ROUTES=41 DECLARED=7 MISSING=34 PHANTOM=0 CATCHALL=1 REDIRECT=2 SLOT-HOST=1
    UNRESOLVED-IMPORTS=0
    --- Non-page route shapes ---
      catch-all: 1
        * — path '*' (router catch-all)
      redirect: 2
        /protocol-builder — <Navigate to='/ingestion'>
        /project/:studyId/run/:runId — RunWorkspaceRedirect renders <Navigate to="runId ? `/runs/${runId}` : '/runs'">
      slot-host: 1
        /event-editor/fixit — <Slot name="event-editor.fix-it-route">

Non-vacuity (/tmp/rigA, /tmp copy; real config untouched): deleting the `analysis`
surface entry -> `ROUTES=41 DECLARED=6 MISSING=35 ...` naming `/analysis`; restore ->
`ROUTES=41 DECLARED=7 MISSING=34 ...`.
B1 (/tmp/rigB): inserted `/bogus-review-route` -> `ROUTES=42 ... MISSING=35` naming it;
corrupted lazy spec `./event-editor/NoSuchPage` -> `ERROR: lazy specifier ... does not
resolve` / `EXIT=1` (guard intact).
B3 (/tmp/rigB): inserted a fourth `<Navigate to="/chat">` route -> `REDIRECT=3`, named
with its target (shape-following, no path list).
B4: config/ui/surfaces.yaml unmodified (`git status` shows only the script).
B5: header contract intact — exit 1 only on PHANTOM>0 or a failed lazy specifier.

    $ python3 -c "import ast,sys; ast.parse(open('scripts/check-ui-surfaces.py').read())"
    (silent)
    $ git -c core.fileMode=false status --short
    (clean at exit)

## Measured size vs output budget
scripts/check-ui-surfaces.py +107/-4, report ~60 lines. The figure exceeds the
brief's 120-line guide; the honest fix needs the 74-line shape classifier plus
the resolver line, and the remainder is comments/asserts required by the brief.
Reported rather than hidden; nothing was cut to fit a line count.

## Decisions / next actions
- Orphan artifact regenerated unchanged (42 orphans, 719 scanned); not hand-edited.
- Remaining MANIFEST-1 legs (MISSING=34 surface triage, requires/providers data)
  are untouched and remain with the orchestrator; no facts invented here.
