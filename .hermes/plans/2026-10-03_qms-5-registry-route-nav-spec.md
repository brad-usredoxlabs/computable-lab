# QMS-5 — Route /registry + one nav entry (routing only)

Campaign: light-qms-records-browser · Lane 1 · trunk `cl/integration-1`
Owner: cl-senior (this tick) · Token: qms-5-lane1-20261003T122630
Deps: QMS-1 (b, c, i resolved), QMS-4 — both `done` in the lane list.
Scope: routing/navigation ONLY. Do NOT edit `RecordRegistryPage.tsx` or
`DocumentControlBar.tsx`, do NOT build a browser, do NOT resurrect `/browser`.

## Goal
`RecordRegistryPage` exists and is functionally near-complete but is routed
NOWHERE. Make it reachable: one lazy route `/registry` and exactly ONE nav
entry, so a person landing on the app can click once and reach the registry.

## Verified facts (this tick, opened — do not re-derive, do not contradict)

### The router — `app/src/App.tsx` (218 lines)
- `DeferredRoute` is a LOCAL helper in App.tsx:72-74 wrapping children in
  `<Suspense fallback=...>`. It is NOT a separate module. There is no
  "DeferredRoute file contract" — the pattern is: declare a `const X = lazy(
  async () => import('./path').then((m) => ({ default: m.Named })))` near the
  other lazy consts (App.tsx:38-70), then add
  `<Route path="/registry" element={<DeferredRoute><X /></DeferredRoute>} />`
  in the `<Routes>` block (App.tsx:133-212).
- `RecordRegistryPage` uses a **default** export
  (`export default function RecordRegistryPage()`), so the lazy import is
  `.then((m) => ({ default: m.default }))`.
- `/` → `HomeRedirect` → `/projects` (App.tsx:136). `/projects` renders
  `ProjectCollectionView`, which uses `AppShell` (collections/ProjectCollectionView.tsx:12,203)
  → the app-shell workspace layout renders `GlobalNavbar`.

### The REAL nav component — `app/src/shared/shell/GlobalNavbar.tsx` (162 lines)
- **QMS-1's pointer to `app/src/shared/shell/NavLinks.tsx:16-19` is STALE/wrong.**
  `NavLinks.tsx` is an ORPHAN: grep shows zero importers (`import ... NavLinks`
  appears nowhere but its own file). The nav actually rendered in every
  AppShell workspace surface is `GlobalNavbar`, imported and mounted at
  `app/src/shared/shell/AppShell.tsx:6,129`. The live UI matches: the browser
  scout observed exactly the 7 GlobalNavbar destinations
  (Projects/Runs/Claims/Lab/Ingestion/Intake/Chat). **Edit GlobalNavbar.tsx,
  not NavLinks.tsx.** (Leave NavLinks.tsx untouched — out of scope.)
- Destinations are the `DESTINATIONS` array (GlobalNavbar.tsx:23-31) typed by
  the `PrimaryDestination` union (GlobalNavbar.tsx:21). Each entry renders a
  `<button data-testid={`global-nav-${dest.id}`}>` (GlobalNavbar.tsx:72-86).
  Both desktop and mobile branches render the same `destinations` node, so ONE
  array entry covers both viewports.

### The nav entry label — orchestrator determination
QMS-1(f) pinned the canonical KIND term (`controlled-document`, `^DOC-`), not
a nav label. A nav button labelled `controlled-document` would be wrong (the
registry is a multi-kind browser: people/equipment/training/calibrations/…).
Label it **`Registry`** (matches the route `/registry` and the page name
`RecordRegistryPage`). Do NOT label it "Documents" or "SOPs": `/lab` already
owns a dead "Documents" category (kind `document`, 0 records) that QMS-6 will
repoint/remove — adding a second "Documents" affordance would create two
affordances for one concept and fail the "exactly one QMS-browser affordance"
gate. `id: 'registry'`, `path: '/registry'`, `label: 'Registry'`, added as the
LAST entry of `DESTINATIONS`; extend the `PrimaryDestination` union with
`'registry'`.

## Deliverable (unique paths — a retry must never clobber an accepted artifact)
- Branch `wt/qms-5-lane1` in worktree `/mnt/vast/home/brad/git/wt/qms-5-lane1`,
  branched off `cl/integration-1`. This branch IS the deliverable.
- Worker report to a UNIQUE path (not the canonical handoff):
  `.hermes/plans/handoffs/2026-10-03_qms-5-registry-route-nav-report-qms-5-lane1-20261003T122630.md`
  The orchestrator promotes the canonical handoff itself.

## Exact files (disjoint; you own these and nothing else)
1. `app/src/App.tsx` — add the lazy const + the `/registry` route.
2. `app/src/shared/shell/GlobalNavbar.tsx` — add the `registry` destination.
3. `app/src/shared/shell/GlobalNavbar.test.tsx` — the existing "renders all
   primary destinations" and mobile tests enumerate destinations; add
   `expect(screen.getByTestId('global-nav-registry')).toBeDefined()` so the
   suite stays green.
4. `app/src/App.test.tsx` — only if adding the route breaks an existing
   assertion; add a `/registry` case asserting the registry page renders.
   (App.test.tsx mocks heavy pages; add a `vi.mock('./pages/RecordRegistryPage', …)`
   if you assert its content.)
Do NOT touch: `RecordRegistryPage.tsx`, `RecordRegistryPage.test.tsx`,
`DocumentControlBar.tsx`, `NavLinks.tsx`, `client.ts`, anything under `server/`
or `schema/`.

## Acceptance criteria (verbatim from the lane list, QMS-5)
"verified by: (browser smoke gate — routing only)
  From landing page ONE click reaches /registry; refresh returns to it, not
  welcome; seeded DEMO person opens in the inline editor; exactly one
  QMS-browser affordance exists; reviewer receipts VERDICT: accept. Note (not
  fix) any out-of-scope tab breakage in the receipts trail."

## Verify commands (run in the worktree; paste raw output in your report)
- `cd /mnt/vast/home/brad/git/wt/qms-5-lane1/app && npx vitest run src/shared/shell/GlobalNavbar.test.tsx src/App.test.tsx`
  (or `npm run test:run -w app -- <files>` from repo root) — must be green.
- `cd /mnt/vast/home/brad/git/wt/qms-5-lane1 && npm run typecheck -w app` — exit 0
  (note any pre-existing errors not in your files, attributed).
- NO YAML changed → no stack restart needed. Do NOT restart any dev stack.
- Do NOT run git commit/merge yourself — the orchestrator commits/merges.
  Leave the branch working tree with the changes; `git -c core.fileMode=false add`
  only the three/four files with explicit paths if you stage (or leave unstaged).

## Notes / pitfalls
- NFS checkout fakes ~2550 mode-only 'modified' files: always use
  `git -c core.fileMode=false` and explicit file paths.
- The lazy import of `RecordRegistryPage` pulls a large module graph
  (ProjectionTapTabEditor, TipTap, apiClient). That's fine — `lazy` exists for
  exactly this; keep it lazy (do not import it eagerly).
- `/registry` must survive refresh (a real BrowserRouter route, not a
  redirect) and must NOT redirect to welcome. Do not add `*`-catch handling
  for it.
- Out of scope (NOTE in your report, do NOT fix): half-broken unrelated
  registry tabs (verbs/capabilities), any `/lab` category issues, the
  DocumentControlBar orphan, signing.
