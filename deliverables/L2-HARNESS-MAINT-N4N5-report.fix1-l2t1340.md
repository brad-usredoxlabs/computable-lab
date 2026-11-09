# L2-HARNESS-MAINT-N4N5 — FIX RUN 1 (l2t1340, lane 2, harness-dir-only)

Branch: cl/lane2-harness-maint-n4n5 (prior HEAD 3b3ca7e9).
Code commit (fix1): 481c776a2b5439e828315276210ffd91d566b30a
All git commands: `git -c core.fileMode=false`. No npm install (node_modules
symlinks). No :3093/:5193 contact; no full/fake journey runs; scratch under
/tmp/n4n5-fix1, removed at the end.

## 1. Defect fixed (advc cycle-1 DEFECT 1, MAJOR)

The N4 identity snapshot does not catch the ITEM-CITED no-delete shape
`Object.getPrototypeOf(context).route.call(...)` (own wrapper intact) — it
bites only the DELETE variant — and comment/violation-text/report §5 read as
if the cited shape were covered. Fix per reviewer direction: honest
disclosure + narrowed text + limitation pin. No detection mechanism was
claimed for the undetectable class.

## 2. RED captures (pre-fix, my own P1 no-delete silent-green proof)

Probe: /tmp copies of ui-drive.cjs at HEAD 3b3ca7e9 (script
/tmp/n4n5-fix1/red_p1_pre.py; capture file /tmp/n4n5-fix1/red-pre-captures.txt),
unroutable app-base http://127.0.0.1:9, symlinked node_modules:

    VARIANT=P1-context rc=1 route_handlers_used=0 route_api_wrapped=True   (silent green)
    VARIANT=P3-page    rc=1 route_handlers_used=0 route_api_wrapped=True   (silent green)
    VARIANT=P2-delete  rc=1 route_handlers_used=0 route_api_wrapped=False  (bites)

P1/P3 reproduce the reviewer's finding exactly: the cited no-delete shape
passes the tripwire. Text-level RED: the pre-fix comment (ui-drive.cjs:52-57)
claimed "a prototype-chain detour ... flips false" generally and the
pre-fix violation text (run-journeys.py:497-502) said "false = the wrapper
identities were detoured/swapped, e.g. a prototype-chain extraction of the
original route method" — an overclaim against P1/P3 evidence.

## 3. Changes (owned files only)

1. ui-drive.cjs comment block (~:42-77): states the snapshot bites the
   DELETE variant ONLY; adds named residual gap (d): the no-delete
   prototype-chain call leaves the own wrapper intact, route_api_wrapped
   stays TRUE while the original runs (counter 0), UNDETECTABLE by any
   property/identity inspection from node; the construction ban + the
   real-transport ai_request_bodies receipt are the defense for that class.
2. run-journeys.py: violation text narrowed — "false" now names the
   delete/replace variant only and points at the ui-drive.cjs comment for
   the no-delete named residual; the attestation_violations header comment
   narrowed the same way.
3. test-channel-selfcheck.py: NEW arm (2e) "N4 LIMITATION PIN (no-delete
   prototype call stays TRUE = known residual, not a detection claim)":
   injects the P1 shape (NO delete) on a throwaway copy and asserts
   route_handlers_used == 0 AND route_api_wrapped is True — pinning the
   LIMITATION (labelled as such, not a pass claim) so the overclaim cannot
   silently return. (2d) kept unchanged as the biting DELETE-variant arm.
4. Report §5 of L2-HARNESS-MAINT-N4N5-report.l2t1110.md: append-only
   AMENDMENT item 5 naming the no-delete shape as the undetectable residual
   (history above it untouched).

ZERO product code, ZERO YAML, no receipt-directory edits.

## 4. Green outputs (post-fix)

- `node --check ui-drive.cjs` -> NODE-CHECK-OK.
- `python3 test-channel-selfcheck.py` -> rc=0, "SELFCHECK: PASS",
  51 OK lines (50 -> 51: the new (2e) limitation pin; none removed).
  Captured line: "N4 LIMITATION PIN (no-delete prototype call stays TRUE =
  known residual, not a detection claim) OK"
  (full output: /tmp/n4n5-fix1/selfcheck-green.txt).
- `python3 check-gate.py` over the REAL lane receipts root -> rc=0,
  "GATE-VERDICT green" (J1/J2/J3 green; /tmp/n4n5-fix1/gate-green.txt).
- Post-fix P1 probe (same scratch script): rc=1 route_handlers_used=0
  route_api_wrapped=True — the residual is unchanged BY DESIGN (behavior
  pinned, disclosure fixed); /tmp/n4n5-fix1/post-p1.txt.

## 5. Diff stat (working tree vs 3b3ca7e9, code commit 481c776a)

    run-journeys.py              | 19 ++++---
    test-channel-selfcheck.py    | 60 ++++++++++++++++++++++
    ui-drive.cjs                 | 25 ++++++---
    report.l2t1110.md (this + §5 amendment) | 14 +++++
    4 files changed, 105 insertions(+), 13 deletions(-)

Remaining issues: none for D1. The no-delete class remains an honest,
named, pinned residual — per the reviewer's own fix direction, detection of
that class is out of scope for a node-side tripwire.

N4N5 FIX1 DONE 481c776a2b5439e828315276210ffd91d566b30a
