# Session plan — Handoff completion: Phase 4.1 Deck Flatten (2026-08-02)

Source of truth: `.hermes/plans/2026-08-02_unified-tabs-completion-handoff.md`.
Branch: `feat/ai-extension-api`. App hot-reloads on :5174, backend :3001 — do NOT restart.

## Verified baseline (this session)
- `npm run typecheck` (app + server) → clean, exit 0.
- Both servers live. UI renders splash + GlobalNavbar (Projects/Runs/Claims/Lab/Ingestion).
- Working tree has the concurrent agent's /ingestion changes (untracked + modified) — do NOT
  stage them. Stage explicit paths only.
- Phase 0/1/2a/2b committed up through `a40e05b`. Host-page pattern = ArtifactHostPage/RecordHostPage.
- `execution` tab kind exists in types + LeftPane renders `ExecutionTabShell`, but NO call-site
  opens an execution tab (the handoff's "Plan/Execute buttons" in DeckModeSwitcher were reverted /
  do not exist in the clean file). Defer a full ExecutionHostPage; add execution tabPath parity only.

## Phase 4.1 — Deck as its own top-level tab
1. Create `app/src/shared/shell/DeckHostPage.tsx` mirroring ArtifactHostPage:
   - Params: `/deck/:eventGraphId/:runId?`.
   - Resolve studyId + title (run-bound → fetch run record for studyId/projectIds + title;
     bare deck → SCRATCH_STUDY_ID fallback).
   - Build `deckTab: WorkspaceTab` (`{ id: deck:<eventGraphId>, kind:'deck', eventGraphId,
     ...(runId?{runId}:{}), title }`).
   - Provider stack (copy ProjectWorkspacePage deck branch EXACTLY): WorkspaceProvider →
     EventEditorProvider(key=tab.id, eventGraphId?, runId?) → FocusModalsProvider →
     ProtocolSelectionProvider→AppShell(layout=workspace, WorkspaceTabStrip, viewerToolbar=
     <DeckToolbar tab breadcrumb/>, leftPane=<Viewer tab={deckTab}/>, rightPane=<RightPane/>)
     + ProtocolPreviewBridge.
   - Read breadcrumb from `openTabs.state` by tab id (mirror RunWorkspacePage). Import viewer.css
     + eventEditor.css at page level.
   - Provide a `deckTabId(eventGraphId)` helper in `workspace/types.ts` (stable dedup id).
2. Add `case 'deck': return /deck/${eventGraphId}${runId?'/'+runId:''}` to `tabPath`.
3. Add lazy route `/deck/:eventGraphId/:runId?` in App.tsx.
4. Convert `RunRow.attachProtocolMethod` (FindTabPanel.tsx): replace `ws.openTab({kind:'deck'...})`
   with `openTabs.openTab(deckTab, true, projectCrumb?[projectCrumb]:undefined)` + `navigate(route)`.
5. Defer: RunInEventEditorButton (scratch deck, no run context — keep within-workspace), execution
   host page (no entry path). Note both in report.

## Verification
- `npm run typecheck -w app`.
- Live browser: project homepage → run "Method from protocol" → deck opens as its own top tab with
  breadcrumb + tabPath restore.
- Compare test-failure count vs ~48 baseline (no NEW regressions).

## Out of scope this increment (check in with user)
- 4.2 non-destructive workspace.yaml migration (data-loss risk, concurrent agent active in tree).
- 4.3 back-stack / open-in-tab / deep-link / dedup polish.
