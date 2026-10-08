# Focused investigation: why ProtocolTabPanel and the bridge read different ProtocolSelectionContext instances despite one mount

## Goal
Determine — with a falsifiable root-cause, not a guess — why `ProtocolTabPanel` (right pane) sees `stepGraphs`/`focusStepId` populated while `ProtocolPreviewBridge` (deck, same page, same provider mount) sees **empty** state, in the `/runs/:runId` route. Fix the root cause so the bridge ghosts the committed step realization onto the deck.

## Current context / what is already PROVEN (do not re-discover these)
- The context module is single: `app/src/event-editor/protocol/ProtocolSelectionContext.tsx` — one file, one `const ProtocolSelectionContext = createContext(...)` at module scope (line 65), one `ProtocolSelectionProvider`.
- `useProtocolSelection()` is a plain `useContext(ProtocolSelectionContext)` (line 136). React contexts are keyed by the context OBJECT identity, so two consumers get the same value IFF (a) they import the SAME module instance and (b) they sit under the SAME `<...Provider>` mount.
- `ProtocolTabPanel` imports it via `'../../protocol/ProtocolSelectionContext'` (`ProtocolTabPanel.tsx:27`); the bridge imports via `'./ProtocolSelectionContext'` (`ProtocolPreviewBridge.tsx`). Vite resolved ONE module URL for it (browser `performance.getEntriesByType('resource')` returned a single `.../ProtocolSelectionContext.tsx`).
- The `/runs/:runId` route → `RunWorkspacePage.tsx` which mounts exactly ONE `ProtocolSelectionProvider`: `<ProtocolSelectionProvider>` (line 125) wraps `WorkspaceProvider` → `EventEditorProvider` (128) → `ProtocolPreviewBridge` (132) + `RunWorkspaceShell` → `RightPane`/`ProtocolTabPanel` + `<DeckViewer/>` (`RunWorkspaceContent`, 205). Browser count: 1 `.right-pane`, 1 `.event-editor__stage-host`, 1 `[data-bridge-debug]` anchor — i.e. no visible second mount.
- `DeckHostPage.tsx` and `ProjectWorkspacePage.tsx` are SEPARATE pages that each mount their OWN provider + bridge. `DeckHostPage` has a REAL latent bug (its bridge at line 137 sits OUTSIDE its `ProtocolSelectionProvider` at line 127). But these are NOT the `/runs/:id` live path.
- The **mechanism works in isolation**: `ProtocolPreviewBridge.test.tsx` (2 tests) passes — when `stepGraphs` is populated + current/focus set, the bridge pushes `setPreview` with `_protocolStepStatus`. So the bridge code is correct given the right context.
- The **data flows**: live, `ProtocolTabPanel`'s `data-graphs-debug` probe showed `stepGraphKeys: ["step-2","step-3","step-1","step-4"]` populated while the bridge's render-time probe showed `stepGraphKeys: []` on the SAME page load.
- `DeferredRoute` (App.tsx:70) is just `<Suspense>` — no extra provider.
- Repo quirk: the terminal/harness sometimes mangles symbol names to `n` in ripgrep output — read actual files to confirm names; don't trust grep echoes.

## Architecture / approach
Run the divergence down as a decision tree. Each hypothesis has ONE decisive, cheap probe. Rule hypotheses OUT until exactly one remains; do not patch blindly. The probe for "is it the same context object?" is to attach a **module-scoped instance counter** so every `useProtocolSelection()` return can announce which provider-mount + module-copy it came from. Most likely outcomes, in order: (1) a genuinely hidden second page/provider (React root or tab-host), (2) **two module copies** of the context file via a path-alias/symlink/duplicate-React, (3) a StrictMode/double-render artifact, (4) the two consumers run under DIFFERENT `couldEnd` — each must be tested, not assumed.

---

## Phase 0 — Instrument BOTH sides with an identity tag (do this first; it disambiguates everything)

### Task 0.1 — Module-scoped identity counter
File: `app/src/event-editor/protocol/ProtocolSelectionContext.tsx`.
Add at module top (near line 14), AFTER imports:
```ts
let MODULE_COPY_ID = 0
const MODULE_ID = Symbol('ProtocolSelectionContext.module')
// Unique per *module instance*. If two consumers see different numbers below,
// there are two copies of this file loaded (path-alias / duplicate).
const instanceId = `module#${++MODULE_COPY_ID}`
```
Then have `useProtocolSelection()` stamp every returned value (in the Provider `value` too) so both the context object and the per-consumer reads can be compared across the bridge and the pane:
```ts
export function useProtocolSelection(): ProtocolSelectionState | null {
  const ctx = useContext(ProtocolSelectionContext)
  if (!ctx) return null
  return Object.assign(ctx, { __ctxInstance: instanceId })
}
```
(Type: add `__ctxInstance?: string` to `ProtocolSelectionState`.)

Also expose the identical marker ON the DOM so the browser can read both sides without React internals. Add a tiny probe renderer used ONLY when a global flag is set — simpler: in `RunWorkspacePage`, under the SAME provider, render two marker components:
```tsx
function CtxProbe({ tag }: { tag: string }) {
  const c = useProtocolSelection()
  return <span data-ctxprobe={tag} data-instance={c?.__ctxInstance ?? 'NULL'} style={{display:'none'}} />
}
```
Render `<CtxProbe tag="pane" />` as a direct child of `<RightPane/>`'s body (e.g. top of `ProtocolTabPanel` return) and `<CtxProbe tag="bridge" />` as a sibling of `ProtocolPreviewBridge` (`RunWorkspacePage.tsx`).
Verify command:
```bash
cd /mnt/vast/home/brad/git/computable-lab/app && npx tsc --noEmit
```
Expected: clean (this is instrumentation only).

### Task 0.2 — Drive the live run and read both probes
Open `http://127.0.0.1:5174/runs/RUN-review-seed-1788747903`, activate Protocol tab, click the first step chip.
Read:
```js
document.querySelector('[data-ctxprobe="pane"]').getAttribute('data-instance')
document.querySelector('[data-ctxprobe="bridge"]').getAttribute('data-instance')
```
**Decode the result:**
- `pane == bridge` (same `module#N`) AND same non-NULL → context MODULE is shared. Jump to Phase B.
- `pane != bridge` (different `module#N` values) → **TWO MODULE COPIES**. `useProtocolSelection` sees the SAME created context OBJECT only if both are the same file instance; a different `module#N` means the file was imported twice (path alias, symlink, `src/` vs relative, duplicate Vite resolve, or a stale transform cache). Jump to Phase A.
- either is `NULL` → that consumer is OUTSIDE the provider. Jump to Phase B (Provider not actually above both).

Record the actual observed values in your notes before changing anything.

---

## Phase A — Two module copies (different `module#N`)

### Task A.1 — Confirm duplicate file resolution
```bash
cd /mnt/vast/home/brad/git/computable-lab/app
find . -path ./node_modules -prune -o -name "ProtocolSelectionContext*" -print
readlink -f src/event-editor/protocol/ProtocolSelectionContext.tsx
rg -n "ProtocolSelectionContext" src --glob '*.ts' --glob '*.tsx' -l
```
Then, from the browser, list the exact module URLs the two consumers fetch:
```js
performance.getEntriesByType('resource').map(e=>e.name).filter(n=>/ProtocolSelectionContext/.test(n))
```
Expected if two copies: TWO distinct URLs (e.g. one `/src/...` and one `/@fs/...` or a `?t=<hash>` mismatch) OR one URL imported under two resolver identities.

### Task A.2 — Fix the duplicate resolution
- Check `tsconfig.paths` / `vite.config.ts` `/` `@` aliases in `app/vite.config.*`, `app/tsconfig.json`, root `tsconfig.json`:
```bash
cd /mnt/vast/home/brad/git/computable-lab/app && cat vite.config.ts tsconfig.json 2>/dev/null
```
- If one consumer resolves `@/event-editor/protocol/...` and the other `../../protocol/...`, standardize every import of the context to ONE canonical path (the shortest, e.g. relative `./ProtocolSelectionContext` from protocol/ and `../protocol/ProtocolSelectionContext` from right-pane/protocol/). Remove the alias for this module.
- If a duplicate `react` copy is implicated (two `node_modules/react`), that is latent in the install — confirm with `npm ls react` / `find node_modules -name react -maxdepth 3` BEFORE and note it; the context-level fix (single canonical import) generally resolves consumer divergence even with duplicate react, but record it.
- Also **clear the Vite transform cache** and reload (see Risks: stale `?t=` transforms can serve an old copy):
```bash
kill the vite process on 5174 (target the PID — never blanket pkill), then restart `npx vite --host 0.0.0.0 --port 5174`, hard-reload the browser.
```
Re-run Task 0.2. Expected now: `pane == bridge` with the same non-NULL `module#N`. Commit the import-normalization (`fix(protocol): normalize ProtocolSelectionContext import path so pane + bridge share one module instance`). If resolved here, skip to Phase D.

---

## Phase B — Same module copy but different/NULL provider (module identity matches, context diverges)

The module is one; the divergence is therefore one of:
- (B1) Another provider mount exists that I haven't found (the `/runs/:id` page is nested under or duplicated by a workspace-tab host, OR the tab strip renders a SECOND run page into a hidden/portal root).
- (B2) The deck runs under a DIFFERENT `EventEditorProvider`/React root than the pane (the deck's `DeckViewer` is a workspace `Viewer` dispatcher that re-hosts in a second shell).
- (B3) React StrictMode double-invocation creating a transient second provider whose value the bridge's render captures.

### Task B.1 — Hunt for a hidden second mount (B1)
In the SAME probe-annotated page, run:
```js
document.querySelectorAll('[data-ctxprobe]').length   // expect exactly 2 (pane + bridge)
document.querySelectorAll('.right-pane').length        // expect 1
document.querySelectorAll('.event-editor__stage-host').length // expect 1
document.querySelectorAll('.cl-app').length            // expect 1
```
If `[data-ctxprobe]` comes back with a `bridge` probe whose `data-instance` differs while there's still ONE `.right-pane` and ONE stage — the second mount is likely in a **portal** (createPortal to `document.body`) or a **nested top-level route**. Then trace who renders the deck:
```bash
rg -n "createPortal|PortaledRunWorkspace|RunWorkspacePage|DeckHostPage" app/src/run app/src/event-editor/workspace app/src/shared/shell --glob '*.tsx'
```
Investigate whether `WorkspaceTabStrip` / `OpenTabsContext` / the run tab (`RunWorkspacePage.tsx:75-79` calls `navigateActiveTab({kind:'run'})`) causes a run tab to ALSO render the page body in a host. If the run page is BOTH the route body AND a tab-rendered copy, that's the bug: delete/guard the duplicate host render.

### Task B.2 — Confirm the deck really is under the run page's provider (B2)
Decisive probe: wrap a SECOND `ProtocolPreviewBridge` (or just the `CtxProbe`) directly as a SIBLING of the pane INSIDE `ProtocolTabPanel`'s own render (same provider subtree the pane uses), and read its `data-instance`. If a probe INSIDE the pane's subtree reads populated `stepGraphs`, while the existing deck-side bridge reads empty, the deck is provably under a different provider tree and B2 is confirmed — the fix is to move the deck ghosting mount (`ProtocolPreviewBridge`) INTO the same provider tree as the pane (e.g. render it from inside `RunWorkspaceShell`'s `leftPane` subtree, or remove the outer mount and mount it once at the point both panes share), rather than toggling clone-fix.

### Task B.3 — Rule out StrictMode (B3)
Check `app/src/main.tsx` (or `App.tsx` root) for `<StrictMode>`:
```bash
rg -n "StrictMode" app/src
```
If present, StrictMode runs the bridge render twice; a stale probe may have captured the first (pre-fetch) render. Re-run Task 0.2 with a fresh hard reload and read the probe AFTER the `[data-graphs-debug]`/chip-click settles (wait 3s+ after click). If `data-instance` then matches AND a bridge effect re-runs, StrictMode was a red herring for the divergent STEP GRAPHS (still real), so proceed to confirm via B1/B2 instead.

---

## Phase C — Commit the fix for whichever root cause fired

Only implement ONE fix (the one your probes proved):
- If A (two module copies): normalize imports (Task A.2), commit.
- If B1 (second host): remove/guard the duplicate render, commit `fix(run-workspace): run page deck no longer double-provided`.
- If B2 (deck under different provider): re-mount `ProtocolPreviewBridge` so it shares the pane's provider, commit `fix(protocol-bridge): mount deck ghosting under the pane's ProtocolSelectionProvider`.

## Phase D — Verify the actual payoff (not just convergence)

Remove ALL instrumentation (the `CtxProbe` components, the `__ctxInstance` stamp, any `data-*` debug attrs — keep the module import normalization).

1. Unit gate (bridge + selection + tab panel):
```bash
cd /mnt/vast/home/brad/git/computable-lab/app && npx vitest run src/event-editor/protocol src/event-editor/right-pane/protocol
```
Expected: 9 files / 66 tests pass (bridge 2, ProtocolSelectionContext 7, ProtocolTabPanel 25, etc.).
2. Typecheck both workspaces:
```bash
cd /mnt/vast/home/brad/git/computable-lab && npx tsc --noEmit -p server/tsconfig.json && cd app && npx tsc --noEmit
```
Expected: both clean.
3. Live browser (the run currently has a placed `plate-A1` + a committed 2-event wash realization on seed step-1):
   - `/runs/RUN-review-seed-1788747903` → Protocol tab → click step-1 chip.
   - Assert: `document.querySelectorAll('.tile').length === 1` AND the tile `data-affected="true"` (bridge preview now reaches `DeckSlot.tsx:48`) AND — click into the plate (`LabwareFocus`) — `document.querySelectorAll('[data-protocol-step-status="current"]').length >= 1` (well A1 highlighted).
   - Expected: all three real (not just "context converges"). If `data-affected` shows but `data-protocol-step-status` in LabwareFocus still 0, that is a SECOND, separate defect in `previewStepStatusForLabware`/`WellGrid` — log it as a new bug, do not conflate.
4. Commit the fix with a test that would have caught the regression: extend `ProtocolPreviewBridge.test.tsx` (or add a run-workspace integration test) that mounts BOTH a pane-like consumer writing `setStepGraph` AND the bridge, and asserts the bridge's `setPreview` fires with the status — i.e., lock the SHARED-CONTEXT invariant (both under one provider).

## Risks, tradeoffs, open questions
- **Stale Vite transform cache** is a real confounder for "two module copies": the harness `?t=<hash>` query param can momentarily serve an old module. Always hard-reload AFTER restarting Vite before trusting `data-instance`.
- **`data-instance` probe pollutes the store** — only ever route it through ephemeral DOM attrs (never into record YAML or git-committed UI state); remove before the final commit.
- **Two real bugs may be entangled**: context divergence (this plan) vs the `LabwareFocus` well-status render (Task D.3). Do not fix both in one shot — land the divergence fix, verify, then triage the render separately if needed.
- **`DeckHostPage` latent bug** (bridge outside its provider) is a separate, already-identified defect. Mention it in the PR/final notes but do not scope-creep it here.
- **Duplicate React** would affect every consumer pair in the app, not just this one — if Phase A implicates it, that's an install-level finding worth its own follow-up, not a hotfix target here.
- **Do not hand-edit the live method event graph again** to try to force a highlight; the seeded run already has a placed plate + committed realization and is the verification vehicle. Use the UI/API, not raw PUT, if a refresh is needed.

## The fastest path through this
Run Task 0.1+0.2 first — the `module#N` read-out is the single highest-information probe. It cleanly splits the solution space into "two copies" (Phase A) vs "different providers" (Phase B) in under 10 minutes, and both downstream fixes are small, surgical, and test-locked.

---

## ROOT CAUSE FOUND + FIXED (executed 2026-09-07)

### Root cause (definitive)
**Two NESTED `<ProtocolSelectionProvider>` instances.** `ProtocolTabPanel.tsx`
(the exported component, ~line 1875) mounted its OWN `<ProtocolSelectionProvider>`
around `ProtocolTabPanelInner`. So:
- The pane's `useProtocolSelection()` resolved to the INNER provider it mounted
  → it populated THAT provider (stepGraphs, focus) — pane saw `["step-2","step-3","step-1","step-4"]`.
- `ProtocolPreviewBridge` resolved to RunWorkspacePage's OUTER provider →
  a DIFFERENT, empty instance → bridge saw `stepGraphs: {}`, `focusStepId: null`.

Same module (`module#1` for both consumers — probe-proven), same context object,
but TWO provider elements → the bridge never shared the pane's state. This is
exactly why the mechanism passed in isolation (the bridge test wraps writer +
bridge under ONE provider) yet failed live.

### How it was proven
- Module-scoped identity counter (`__ctxInstance = module#N`) stamped into every
  `useProtocolSelection()` return: BOTH probe consumers reported `module#1`
  → ruled OUT duplicate-module / duplicate-React (Phase A eliminated).
- DOM probes: `[data-ctxprobe]` spans on pane + bridge. Both rendered inside the
  single `.cl-app`; pane had graphkeys, bridge had `[]` → ruled OUT portal/root
  split; confirmed it was a provider-instance difference (Phase B).
- Repo grep: `ProtocolSelectionProvider` appears in `ProtocolTabPanel.tsx:1875`
  in addition to the three hosts → the nested-provider smoking gun.

### Fix (commit `1dedf4f`)
Removed the redundant inner `<ProtocolSelectionProvider>` wrapper in
`ProtocolTabPanel` (line 1875-1879) so the pane shares the host's provider
(RunWorkspacePage / DeckHostPage / ProjectWorkspacePage) with the bridge.

### Verification (live, real payoff)
On `/runs/RUN-review-seed-1788747903` with the placed plate-A1 + committed
2-event wash realization on seed step-1:
- BEFORE fix: tile `data-affected=false`, no ghost tags, no per-well status.
- AFTER fix, click step-1 chip: **tile `data-affected="true"` + Preview tag**
  (bridge ghosts the realization onto the placed plate) and drilling into the
  plate (LabwareFocus) shows **well A1 with `data-protocol-step-status="current"`**.
- No errors. app typecheck clean; server typecheck clean; touched suites 67/67
  (added a shared-provider contract test to ProtocolPreviewBridge.test.tsx).

### Note on earlier confusing probe readings
The first bridge probe rendered as a `#root`-sibling of `.cl-app`; that was a
stale HMR artifact from an un-reloaded session during instrumentation — a clean
reload showed the bridge inside `.cl-app`. Don't be misled if you see that again;
a hard reload before reading probes is essential (task D note in the plan).

### Remaining / separate
- `LabwareFocus` well-status (`data-protocol-step-status="current"`) now works
  end-to-end after the fix. No second defect remains on this path.
- `DeckHostPage.tsx` LINES 127/137 still have a latent issue worth confirming:
  its `ProtocolPreviewBridge` sits OUTSIDE its `ProtocolSelectionProvider`.
  Not the live `/runs/:id` path, but likely breaks serving a run via a deck tab —
  a follow-up.
