# REG-1 execution addendum (lane 1, tick l1t2305) — companion to the canonical plan

CANONICAL SPEC: .hermes/plans/2026-10-17_192653-registry-legibility-recordrefs-provenance.md
— plan Tasks 1-4, verbatim. That file was promoted into the lane trunk (8ac57673) from Brad's
tree this tick; it is now readable at that path INSIDE /mnt/vast/home/brad/git/cl-integration-1
and any worktree off it. Read Tasks 1-4 in full before touching anything.

## Orchestrator-verified anchors (first-hand, trunk 8ac57673 — do not re-derive)

- `app/src/components/registry/RelatedRecordsCard.tsx` exists, uses `text-gray-400` (2 sites).
- `app/src/pages/RecordRegistryPage.tsx` exists; `handleSelectRecord` at :287.
- Precedent pattern exists and is real: `app/src/event-editor/right-pane/ai/ChangesPanel.css` +
  `ChangesPanel.styling.test.tsx` — READ BOTH before writing your styling tests; reuse their
  token-only assertion machinery.
- `app/src/editor/taptab/taptab.css:13` `--shell-column-max: 720px` (REG-2's territory — NOT yours).
- Neither styling test exists yet at base (RED must be authored by you).

## Binding rulings (already made — do not re-open)

- W4-D2 is about REG-4 (no inline revision id); irrelevant here beyond not adding provenance.
- No `dark:` Tailwind variants (Tailwind v4 here has no @custom-variant dark). Fix is token
  CSS only, per plan Task 4's exact className replacement table — follow the table verbatim.
- data-testids untouched. The "Related Records" h3 MOVES into RelatedRecordsCard (plan Task 4).

## Worktree / mechanics

- Worktree: /mnt/vast/home/brad/git/wt/REG-1-lane1-l1t2305 (branch wt/REG-1-lane1-l1t2305 off
  trunk 8ac57673). node_modules symlinked at repo root, app/, server/ — do NOT pnpm install.
- NFS checkout: `git -c core.fileMode=false` for ALL git commands.
- app tsc BASELINE = ZERO raw errors (re-measure at worktree start:
  `cd app && npx tsc --noEmit 2>&1 | grep 'error TS' | sort > /home/brad/.hermes/cl/lanes/1/tsc-reg1-base-l1t2305.txt`;
  head must be a delta of ZERO new lines vs this file — own15 precedent: compare raw outputs).
- Tests: `cd app && npx vitest run src/components/registry/RelatedRecordsCard.styling.test.tsx
  src/pages/RecordRegistryPage.styling.test.tsx` then
  `cd app && npx vitest run src/pages/RecordRegistryPage` (the plan's "5 suites PASS" gate).
- RED FIRST: both styling tests must FAIL at base before any product change; if they don't fail
  the way the plan predicts, STOP and report.
- Stage EXACTLY the in-scope files (RelatedRecordsCard.tsx/.css/.styling.test.tsx,
  RecordRegistryPage.tsx/.css/.styling.test.tsx) — never `git add -A`.
- Do NOT start/restart any dev stack; do not touch :3001/:5174/:3092/:5192; no merge, no push,
  no writes to either data dir. Browser gate is orchestrator-side after merge.

## Deliverable

Report at EXACTLY /home/brad/.hermes/cl/lanes/1/reg1-report-l1t2305.md with: RED raw output,
GREEN raw output, RecordRegistryPage suite block, tsc base/head raw counts, staged-file list,
every assumption/deviation. Last line exactly: `REG1 CODER DONE <head-sha>` (commit before it).

## Reviewer bait (what a shortcut would look like — the gate hunts these)

1. Replacing gray utilities with inline styles or new hardcoded hex instead of --cl-* tokens.
2. Adding `dark:` variants (does not work here) instead of per-surface token CSS.
3. Deleting/renaming data-testids to make a styling assertion pass.
4. Styling only RelatedRecordsCard and leaving RecordRegistryPage chrome fixed-palette.
5. Dropping the h3 move into RelatedRecordsCard (Task 4 table is binding).
