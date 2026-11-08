ADVERSARIAL REVIEW — L2-UI-SURFACE-MANIFEST-1 / leg u6fix1 (fix cycle 2, review cycle 2)

Reviewer: cl-adversarial-reviewer (deepseek/deepseek-v4.1-flash)
Worktree: /home/brad/cl-wt/wt-L2-UI-SURFACE-MANIFEST-1-u6checker
Branch:   cl/lane2-ui-surface-manifest-1-u6checker
Delta under review: 425de214..27c9acdf ONLY
  (e9db2e35 = the one-line re.DOTALL fix; 27c9acdf = launcher WIP auto-commit carrying the report/marker edit + the tracked advc review artifact)

VERDICT: FIX   (1 MINOR; the cycle-1 MAJOR re.DOTALL defect is VERIFIED RESOLVED)

=====================================================================
DELTA CONTENT (git -c core.fileMode=false diff 425de214..27c9acdf)
=====================================================================
--stat:
  .hermes/plans/reports/L2-UI-SURFACE-MANIFEST-1-u6checkerresolve-report.md |  26 ++-
  .hermes/plans/reviews/advc-L2-UI-SURFACE-MANIFEST-1-u6checkerresolve-c1-l2t3120.md | 184 +++++++++++++++++
  scripts/check-ui-surfaces.py                                              |   2 +-
  3 files changed, 210 insertions(+), 2 deletions(-)

The ONLY code change is scripts/check-ui-surfaces.py line 171:
  -    pattern = re.compile(r'<Route\s+path="([^"]+)"\s+element=\{(.+?)\}\s*/>')
  +    pattern = re.compile(r'<Route\s+path="([^"]+)"\s+element=\{(.+?)\}\s*/>', re.DOTALL)
Nothing else in scripts/ changed (git diff --name-status lists exactly the 3 paths above).
e9db2e35 touched only scripts/check-ui-surfaces.py (1 file, +1/-1); 27c9acdf added the report edit + the advc review file. Confirmed with `git show --stat` on both.

=====================================================================
PRIOR-CYCLE DEFECTS RE-VERIFIED
=====================================================================
PRIOR FIX-1 [MAJOR] scripts/check-ui-surfaces.py:171 regex lacked re.DOTALL
  STATUS: RESOLVED. Re.DOTALL is present. I reproduced the multiline probe
  MYSELF (see below): fixed script keeps REDIRECT=2; pre-fix script (git show
  425de214:scripts/check-ui-surfaces.py, dropped into the same probe tree)
  drops to REDIRECT=1 with "/protocol-builder — no element resolved".
  Additional independent coverage probe: every one of the 41 paths returned by
  extract_routes() now has an element body in extract_route_elements()
  (paths without element body: []). The silent-drop hole is closed.

PRIOR FIX-2 [MINOR] DONE marker cited a commit that did not contain it
  STATUS: NOT RESOLVED (relabelled, same class). See FIX-1 below.

=====================================================================
CHECKS REQUESTED, AND WHAT I RAN
=====================================================================
[1] ONLY code change is re.DOTALL at line ~171, nothing else in scripts/.
    CHECKED — git diff --stat / --name-status 425de214..27c9acdf (quoted above).
    Confirmed: scripts/check-ui-surfaces.py, single hunk, +1/-1, line 171.
    No other scripts/ file appears in the delta.

[2] python3 scripts/check-ui-surfaces.py -> ROUTES=41 DECLARED=7 MISSING=34
    PHANTOM=0 CATCHALL=1 REDIRECT=2 SLOT-HOST=1 ; stderr UNRESOLVED-IMPORTS=0.
    CHECKED — ran in the worktree. EXIT=0. stdout census line:
      ROUTES=41 DECLARED=7 MISSING=34 PHANTOM=0 CATCHALL=1 REDIRECT=2 SLOT-HOST=1
    stderr (2>&1 1>/dev/null):
      UNRESOLVED-IMPORTS=0
    EXACT match. Also `python3 -c "ast.parse(...)"` silent (ast OK).

[3] Reproduce the multiline probe MYSELF.
    CHECKED — tar-copied the worktree to /tmp (preserving symlinks, dropping
    .git), reformatted ONLY the /protocol-builder Route so its element={...}
    spans lines:
        <Route
          path="/protocol-builder"
          element={
            <Navigate to="/ingestion" replace />
          }
        />
    (a) FIXED script (HEAD, /tmp/probe-repo):
        ROUTES=41 DECLARED=7 MISSING=34 PHANTOM=0 CATCHALL=1 REDIRECT=2 SLOT-HOST=1
          /protocol-builder — <Navigate to='/ingestion'>
        => GREEN, REDIRECT stays 2. Matches the report's GREEN claim.
    (b) PRE-FIX script (git show 425de214:scripts/check-ui-surfaces.py into
        /tmp/probe-repo2, same multiline tree):
        ROUTES=41 DECLARED=7 MISSING=34 PHANTOM=0 CATCHALL=1 REDIRECT=1 SLOT-HOST=1
          /protocol-builder — no element resolved
        => RED, REDIRECT collapses 2->1 exactly as the cycle-1 review measured.
    The report's RED=1 / GREEN=2 claims are TRUE — I reproduced both directions.
    (Note: I reproduced the defect mechanism by formatting the element body over
    lines; the report frames it as reformatting the Route onto 3 lines. Same
    failure mode — the element body newline is what the non-DOTALL `.` cannot cross.)

[4] Report DONE marker names a commit that actually contains the marker line.
    CHECKED via git log -S / git show --stat. FALSE — see FIX-1.

[5] WIP commit tracked an untracked advc review file — residue?
    CHECKED. .hermes/plans/reviews/ already TRACKS 7 other advc/review artifacts
    (git ls-files '.hermes/plans/reviews/*' = 8 incl. this one); the dir is not
    git-ignored (git check-ignore rc=1). Tracking review artifacts there is the
    established repo convention, NOT residue. Report as OBSERVATION, not a defect.
    (If the orchestrator's policy is that reviews must stay untracked, then it is
     a pre-existing convention violation, not introduced by this leg.)

=====================================================================
DEFECTS
=====================================================================
FIX-1  [MINOR]  .hermes/plans/reports/L2-UI-SURFACE-MANIFEST-1-u6checkerresolve-report.md:111
  (DONE marker provenance — prior-cycle FIX-2, still open)
  Rule violated: the leg's own acceptance criterion "DONE marker must name a
  commit that actually contains the marker line", and the cycle-1 fix direction.

  The current marker line (HEAD, report line 111) reads:
      L2-UI-SURFACE-MANIFEST-1 UNIT u6checkerresolve DONE e9db2e3529c15eaa7dfb8eaee97c9d7a7f830c1d
  The marker text was introduced ONLY in 27c9acdf:
      $ git log --oneline -S 'DONE e9db2e3529c15eaa7dfb8eaee97c9d7a7f830c1d' -- <report>
        27c9acdf WIP AT EXIT (launcher auto-commit, NOT gated): ...
  Commit e9db2e35 (the sha the marker names) does NOT contain this marker line —
  its tree still carries the PREVIOUS marker naming b300876a:
      $ git show e9db2e35:<report> | grep -n 'DONE '
        87:L2-UI-SURFACE-MANIFEST-1 UNIT u6checkerresolve DONE b300876a2373d084e0a1781cd702d87c3007abcd
      $ git show e9db2e35:<report> | grep -c 'e9db2e3529c15eaa7dfb8eaee97c9d7a7f830c1d'
        0
  The report text itself concedes it: line 109 says the marker "names the code
  fix commit, not the report commit." So the marker still cites a commit whose
  tree does not hold it — the same defect the cycle-1 review raised, just pointed
  at a different non-containing commit.
  Fix direction: make the marker name the commit whose TREE contains the marker
  (or a stated annotated tag pointing at it), rather than the code commit. Since
  a commit cannot name itself, the workable shapes are: append the marker in one
  commit and reference it by an annotated tag, or (repo convention permitting)
  have the orchestrator pin the marker to the merge/containing commit. Do NOT
  write `DONE <HEAD>` from inside the same commit.

=====================================================================
OBSERVATIONS (not defects)
=====================================================================
OBS-1  The extract_route_elements regex still terminates `(.+?)` at the first
  `}` followed by optional whitespace and `/>`. A nested self-closing JSX child
  inside an element body (e.g. `element={<X p={1} />}`) would let the non-greedy
  match stop at the inner `}`. Not triggered by the current App.tsx — the coverage
  probe shows all 41 paths captured with correct bodies — so this is latent only,
  not a regression introduced by the DOTALL change (the DOTALL change makes the
  real census correct and does not alter it: REDIRECT=2 both with and without a
  multiline route present, and 41/41 elements resolved).
OBS-2  Tracking .hermes/plans/reviews/advc-...md is consistent with 7 pre-existing
  tracked review files in that dir; not residue by current repo convention (see [5]).
OBS-3  27c9acdf is a launcher WIP auto-commit ("NOT gated"). The report/marker
  edit thus never landed in a coder-authored commit, which is exactly why the
  marker cannot cleanly self-reference (FIX-1). Content judged on its merits.

=====================================================================
EVIDENCE HYGIENE
=====================================================================
All probing done in /tmp copies (/tmp/probe-repo, /tmp/probe-repo2), both removed;
`ls -d /tmp/probe-repo*` -> No such file or directory. Removed the
scripts/__pycache__ import side-effect; `git -c core.fileMode=false status --short`
is EMPTY. I made no edits to the reviewed files, did not commit, and did not
touch config/ui/surfaces.yaml or app/src/App.tsx.

=====================================================================
ACCEPTANCE CRITERIA (from the task) AND HOW EACH WAS CHECKED
=====================================================================
AC1 census exact (ROUTES=41 DECLARED=7 MISSING=34 PHANTOM=0 CATCHALL=1
    REDIRECT=2 SLOT-HOST=1, UNRESOLVED-IMPORTS=0).  CHECKED — ran it; exact.
AC2 only code change is re.DOTALL at line ~171, nothing else in scripts/.
    CHECKED — diff --stat/--name-status; single hunk, one file. PASS.
AC3 multiline probe self-reproduced, REDIRECT must stay 2 with the fix.
    CHECKED — /tmp/probe-repo GREEN (REDIRECT=2), /tmp/probe-repo2 with pre-fix
    script RED (REDIRECT=1). PASS.
AC4 DONE marker names a commit that contains the marker line.
    CHECKED — FALSE (FIX-1). FAIL.
AC5 advc review file tracked = residue?  CHECKED — consistent with 7 tracked
    peers; observation, not defect.
AC6 ast.parse silent / tree clean at exit.  CHECKED — ast OK; status clean. PASS.

VERDICT: FIX
