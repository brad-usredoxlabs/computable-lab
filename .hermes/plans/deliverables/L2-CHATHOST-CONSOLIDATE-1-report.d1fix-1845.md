# CHATHOST-CONSOLIDATE-1 — D1 browser-gate fix (registrar throw on first render)

Lane 2 · item CHATHOST-CONSOLIDATE-1 · sub-task D1 only (fix run).
Worktree `/mnt/vast/home/brad/git/wt/CHATHOST-D1FIX-1-lane2-l2t1845`, branch
`cl/lane2-chathost-d1fix-1-l2t1845`, cut from `cl/integration-2` @ `2fd8b674`
(product merge `c9687463` in base).

## The defect (D1, MEDIUM)
`SurfaceChatRegistrar` (`app/src/shared/shell/SurfaceChatBridge.tsx`) throws
`ChatDoorMisconfiguredError` in its RENDER BODY whenever a `required_providers`
slice's ref is momentarily empty. `run-workspace` and `event-editor` declare
`required_providers: [deck]`; the deck slice is published by `DeckChatSlice`
inside `EventEditorProvider` (a sibling that commits a beat later). On an
ordinary page load the initial render pass (and StrictMode's double-invocation
/ keyed-remount clear, `SurfaceSliceStore.tsx:151-159`) sees `deck == null`,
throws twice → 2 `pageerror`s at phase `goto` before any chat interaction. The
pane recovers once the slice publishes (round trip works) — confirmed by the
gate receipt.

## Setup
- `node_modules/.bin/vitest` + `tsc` were ABSENT → `npm install` at worktree
  ROOT (npm workspaces, app/ + server/). Start `23:52:38` UTC, end `00:16:23`
  UTC (~24 min). Both bins verified present after install.

## Trunk baselines (measured first-hand at 2fd8b674, clean tree)
- `npx tsc --noEmit -p app`: **10 errors** (byte-identical set to the spec V-2
  baseline: LawnSurface.moveAcross, PreviewActionBar, editorHistory ×2,
  EventEditorContext, LabwareFocus.instrument, ViewerToolbar, Viewer,
  IngestionUploadModal, ExtractionProgressPanel).
- `npx vitest run src/shared/shell src/shared/config`: **24 files / 118 tests,
  all PASS.**

## Design (contract-preserving)
The loud-fail is the contract (spec §2.5 step 2). Only the ORDERING is fixed:
the required-slice validation moves OUT of the first render into a bounded,
deterministic re-check against the live slice store (`getSlice` is a stable
ref accessor):
1. First render / initial publish window: NO throw (the door collects from
   whatever is published; `collectSurfaceContext` already degrades to the base
   context when the deck slice is absent).
2. After a bounded deterministic window (`DOOR_REQUIRED_RECHECK_DEADLINE_MS`),
   re-check the LIVE store: a required slice that is merely LATE does not
   throw; a required slice that is NEVER published STILL throws
   `ChatDoorMisconfiguredError` naming the host + every missing slice id.
3. The throw is the LAST statement of the component (after every hook), so no
   conditional-hook violation. `required_providers` stays DATA (YAML); no
   host-id branch, no second registry, no silent never-throw path.

## RED-first pin
New pin in `SurfaceChatBridge.door.test.tsx` (positive leg) exercises the REAL
ordering: a door whose declared required provider publishes AFTER the first
render (DeckChatSlice-style late publish) renders with ZERO thrown
`ChatDoorMisconfiguredError`, then recovers with the deck fields merged.
Negative leg (existing loud-error assertion) strengthened to assert the named
error after the bounded re-check (was a synchronous render-body throw; the
assertion — instanceof + message names host+deck — is unchanged).

## Verification (commands + results)

### RED→GREEN (the pin, run at `c9687463` behaviour via `git stash` of the
### source file, keeping the new tests)

- RED (source at trunk `c9687463` behaviour, NEW tests in place):
  `Tests 1 failed | 2 passed (3)` — the D1 ordering pin fails with
  `ChatDoorMisconfiguredError: chat door 'run-workspace' is misconfigured:
  required slice(s) not published: deck` (thrown during the first render).
- GREEN (with the D1 fix): `Tests 3 passed (3)`.

The pin is NON-VACUOUS: the positive leg reproduces the real ordering as a
later-sibling publisher (registrar's first render reads an EMPTY ref, then the
deck slice's render-phase write + effect-phase bump re-render the registrar
inside the initial window), and asserts the first forwarded context carries NO
deck fields (proving the late ordering) before recovery. The negative leg
(unchanged assertion: `instanceof ChatDoorMisconfiguredError` + message names
`run-workspace` AND `deck`) is NOT vacuous — it now elicits the named error at
the bounded re-check deadline (fake timers advanced past
`DOOR_REQUIRED_RECHECK_DEADLINE_MS`), i.e. a NEVER-published provider still
throws loudly. It is not deleted or weakened.

### Target suites (post-fix)
- `cd app && npx vitest run src/shared/shell src/shared/config`
  → **24 files / 119 tests, all PASS** (118 on trunk + the 1 new D1 pin;
  zero failures). Includes `chatDoorRegistry.contract.test.ts` (the YAML
  literal-set contract pin) — still GREEN.

### Typecheck (post-fix vs trunk `2fd8b674`)
- `npx tsc --noEmit -p app` → **10 error-lines** (post-fix).
- Trunk baseline `2fd8b674` → **10 error-lines**.
- `diff` of the two sorted error sets → **IDENTICAL** (10 = 10); NONE inside
  the changed files (`SurfaceChatBridge.tsx` / `.door.test.tsx` are clean).

### git
- `git -c core.fileMode=false diff --stat c9687463..HEAD`:
```
 .../handoffs/2026-11-03_1725-lane2-tick-l2t1712.md | 46 +++++++++++
 .../shared/shell/SurfaceChatBridge.door.test.tsx   | 88 +++++++++++++++++++-
 app/src/shared/shell/SurfaceChatBridge.tsx         | 93 +++++++++++++++++++---
 3 files changed, 213 insertions(+), 14 deletions(-)
```
- `git -c core.fileMode=false status --porcelain`: clean except the report
  file (`?? .hermes/plans/deliverables/L2-CHATHOST-CONSOLIDATE-1-report.d1fix-1845.md`).
- Commit: `080eebbbe9723b0e39e91105898ebfe2a0087fe6`.

## Live confirmation
Out of scope here (orchestrator / next browser gate owns it). DOM-free unit
evidence only: the registrar no longer throws during the initial
render/publish window (positive leg), and still throws the named error after
the bounded window for a never-published provider (negative leg). NOT
claiming a browser pass.

## Changed files
- `app/src/shared/shell/SurfaceChatBridge.tsx` (the D1 fix: bounded
  `DOOR_REQUIRED_RECHECK_DEADLINE_MS` re-check; throw moved out of the first
  render to the last statement, after every hook).
- `app/src/shared/shell/SurfaceChatBridge.door.test.tsx` (D1 ordering pin +
  strengthened negative leg; parity leg untouched).
- `.hermes/plans/deliverables/L2-CHATHOST-CONSOLIDATE-1-report.d1fix-1845.md`
  (this report).

CHATHOST-D1FIX DONE 080eebbbe9723b0e39e91105898ebfe2a0087fe6
