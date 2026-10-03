# Handoff — QMS-5 (route /registry + one nav entry) COMPLETE

Lane 1 · trunk `cl/integration-1` · 2026-10-03 (orchestrator tick 20261003T122630)

## Task
QMS-5 — Route /registry + one nav entry (routing only). Spec:
`.hermes/plans/2026-10-03_qms-5-registry-route-nav-spec.md`.

## Status: DONE — verified, merged, browser-accepted.

## What landed (trunk `cl/integration-1`)
- Worker branch `wt/qms-5-lane1` @ `176db990` (4 files, +19/-2), merged --no-ff as
  **`b5742ff6`**.
- `app/src/App.tsx`: lazy `RecordRegistryPage` const + `<Route path="/registry">`
  inside the existing `DeferredRoute` Suspense wrapper.
- `app/src/shared/shell/GlobalNavbar.tsx`: `PrimaryDestination` += `'registry'`;
  `{ id:'registry', label:'Registry', path:'/registry' }` appended LAST in
  DESTINATIONS (data-testid `global-nav-registry`).
- `app/src/shared/shell/GlobalNavbar.test.tsx`: registry assertion at both
  enumeration sites.
- `app/src/App.test.tsx`: default mock for `./pages/RecordRegistryPage`, a
  `renders RecordRegistryPage at /registry` case, and REMOVAL of `/registry`
  from the retired-URLs-404 list (it's a live route now).

## Verified by the orchestrator (not the worker's summary)
- Full diff opened for all 4 files; correct and minimal.
- `npx vitest run src/shared/shell/GlobalNavbar.test.tsx` → 4/4 green.
- `npx vitest run src/App.test.tsx -t registry` → 1 passed; full file → 8 failed |
  24 passed. **The 8 failures are PRE-EXISTING**: reproduced identically on a
  clean HEAD (b60d1a56) checkout of App.tsx+App.test.tsx. They are stale
  "Phase 12" assertions (WelcomePage at `/` etc.) unrelated to QMS-5.
- `npm run typecheck -w app` → exit 2, 17 errors, ALL pre-existing trunk rot
  (missing `./draftChanges` module, `runDeckLock`/`equipments` drift,
  `physical_geometry`, `protocol-review` narrowing). ZERO in the changed files;
  `./pages/RecordRegistryPage` resolves under tsc.

## Key discovery (corrected stale QMS-1 pointer)
QMS-1 pointed at `app/src/shared/shell/NavLinks.tsx` as "the nav". That file is
an ORPHAN (zero importers). The LIVE nav is `app/src/shared/shell/GlobalNavbar.tsx`,
mounted by `AppShell.tsx:129` (workspace layout), matching the 7 live
destinations the original browser scout observed. QMS-5 edited GlobalNavbar.
Nav entry label: **"Registry"** (orchestrator determination — QMS-1(f) pinned the
KIND term `controlled-document`, not a nav label; "Documents" was rejected to
avoid a second affordance colliding with `/lab`'s dead Documents category that
QMS-6 will repoint/remove).

## UI acceptance gate — cl-browser-reviewer, VERDICT: accept
Receipts: `/home/brad/.hermes/cl/receipts/QMS-5/20261003T134839/`
(trail.json, report.md, 6 PNGs, all distinct md5). Orchestrator re-checked the
screenshots itself: step04-editor-open.png shows PER-DEMO-AUTHOR open in the
inline editor (list populated with PER-DEMO-AUTHOR + PER-DEMO-REVIEWER, Save/
Cancel present); step01-landing.png shows exactly one "Registry" nav entry, no
Documents/SOPs duplicate; step02/step03 both URL `/registry` (reload persists).

**First attempt was REJECTED — do not trust its verdict.** The run at
`/home/brad/.hermes/cl/receipts/QMS-5/20261003T133424/` returned "accept" but
EVERY registry screenshot was the SAME image (md5 2ad7fbe8) captured during a
backend outage showing "No records found" — a false accept built on stale
screenshots. Re-run with the backend confirmed stable produced the genuine
receipts above. (Kept as evidence; ignore for verdict purposes.)

## Environment incidents (not product defects)
- Lane-1 stack flapped during the first review: vite proxy `ECONNREFUSED` to
  :3092 while the backend was (re)starting → registry lists 500'd. Cause: an
  overlapping restart. Resolution: started the stack via `setsid` in background,
  waited for backend ready, then proved stability (9/9 200 over 45s) and the
  :5192→:3092 proxy (`/api/records?kind=person` → PER-DEMO-AUTHOR) BEFORE
  re-reviewing. **Lesson: verify backend stability over a window before handing
  it to a browser reviewer.**
- An independent commit `eb468e39` (Brad, 13:33) landed on `cl/integration-1`
  ON TOP of the merge: `app/vite.config.ts` VITE_CACHE_DIR isolation for
  parallel dev servers. Unrelated to QMS-5; left in place (trunk HEAD).

## Remaining issues / notes
- Trunk carries pre-existing debt: 17 app tsc errors + 8 stale App.test.tsx
  failures. A separate test-refresh housekeeping item may be warranted
  (out of scope for QMS-5).
- Out-of-scope observations (NOT fixed): `/lab` dead "Documents" category
  (kind `document`, 0 records) — QMS-6; DocumentControlBar orphan — QMS-6;
  NavLinks.tsx orphan; the untracked `schema/identity/role-grant.lint.yaml`
  absence noted by QMS-4.
- `/registry` renders WITHOUT the GlobalNavbar (RecordRegistryPage is a
  standalone layout) — the nav entry lives on the AppShell surfaces; from
  /registry the in-page tab strip is the affordance. Noted, not a defect.

## Next ready task
**QMS-6** (Registry coverage + signature-aware DocumentControlBar + sign-off
receipt) — deps QMS-2,3,4,5,1A all `done`. It is now UNBLOCKED. QMS-7 follows
QMS-6.
