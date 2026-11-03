# FAME-8-GATEFIX4 (l1t1855) — paperwork fixer report (run l1t2105)

Item: FAME-8-GATEFIX4. Worktree `/mnt/vast/home/brad/git/wt/FAME-8-GATEFIX4-lane1`,
branch `cl/lane1-fame8-gatefix4-l1t1855`.
Base for the authoritative diff: `5e861a0e`. Coder candidate at intake: `522040e9`.
Review closed: `/home/brad/.hermes/cl/lanes/1/reviews/FAME8-GATEFIX4-adv1-l1t2005.md`
(3 EVIDENCE-TRAIL minors, **0 product defects** — the review states the product diff is correct
and D1 is closed).

Scope actually exercised: the report file, the measure script in the receipts dir, and new
receipts files. **No product file was modified** — see §5.

## 1. Intake state

`git -C <worktree> status --porcelain` before I touched anything:

```
?? app/node_modules
?? node_modules
?? server/node_modules
```

`git rev-parse HEAD` -> `522040e9f298520d1c3906f049d4e24637df6df2`; `5e861a0e` resolves to
`5e861a0e9abdeb85a200a258069a0ae8eaa99693`. Worktree was clean apart from the three
pre-existing `node_modules` entries. It ends the same way (§6).

## 2. What I actually ran (and got)

### 2.1 D1 — boundary / anchor facts, read first-hand from the bytes

```
$ sed -n '101,102p' .hermes/plans/2026-11-02_fame-8-gatefix4-readability-spec-l1t1855.md
- App-side only. Boundary: `app/src/analysis/**` (AnalysisPage.css, ViewRenderer.tsx and their
  tests). No server, no schema, no YAML, no `scripts/`.

$ grep -n "textAnchor\|ticklabel" app/src/analysis/ChromatogramView.tsx
386:            <text x={xToPx(t)} y={PAD_T + PLOT_H + 16} className="chromatogram__ticklabel">
395:            <text x={PAD_L - 8} y={yToPx(t) + 3} textAnchor="end" className="chromatogram__ticklabel">
401:        <text x={PAD_L + PLOT_W / 2} y={H - 4} textAnchor="middle" className="chromatogram__axislabel">
404:        <text x={12} y={PAD_T + PLOT_H / 2} textAnchor="middle" transform={...} className="chromatogram__axislabel">

$ grep -rn "text-anchor" app/src --include=*.css
(no output)
```

So the review is right on both halves: the x-tick `<text>` at `:386` has **no** `textAnchor`,
nothing in `app/src` CSS sets `text-anchor`, and `ChromatogramView.tsx` sits under
`app/src/analysis/**`, i.e. inside the binding boundary. Fixed as prose (orchestrator's chosen
closure), not as code.

### 2.2 D2 — both vitest legs, re-run for real

Green, in the worktree at HEAD:

```
$ cd app && npx vitest run src/analysis/ViewRenderer.test.tsx \
    src/analysis/ViewRenderer.artifact-table.test.tsx \
    src/analysis/ViewRenderer.compat.test.tsx src/analysis/ViewRenderer.signal.test.tsx
 ✓ src/analysis/ViewRenderer.compat.test.tsx  (5 tests)
 ✓ src/analysis/ViewRenderer.signal.test.tsx  (13 tests)
 ✓ src/analysis/ViewRenderer.artifact-table.test.tsx  (13 tests)
 ✓ src/analysis/ViewRenderer.test.tsx  (15 tests)
 Test Files  4 passed (4)
      Tests  46 passed (46)
EXIT=0
```

Red control, in `/tmp/f8pap-d2` (a `cp -r` copy of the worktree `app/`, `app/node_modules`
symlink preserved, then `git show 5e861a0e:app/src/analysis/ViewRenderer.tsx` restored over it —
sha256 `d44a08e5c358037a0fd1678ce75cc1428638c76a6b44573b05d91503c1027e32`, byte-identical to
base; the HEAD test file kept), same suite:

```
 FAIL  src/analysis/ViewRenderer.test.tsx > TableView array-valued cells (FAME-8 GATEFIX4 reachability) > renders an array cell as one element per line (not a comma-joined run)
AssertionError: expected 'ALPHA_FLAG,BETA_FLAG' to be 'ALPHA_FLAGBETA_FLAG' // Object.is equality
 Test Files  1 failed | 3 passed (4)
      Tests  1 failed | 45 passed (46)
EXIT=1
```

The worktree was never used for the RED leg. `/tmp/f8pap-d2` was deleted afterwards.

### 2.3 D3 — served-revision capture + fresh measurement

Vite started from the worktree (my own server, not the lane stack):

```
$ cd app && VITE_API_PROXY=http://localhost:3092 npx vite --port 5201 --strictPort
  VITE v5.4.11  ready in 2872 ms
  ➜  Local:   http://localhost:5201/
```

`ss -ltnp` -> `*:5201 users:(("node-MainThread",pid=3636873,...))`, cmd
`node /mnt/vast/home/brad/git/wt/FAME-8-GATEFIX4-lane1/app/node_modules/.bin/../vite/bin/vite.js --port 5201 --strictPort`.

The measure script was extended (see §3.2) and re-run:

```
$ node fame8-gatefix4-measure-l1t1855.js 5201 after-served
```

Result (excerpt from `after-served-measure.json`):

```
served.head     42425c39455cddcbd39b8f62d4dbc53c26177f47
served.branch   cl/lane1-fame8-gatefix4-l1t1855
served.dirty    ["?? app/node_modules","?? node_modules","?? server/node_modules"]
served.viewRenderer  status 200, 76082 bytes, sha256 0015ebfdfa36...92dc, hasArrayCellMarker true
served.css           status 200, 19591 bytes, sha256 a0cbc1ef0b20...997a, hasOverflowWrapAnywhere true
steps           10 entries (git-served-capture -> ... -> screenshot-written)
geom            pane 574/574 noHScroll true, tableW 534, tableH 4165,
                flags idx 9 x1296..1420 w123 clientW122==scrollW122, cellItemCount 2,
                fullyReadable true, passed true
```

Comparison with the historical `after-measure.json` (20:29): identical on every field present in
both (the only difference is the newly added `cellItemCount`). The `:5201` server was stopped
afterwards (`ss` shows nothing on 5201). `:5192` was never contacted; no request was made to it.

Counts before/after this run, for the record: receipts dir had `json=7 png=5 js=5 txt=4`; it now
holds the two test outputs, the re-run JSON + screenshot, and the sidecar.

## 3. What changed, per defect

### 3.1 Review defect 1 (report:146-152 vs spec:101) — commit `5e7c4f6b`

Report §5 D2 bullet replaced with a truthful one-line reason ("a tick-anchor change requires
re-measuring the chromatogram leg, which this run did not budget") and **both** false claims
deleted: the "outside this run's boundary" claim and the "centered default text-anchor" claim.
New §9.1 records the old wording verbatim, why each half was false (spec:101 glob;
`ChromatogramView.tsx:386` has no `textAnchor`; no `text-anchor` in any app CSS; SVG default is
`start`), and states that the reviewer identified the 1-line in-boundary tweak
`textAnchor={i === xTicks.length - 1 ? 'end' : 'start'}` at `ChromatogramView.tsx:386` and that
the orchestrator is carrying D2 as a follow-up rather than closing it here. No product file
touched.

### 3.2 Review defect 2 (report:161-163) — commit `42425c39`

Report §6 no longer cites "this dir's git log / test output" (that artifact did not exist; the
receipts dir is not a git repo — `git -C ~/.hermes/cl/receipts/... rev-parse --show-toplevel` ->
`fatal: not a git repository`). It now cites both filed files by name, and §9.2 quotes the real
output of both legs, names the scratch path and the base-restore sha.

New receipts:
- `/home/brad/.hermes/cl/receipts/fame-8-gatefix4-l1t1855/test-green-head.txt`
- `/home/brad/.hermes/cl/receipts/fame-8-gatefix4-l1t1855/test-red-base.txt`

### 3.3 Review defect 3 (measure script:76) — commit `b755e287`

`fame8-gatefix4-measure-l1t1855.js` now captures `served` (worktree HEAD/branch/status, sha256 of
the served `ViewRenderer.tsx` module and `AnalysisPage.css` module bytes as returned over HTTP,
marker checks, and the committed-source sha256) and a populated `steps` array with timings.
Fresh artifact: `after-served-measure.json` + `00-after-served-fullpage.png`.

Historical window (2026-11-03T01:19Z..01:39Z = 20:19-20:39 EST): filed as **unattested with
corroboration** in `served-attestation.json` — the old script recorded nothing, the serving
process was gone, and no log naming the :5201 launch survived. The sidecar says so plainly and
lists only what was gathered (JSONs record `frontend: http://localhost:5201`; BEFORE reproduces
the gate's D1 numbers 1723 / 730 px @x1878; AFTER matches the orchestrator's prerecon 534 / 574;
product commits 780bc393 20:34:25 and 522040e9 20:38:54; after-arraybranch 20:26 already showed
the worktree-only array branch). **No revision string was invented.** The before leg was not
re-run — that would need a second server on a non-worktree port, which this run's rules do not
allow — and the sidecar records that limitation too.

## 4. Receipts created / modified (absolute paths)

Created:
- `/home/brad/.hermes/cl/receipts/fame-8-gatefix4-l1t1855/test-green-head.txt`
- `/home/brad/.hermes/cl/receipts/fame-8-gatefix4-l1t1855/test-red-base.txt`
- `/home/brad/.hermes/cl/receipts/fame-8-gatefix4-l1t1855/after-served-measure.json`
- `/home/brad/.hermes/cl/receipts/fame-8-gatefix4-l1t1855/00-after-served-fullpage.png`
- `/home/brad/.hermes/cl/receipts/fame-8-gatefix4-l1t1855/served-attestation.json`

Modified:
- `/home/brad/.hermes/cl/receipts/fame-8-gatefix4-l1t1855/fame8-gatefix4-measure-l1t1855.js`
  (served/steps capture; geometry logic unchanged)

Untouched: all seven pre-existing JSONs, all five pre-existing PNGs, the four probe scripts,
`tsc-base.txt`, `tsc-head.txt`, `door-base.txt`, `door-head.txt`.

## 5. No product change (verified, not asserted)

```
$ git diff --stat 522040e9..b755e287 -- app server schema records scripts
(empty)
$ git diff --name-only 522040e9..b755e287
.hermes/plans/deliverables/fame-8-gatefix4-report-l1t1855.md
```

The only tracked file this run changed is the coder report. No record was read-modify-written —
the measure run only GETs `/api` on the frozen `:3092` backend; no re-mint, no frozen artifact
(`AOUT-000134`, `ANREV-000022`, `ANR-000071`, `ANR-000068`) was touched.

Full diff against the authoritative base `5e861a0e`, re-measured at final HEAD:

```
 .../fame-8-gatefix4-paperwork1-report-l1t2105.md   | 221 +++++++++++++
 .../deliverables/fame-8-gatefix4-report-l1t1855.md | 365 +++++++++++++++++++++
 app/src/analysis/AnalysisPage.css                  |  12 +
 app/src/analysis/ViewRenderer.test.tsx             |  46 +++
 app/src/analysis/ViewRenderer.tsx                  |  27 +-
 5 files changed, 669 insertions(+), 2 deletions(-)
```

i.e. the coder's 4-file product+report delta is unchanged; this run adds only the paperwork
report and the appended correction sections.

## 6. Final state

Commits added on `cl/lane1-fame8-gatefix4-l1t1855` (no merge, no push, no rebase):

| sha | defect | message |
|---|---|---|
| `5e7c4f6b379189b8c1f8b930e4efa9c0902e60c7` | review defect 1 | docs(evidence): restate D2 deferral truthfully |
| `42425c39455cddcbd39b8f62d4dbc53c26177f47` | review defect 2 | docs(evidence): file the RED->GREEN test output |
| `b755e287a3e824c6333bbb107fe1508e04f47c57` | review defect 3 | docs(evidence): attest which revision :5201 served |
| (this report) | — | docs(evidence): paperwork run report |

`git status --porcelain` at the end: only the three pre-existing `?? node_modules` lines.

## 7. Defects deferred

None. All three review defects were evidence-trail and all three are closed. D2 (the
chromatogram tick label) remains a **product follow-up carried by the orchestrator**, exactly as
the review and the orchestrator's closure decided — that is not a deferral of this run's work.
