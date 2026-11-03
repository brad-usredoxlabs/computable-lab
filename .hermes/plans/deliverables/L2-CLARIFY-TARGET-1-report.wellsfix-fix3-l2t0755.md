# L2-CLARIFY-TARGET-1 — WELLS-DOOR FIX RUN 3 (adversarial cycle-2 defect closure) — report (l2t0755)

Coder: cl-coder. Branch `cl/lane2-target1-1-l2t1810`, start tip `16f3b40382292fe0247e52b700d5646570913285`,
tree CLEAN at start (`git status --short` empty).

Defect list read IN FULL: `/home/brad/.hermes/cl/lanes/2/reviews/L2-CLARIFY-TARGET-1-advc-wellsfix-fix2-l2t0745.md`
(defects 1–3 only; defect 4 = LOW golden MANIFEST re-pin is EXPLICITLY OUT OF SCOPE this run — untouched, no
decisions/ file, realizationGolden T1/T2 left RED and tracked).

Spec of record: `.hermes/plans/2026-11-02_0050-L2-CLARIFY-TARGET-1-spec.md` (Change 5 / P7 at :372-404,
file inventory :122-155, P7 bait #9 at :583-585 — all read; binding). Ruling:
`.hermes/plans/decisions/TARGET1-WELLS-DOOR-l2t2310-ruling.md` (read; the door work it names is already
landed at tip — this run closes the review's three defects on top of it).

## BOUNDARIES (measured, not promised)

- Sibling-live dirs `app/src/shared/**` (except the in-scope export already present in
  `WellSelectionContext.tsx`), `app/src/event-editor/deck/**`, `config/chat/**` — NOT TOUCHED.
  `WellSelectionContext.tsx:211` already carries the spec's additive `useOptionalWellSelection` export at
  HEAD; D3 only re-adds its CONSUMER in the slot.
- `exactOptionalPropertyTypes` truth: `server/tsconfig.json:13` sets it (SERVER flag); `app/tsconfig.json`
  sets only `strict` — no `: undefined` / `= undefined` added anywhere in this run's app edits, and the app
  flag is NOT asserted as if it were set.
- No dev server started/stopped; no browser gate; no merge/push/rebase; no other worktree.
- `server/schema` symlink trap: no server pins touched this run (app-only defect set).

## BASELINE (pristine 16f3b403, measured this run)

- app `npx tsc --noEmit`: 10 errors, 9 files — saved `/tmp/app-tsc-base-l2t0755.txt` (list in D-verify).
  Identical to the reviewer's COMMANDS #3 file list.
- App baseline run (the 10 files that cover the touched surfaces): `Test Files 10 passed (10)`,
  `Tests 89 passed (89)` (raw at D-verify).

## D1 (MAJOR) — restore the spec-listed NEW deliverable `proposalRowFacts.ts` and WIRE Change 5

Status: IN PROGRESS → (updated per commit below)

## D2 (MINOR) — bound the answer-slot range expansion (reject BEFORE `expandWellTokens`)

Status: IN PROGRESS → (updated per commit below)

## D3 (MINOR) — restore the FILL-only "use selected wells" affordance

Status: IN PROGRESS → (updated per commit below)

## D-verify (final) — full sweeps + typecheck + commit trail

(pending)
