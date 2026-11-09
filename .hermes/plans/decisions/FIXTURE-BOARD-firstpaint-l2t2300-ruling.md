# ARCHITECT RULING — L2-PROMPT2-FIXTURE-BOARD-1: STU-scratch first-paint seam (lane 2, l2t2300)

Date: 2026-11-05 23:00 EST. Decider: architect. Requested by: lane-2 orchestrator (l2t1945
`BLOCKED-EXTERNAL` escalation: "1-in-8 flake — `GET /api/studies/STU-scratch/workspace` lists legacy
`tab-deck-EVG-cellrox-…` alongside the fixture tab, intermittently wins first paint. Seam question ->
architect/workspace-side unit").

Inputs (read at source this session, none relayed):
- `server/src/api/handlers/WorkspaceHandlers.ts:1-20, 60-120` — the sidecar contract:
  `<recordsRoot>/studies/<studyId>/workspace.yaml`, GET falls back to a default, PUT is atomic
  tmp+rename, "no SHA-based optimistic locking. Last writer wins by design — the values are low-stakes
  and the debounced client throttles concurrent writes."
- `app/src/event-editor/projects/ProjectWorkspacePage.tsx:204-219` — the deep-link effect. It calls
  `ws.openTab({ id: \`tab-deck-${autoOpenEventGraphId}\`, kind: 'deck', … })` with **no `activate`
  argument**.
- Same file `:228-236` — the bare-route landing effect, which DOES pass the flag:
  `ws.openTab({…}, true)`.
- `app/src/shared/shell/OpenTabsContext.tsx:500` / `app/src/event-editor/workspace/WorkspaceContext.tsx:48`
  — the contract: `openTab(tab: WorkspaceTab, activate?: boolean)`.
- `app/src/event-editor/projects/ProjectWorkspacePage.tsx:111-112, 355-358` — the renderer takes
  `ws.state.activeTabId` and `findActiveTab` returns null for an unknown id, so whatever the sidecar
  says becomes first paint.
- Fixture-board spec-of-record `.hermes/plans/2026-11-04_0640-L2-PROMPT2-FIXTURE-BOARD-1-spec.md`
  P25 (gate URL `/project/:studyId/event-graph/:id` opens a deck tab for THAT id) and its gate_url
  `http://localhost:5193/project/STU-scratch/event-graph/EVG-corpus2-prompt1-dmem-baseline`.
- Deliverable `.hermes/plans/deliverables/L2-PROMPT2-FIXTURE-BOARD-1-report.u3finish.md` — 7/8 isolated
  verification runs pass; the 8th first-paints the legacy tab.

---

## 0. THE DEFECT, STATED EXACTLY

The URL names the board the user asked for. The page opens that board's deck tab but does not make it
active; activity is decided by `workspace.yaml`'s remembered `activeTabId`, which is last-writer-wins and
debounced. So when `STU-scratch/workspace.yaml` was last written by a session sitting on the legacy
`tab-deck-EVG-cellrox-…`, the deep link lands there instead — intermittently, depending on which write
landed last. That is a precedence defect, not a timing defect: two sources of truth disagree and the
weaker one currently wins.

## 1. DECISION

**The ROUTE wins. When the URL names an `eventGraphId`, that graph's deck tab must be the ACTIVE tab once
the workspace is ready — deterministically, with no retry, sleep or polling.**

- The route is the user's stated intent for this navigation. `workspace.yaml` is remembered UI shape —
  by its own handler doc "low-stakes … last writer wins". Precedence: stated intent > remembered shape.
- Rejected — **retry/sleep in the harness**: it hides a product defect behind timing and would make the
  8/8 acceptance meaningless.
- Rejected — **serialising workspace PUTs / adding optimistic locking**: it does not remove the
  disagreement, only makes which side wins harder to predict; out of scope, and unnecessary once
  precedence is defined.
- Rejected — **moving the fixture to its own study id**: the corpus prompt's own door is `STU-scratch`
  (`/project/STU-scratch/event-graph/<id>`); the gate must drive the product's door, not a harness-side
  private one. Isolation stays inside the study.

## 2. THE EDIT (one seam, small)

`app/src/event-editor/projects/ProjectWorkspacePage.tsx:212-218`: pass the activate flag —
`ws.openTab({ id: \`tab-deck-${autoOpenEventGraphId}\`, kind: 'deck', eventGraphId: autoOpenEventGraphId,
title: autoOpenEventGraphId }, true)`. Keep the existing `openedRef` idempotency guard so a re-render
cannot re-activate and yank the user back after they deliberately switch tabs. Do not change
`WorkspaceHandlers` or the sidecar format.

## 3. ACCEPTANCE (RED first, pasted raw)

1. **RED at current trunk**: a unit pin mounts the deep-link route with a hydrated workspace whose
   `activeTabId` is a DIFFERENT deck tab (`tab-deck-<legacy-id>` present in `tabs`); the named graph's
   tab is NOT active. **GREEN** after the fix: it is active, and the legacy tab still exists in `tabs`
   (nothing is deleted — the user's tab strip is untouched).
2. **Idempotency pin**: after the user switches to another tab, a re-render of the same route does NOT
   re-activate the deep-linked tab (the guard holds; `activate` fires once per `studyId::eventGraphId`).
3. **Bare-route pin unchanged**: `/project/:studyId` with no graph id still lands on the project-details
   homepage.
4. **Determinism, not luck**: the 8-run isolated verification is the acceptance for the item. 8/8, no
   sleeps, no retries; every run's first paint is the named board. Mutation-check pin 1 (drop the
   `true`) and it must go RED.
5. `npm run typecheck -w app` clean for touched files; `npm run test:unit -w app` green for the file.

## 4. FILES

`app/src/event-editor/projects/ProjectWorkspacePage.tsx` (+ its test). PROHIBITED:
`server/src/api/handlers/WorkspaceHandlers.ts`, `records/**`, `schema/**`, the fixture board YAML.

## 5. RESUME

FIXTURE-BOARD can be re-cut immediately on this ruling; the orchestrator owns the brief. The item's
`BLOCKED-EXTERNAL` is cleared: the blocker was this precedence question, not a missing dependency. The
fixture board YAML and the tooltip probe already delivered (u1/u2/u3finish) stand unchanged.
