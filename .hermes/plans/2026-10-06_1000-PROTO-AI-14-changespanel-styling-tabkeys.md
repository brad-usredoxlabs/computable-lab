# PROTO-AI-14 spec — Style ChangesPanel (F1) + fix WorkspaceTabStrip duplicate-key warning (F3)

Lane 2 · backlog admitted by Brad 2026-10-06 (`/home/brad/.hermes/cl/lanes/2/decisions/
LANE2-BACKLOG-followup-approval.md` Answer — quote in report). dep PROTO-AI-9 (merged).
Branch off `cl/integration-2` in your OWN worktree. ONE worker. UI task -> browser gate follows.

## F1 — ChangesPanel is unstyled
`app/src/event-editor/right-pane/ai/ChangesPanel.tsx` uses 15 distinct `changes-panel__*` classes
(changes-panel, __actions, __btn, __btn--apply, __btn--discard, __applying, __apply-error,
__warning, __warnings, __warning--<severity>, __change, __change--<op>, __change-desc,
__change-prefix, __diff, __protocol, __protocol-target — enumerate them from the file yourself)
and ZERO CSS exists for any of them under app/src. Result: Accept/Reject render as jammed plain
text, apply-error (role=alert) is unstyled.

Fix: create `app/src/event-editor/right-pane/ai/ChangesPanel.css`, import it from
ChangesPanel.tsx, and style against the design tokens in `app/src/shared/styles/tokens.css`
(--cl-* variables). FOLLOW THE PRECEDENT: commit `8e14b061` ("theme-token the settings surfaces")
— every color/border must come from tokens so light AND dark themes both work (data-theme switch).
Buttons must read as distinct visible buttons (primary = accept, neutral/danger-tinted = discard);
apply-error must read as an alert (danger soft token, same family settings banners use per 8e14b061);
warnings severity-tinted; the diff list readable with clear per-op rows. No new colors outside
tokens — if a token is genuinely missing, reuse the closest existing one and note it.

## F3 — WorkspaceTabStrip duplicate-key warning
`app/src/shared/shell/WorkspaceTabStrip.tsx:113` renders `key={tab.id}`; the browser console shows
a React duplicate-key warning when run tabs duplicate. FIX THE KEY SOURCE / the duplicate entry —
do NOT silence the warning.
Verified orientation (orchestrator reads): `app/src/shared/session/tabId.ts` mints one id PER TAB
VALUE (run tabs -> `runTabId(tab.runId)`), and tabId.ts's header says the session YAML document
"deliberately carries no ids" — rebuilt/re-hydrated tabs therefore collide whenever the same run
value appears twice (or hydration double-applies). The reducer lives in
`app/src/shared/shell/OpenTabsContext.tsx`. Scout trace (SCREENING ONLY — verify yourself):
`/home/brad/.hermes/cl/lanes/2/logs/scout-ai14-tabs-20261006T0945.log`.
Determine the exact entry point of the duplicate (reducer append without dedupe vs double hydration
vs two legitimately-distinct tabs sharing a value-derived id) and fix at THAT site:
- If two entries with the same tab.id are a STATE BUG -> dedupe/replace at the reducer (open-tab
  semantics: opening an already-open tab activates it, if that is the existing convention — cite
  the convention you find).
- If duplicates are LEGITIMATE distinct tabs (two views of the same run) -> React key must be the
  per-entry identity, not the value-derived id (check whether tab entries carry a per-slot uid;
  tabId.ts `slotSuffix()` precedent). Pick the fix the codebase's conventions point to; document
  the choice.
Red-first: a component/store test with a duplicated-run fixture asserting (a) no duplicate keys in
rendered output and (b) whatever dedupe/identity semantics you chose. Console must be clean of
`Encountered two children with the same key` during a run-tab duplication repro.

## Scope / ownership
- app/src/event-editor/right-pane/ai/ChangesPanel.tsx (+ NEW ChangesPanel.css)
- app/src/shared/shell/WorkspaceTabStrip.tsx (+ test) and, if the duplicate enters there,
  OpenTabsContext.tsx (+ test) — the MINIMAL site per your trace.
- NO behavioral changes to either component's contract; no other files.
- NO CSS-in-JS, no tailwind — plain CSS file matching the repo convention.

## Acceptance criteria (VERIFY, do not assert)
1. Red-first component tests added FIRST (styling hooks present; tab keys unique under a
   duplicated-run fixture). `npm run test:unit -w app` targeted suites green; no NEW failing files
   vs the trunk baseline (~23 failing files at base — record your baseline count in the report).
2. app tsc: error-line set vs pre-merge trunk baseline (record both; zero NEW).
3. Browser gate (orchestrator dispatches): Accept/Reject render as distinct visible buttons in
   BOTH light and dark themes; apply-error visibly alert-styled; console free of the duplicate-key
   warning during a run-tab duplication repro.

## Deliverable (UNIQUE path)
Report: `/mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/PROTO-AI-14-report.wip-l2t1000.md`
with: F1 class inventory + token mapping table, F3 root-cause trace (file:line) + chosen fix
rationale, test outputs (red-before-green), tsc baseline vs post, commit hashes on your branch.
Commit on your branch; do NOT merge. Do NOT edit the task list.
