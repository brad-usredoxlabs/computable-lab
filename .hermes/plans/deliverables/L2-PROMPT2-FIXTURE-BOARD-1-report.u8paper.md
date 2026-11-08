# L2-PROMPT2-FIXTURE-BOARD-1 — Unit Report (u8paper)

## Code commit
- **c468d97872469adc819d355cef4923f6eea6c8d4** — FIXTURE-BOARD u8: route activation precedes first ready frame
- Merged into trunk **cl/integration-2** at **cd114eef** (advc c1 ACCEPT, 0 defects)

## Changes (5 files, +91 / −2)
| File | Lines | Description |
|------|-------|-------------|
| `app/src/event-editor/legacyRouteResolution.ts` | +6 | Legacy-route stub updated |
| `app/src/event-editor/projects/ProjectWorkspacePage.tsx` | +6 | Route activation triggered before first ready frame |
| `app/src/event-editor/workspace/WorkspaceContext.tsx` | +20 | Context wiring for pre-ready route activation |
| `app/src/event-editor/workspace/types.ts` | +3 | New type for route-gate state |
| `app/src/event-editor/workspace/WorkspaceContext.test.tsx` | +58 | Unit tests covering pre-ready activation path |

## What changed
The u8 commit moves route activation so that it fires **before** the first ready frame is emitted. Previously the route was activated after the ready frame, leaving a window where the workspace had no route but was already "ready". The fix in `ProjectWorkspacePage.tsx` ensures the route is set on the context before `onReady` fires, verified by 58 lines of new unit tests in `WorkspaceContext.test.tsx`.

## Adversarial review
- Report: `reviews/L2-PROMPT2-FIXTURE-BOARD-1-u8routegate-advc-c1-l2t1700.md`
- Verdict: **ACCEPT** — 0 defects
- Merge commit: **cd114eef** into cl/integration-2

## Browser gate
- Owed by the ITEM: 8/8 cold-load passes (browser gate)
- Status: **unit delivered; item pending browser VERDICT**

L2-PROMPT2-FIXTURE-BOARD-1 UNIT u8paper DONE c468d97872469adc819d355cef4923f6eea6c8d4
