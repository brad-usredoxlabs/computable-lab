# FIXTURE-BOARD first-paint flake — ruling (l2t3300)

Status: DECIDED. Owner of the unit: orchestrator (lane 2). Architect wrote no code.

## The open question, restated

`L2-PROMPT2-FIXTURE-BOARD-1` has carried a BLOCKED-EXTERNAL note since the l2t1945 tick:

> isolation fix landed, 7/8 verifications pass; 1-in-8 flake = `GET /api/studies/STU-scratch/workspace`
> lists legacy `tab-deck-EVG-cellrox…` alongside the fixture tab, intermittently wins first paint.

`app/src/event-editor/projects/ProjectWorkspacePage.tsx:212` already passes `activate=true` to
`ws.openTab` for the deep-linked graph — the earlier route-wins ruling landed. The flake survived it,
so the residual cause is not the activate flag.

## What the code actually does now (read at trunk a415daef)

- `server/src/api/routes.ts:1209-1211` — `GET`/`PUT /studies/:studyId/workspace` is a **sidecar
  YAML of UI state**: `studyId, tabs[], activeTabId, rightPaneMode, rightPaneCollapsed, paneWidths`.
- `app/src/event-editor/legacyRouteResolution.ts:59,107,147` — legacy route resolution *creates*
  `tab-deck-<eventGraphId>` tabs, one path with a `Date.now()` id (`:107`).
- `ProjectWorkspacePage.tsx` therefore has **three writers of `activeTabId`** racing on cold load:
  1. hydration from the sidecar (`ws.ready` restores persisted `activeTabId`),
  2. `:191` `navigateActiveTab` (current-tab browser model),
  3. `:212` deep-link `ws.openTab(…, true)` and `:233` landing-home `ws.openTab(…, true)`.
- Nothing orders 1 against 3. The sidecar's persisted `activeTabId` is authoritative for the first
  frame; whichever effect wins decides first paint. That is the intermittency: not a flaky network,
  a flaky **order**.

## Ruling

1. **Derived tabs are not durable state.** A tab created by route resolution or a legacy-route
   coercion (`legacyRouteResolution.ts:59/107/147`) is *derived*, not user intent. Derived tabs
   must not be written to the sidecar. They are recomputed from the record store on load.
   This is the same distinction the knowledge layer already draws between a record and a derived
   record (`PDT`/`SGP`), and the same reason: persisting a derivation lets a stale derivation
   compete with a fresh one.
2. **A route-named graph outranks persisted `activeTabId`.** When the URL names an event graph,
   the persisted `activeTabId` is *advisory* and must be overridden before first paint — not after
   an effect settles. Operator: the workspace must not paint the deck until the route-named
   activation has been applied (one render gate), rather than painting the sidecar's choice and
   repainting.
3. **Declared in data, not in TS.** The tab's derivability is a property of the tab record, so it
   belongs in the workspace-state schema (`tab.derived: true` or equivalent, alongside the existing
   `kind`), and the PUT path strips derived tabs by reading that declaration. No new
   `if (id.startsWith('tab-deck-'))` in TypeScript — the current code's reliance on the id prefix
   (`legacyRouteResolution.ts`) is exactly the hardcoding this rules out.

## Verification (observable, not asserted)

- Cold-load `/project/STU-scratch/event-graph/<fixture-graph>` **8 consecutive times** on ONE served
  revision; screenshot the first painted frame each time. Pass: 8/8 show the fixture deck, zero
  frames containing the legacy graph's canvas.
- After each load, `GET /api/studies/STU-scratch/workspace` must contain **no derived tab ids**.
- Same probe with the store purged: the harness must fail closed (the `u5boardseed` seed+verify
  step), never drive a 404 board.
- `L2-PROMPT2-FIXTURE-BOARD-1` closes only on an 8/8 receipt attached to a named revision; a 7/8 is
  a fail, not a near-miss.

## Scope note

This does not reopen the fixture isolation work that landed. It closes the one seam that made that
work unmeasurable: the instrument paints a tab nobody asked for, 1 time in 8, so a WORKS verdict
was never trustworthy.
