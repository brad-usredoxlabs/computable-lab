# REG-2 FIX1 — browser-gate defects at merge 0ddbe20b (receipts REG-2/20261018T094027Z)

Gate VERDICT: fix (tier-2, 93 steps, 0-fail trail, 13 distinct PNGs, report.md read
first-hand by the orchestrator). Five behaviours PASS (splitter, drag, both clamps
220.0px/40.0% exact, 16px nudge, no-splitter negative, console clean, /record prose-cap
tripwire). Two named criteria FAIL.

## ORCH ADJUDICATION (binding)

D1 (REAL DEFECT, fix it): restore-on-mount clamps against a PRE-SETTLE body width.
`DocumentShell.tsx` restore useEffect reads `clampRailWidth(parsed, bodyRef.current)`
once at mount; the body settles 574.47 -> 549.5 -> 637px within ~50ms, so the 40% bound
is computed from 574.47 -> restored 229.79px while localStorage says 255 (delta -25.2px;
criterion +/-2px). Second repro: stored 230 -> restored 219.9 (-10.1px).
Fix direction (reviewer-prescribed, adopt): do not read the rect once in a mount effect —
re-clamp when layout settles (ResizeObserver on `.document-shell__body`, or clamp on every
body resize while railResizable). The persisted VALUE stays authoritative; only the clamp
bound may shrink it, and it must re-evaluate against the SETTLED body width. Preserve:
explicit user drags keep the exact-plan width formula; persistence on pointerup unchanged.
Also fix observation O1 while in this path: pointerup with NO movement (down/up at the
same point) must NOT persist a width derived from the pointer x (rendered 320, stored 347
observed). If the drag never moved past a ~2px threshold, persist nothing.

D2 (ACCEPTANCE-CRITERION ARITHMETIC, orch ruling — do NOT change the mechanism): the
verbatim criterion "at 1600px viewport .taptab-editor-container width > 900" is
unreachable on /registry: the registry's own 320px list column + rail >=220px + pane
chrome leave at most ~792px at 1600px. The reviewer PROVED the mechanism works: computed
max-width none; 792px renders where the 720px cap would bind. Ruling: the number 900 was
plan arithmetic that omitted the list column; the approved INTENT is "the un-cap is real
and effective". Amended criterion for the re-gate: at 1600px viewport, default layout,
.taptab-editor-container computed max-width == none AND the widest user-reachable layout
(AI pane collapsed, rail at 220px min) measures container width >= 720 (i.e. strictly
beyond what the prose cap allowed), with numbers in the trail. Precedent: EDITOR-1's
"exit 0" mis-spec reworded in-lane. Recorded as AS-ORCH-L1-179.

## SCOPE

Same worktree/branch wt/REG-2-lane1-l1t0400 (HEAD already an ancestor of trunk
ee0338f7 — FIRST ACTION: `git -c core.fileMode=false merge --ff-only cl/integration-1`
to fast-forward onto ee0338f7, then reset to trunk tip). Files: DocumentShell.tsx (+
DocumentShell.test.tsx). taptab.css/RecordRegistryPage.tsx only if the settle-clamp needs
them. App-only; no YAML.

## TESTS (RED first, separate RED commit)

Add to DocumentShell.test.tsx (jsdom; mock/trigger ResizeObserver): restored width
computed against a body that reports a SMALLER width at first measurement and the settled
width after a resize notification ends up at the stored value (within clamp), not the
pre-settle clamp. And: click-without-drag on separator does not write localStorage.

## GATES

`cd <worktree>/app && npx vitest run src/editor/taptab` PASS (DocumentShell 25/25 + new
pins); app tsc: `npm run typecheck -w app 2>&1 | grep -c "error TS"` == 23, comm-empty
line diff vs base (same 23 files, zero lines in DocumentShell*).
Report: /home/brad/.hermes/cl/lanes/1/reg2-fix1-report-l1t0635.md — RED evidence, GREEN,
tsc base-vs-head comm, assumptions block, YAML:none statement. End stdout exactly:
REG2-FIX1 DONE <sha-of-code-commit>.

Do NOT restart any stack; do NOT run browser gates (orch post-merge); never touch
/mnt/vast/home/brad/git/computable-lab or cl-integration-2; :3001/:5174 never.
