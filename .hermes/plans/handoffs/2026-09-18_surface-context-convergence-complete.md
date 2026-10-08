# Handoff — Surface-Context Convergence COMPLETE + toFixed crash fixed

Date: 2026-09-18 (late evening)
Session: Hermes architect profile `architect-q38` (qwen3.8-flash-next @ http://thunderbeast:8080/v1)
Repo: /mnt/vast/home/brad/git/computable-lab (all changes UNCOMMITTED — working tree)

## What landed this session

### 1. Legacy AiContext seam fully retired (app frontend)
Pages → AI chat now flow ONLY the convergent `SurfaceContextPayload`
(`app/src/shared/context/useSurfaceContext.ts`: surface, active, selection,
surfaceData?, editorMode?). No free-text summary anywhere.

Landed (all parent-verified: `npm run typecheck -w app` exit 0; targeted
vitest 24/24 → then 22/22 after discriminator removal):
- `app/src/shared/api/aiClient.ts` — `streamAssist(prompt, surface: string, ...)`,
  `AiSurface` import gone.
- `app/src/shared/hooks/useAiChat.ts` — accepts only `SurfaceContextPayload`;
  deleted legacy discrimination, `legacy!` casts, and the
  `surface === 'event-editor'` mention branch. Mention injection is now purely
  data-driven: `surfaceData.mentions` or `surfaceData.mentionsFromPrompt === true`
  (LabwareEventEditor already opts in via useLabwareAiContext).
- `app/src/shared/hooks/useAiChat.{empty,triState,surfaceContext}.test.ts` —
  fixtures migrated to payload shape.
- `app/src/types/aiContext.ts` — stripped to file-attachment exports only
  (ACCEPTED_FILE_TYPES, ACCEPTED_MIME_TYPES, MAX_FILE_SIZE_BYTES,
  MAX_FILES_PER_MESSAGE, FileAttachment, isImageFile, getFileExtension,
  isAcceptedFileType, formatFileSize). `AiSurface` + `AiContext` deleted.
- `isSurfaceContextPayload` discriminator + its tests deleted (last consumer gone).
- Also migrated earlier in the session: RunWorkspacePage.tsx (surface string
  `run-workspace:${activeTab}` preserved — server prompt routing prefix-matches),
  LiteratureExplorer.tsx. All six page call sites confirmed on useSurfaceContext.

DELIBERATELY NOT touched: server-side `AiSurface` in
`server/src/ai/systemPrompt.ts` / `server/src/api/handlers/AIHandlers.ts` —
wire-side surface routing converges onto `schema/registry/surfaces/surfaces.yaml`
(GET /api/surfaces) in its own future phase. Do not "clean this up" piecemeal.

### 2. toFixed crash fixed (user hit: "Cannot read properties of undefined (reading 'toFixed')")
Context: user added a 24-tube rack to the PureLink run deck + 4 tubes via the AI agent.

Root-cause chain (all verified against the user's REAL data — labs keep data in a
SEPARATE repo from code; the running server's embedded-git worktree is
`/home/brad/.computable-lab/worktrees/main`, remote appliance-02.git; event
`evt-ag-mu7o7g0t-1` in event-graph EVG-purelink...bd96fae):
- AI agent authored `place_tube` with `details: { labwareId, wells, tubeVolumeClass: '1.5ml' }`
  — labware-REQUIREMENT vocabulary — instead of event-contract
  `details.tube: { sizeLabel, maxVolume_uL }` (`PlaceTubeDetails`, types/events.ts).
- Server `parseEvents` (server/src/ai/submitSuggestionTool.ts ~line 437) passes LLM
  details through VERBATIM — no validation.
- Reducer `applyPlaceTube` did `newState.tube = { ...details.tube }` → spreading
  `undefined` yields a truthy field-less `{}` that passed every `state.tube ?` guard.
- Crash site: `app/src/event-editor/focus/WellTooltip.tsx:66` →
  `formatVolume(state.tube.maxVolume_uL)` → `undefined.toFixed(1)`.

Fix (TDD, `app/src/graph/lib/eventGraph.ts`): new `resolvePlacedTube(details, labware)`
normalizer used by applyPlaceTube — valid descriptor passes through; else a
tubeVolumeClass/sizeLabel hint resolves against shared `TUBE_SIZE_PRESETS`
(app/src/types/tubeSizes.ts — no new hardcoded table); final fallback
`defaultTubeForLabware(labware)`. RED tests written first in
`app/src/graph/lib/eventGraph.tube.test.ts` (2 new cases), then GREEN.

Verified: 8/8 tube tests, 22/22 `src/graph/lib` tests, typecheck clean, LIVE browser
check on the actual deck (computable:5174 → Runs → 2026-09-12 Run → Design): rack
renders, focus view opens, tooltip renders "1.5 mL tube · 1.50 mL cap", console clean.

## Open issues (next session candidates, in rough priority order)
1. **Producer still emits wrong place_tube shape.** Reducer now tolerates it, but the
   cure is server-side: make the agent emit `PlaceTubeDetails` (prompt/tool-schema
   in server/src/ai/, or a declarative lint rule over event payloads — canon rule:
   business logic in lint YAML, not TS).
2. **`virtual:cla-ai-overlay` test-env gap** — biggest lever on the failing unit-test
   baseline: `npm run test:unit -w app` fails 50 files/93 tests, but MOSTLY collection
   errors `Failed to resolve import "virtual:cla-ai-overlay" from src/extensions/loadOverlay.ts`
   (Vite virtual module missing under vitest) + 21 Playwright e2e specs wrongly
   collected by vitest. Pre-existing dirty baseline (see .hermes/plans/2026-08-05_test-failures-master-plan.md).
3. **WorkspaceShellHost setState loop** — ProjectWorkspacePage.tsx:105
   "Maximum update depth exceeded"; project workspace stuck on "Loading…" spinners.
   Pre-existing, unrelated to this session.
4. **"pre-fill failed"** chip in the event-editor AI panel (KV-cache warm call) since
   the server restart. Cosmetic.
5. **~277 files carry an exec-bit flip** (100644→100755) from the OS migration — noise
   in every `git diff`. One `git add --rewenormalize`-style pass fixes it; not done yet.

## Environment facts this session proved
- Labs' DATA lives in a separate repo from CODE. Running server binds
  `/home/brad/.computable-lab/worktrees/main` (embedded-git, remote
  github.com/brad-usredoxlabs/appliance-02.git). Don't hunt for user data under
  the code repo's records/ dir.
- Server relaunch: `./start-app.sh` from repo root (background proc_7bf5c48c2e99;
  backend :3001, frontend :5174 at computable:5174; logs in .run/).
  `/api/health` 200, AI wired to thunderbeast qwen3.8-flash-next.
- Old named subagent profiles (fast-coder, code-reviewer, web-search, code-summarizer)
  were LOST in an OS migration. delegate_task children simply inherit architect-q38's
  model (qwen3.8-flash-next @ thunderbeast:8080/v1) — worked well: probe 33s, wave of
  3 children ~9 min, wave of 2 ~3 min. Prescribe contracts in child contexts, disjoint
  file ownership, parent re-runs the gates.
- Full app unit baseline is dirty (see open issue 2) — gate with targeted vitest +
  `npm run typecheck -w app`, not the full suite.

## Verification commands (all green at handoff time)
```
cd /mnt/vast/home/brad/git/computable-lab
npm run typecheck -w app                                  # exit 0
grep -rn 'isSurfaceContextPayload|export type AiSurface|export interface AiContext' app/src   # zero
cd app && npx vitest run src/graph/lib/eventGraph.tube.test.ts        # 8/8
npx vitest run src/shared/hooks/useAiChat.surfaceContext.test.ts \
  src/shared/hooks/useAiChat.empty.test.ts \
  src/shared/hooks/useAiChat.triState.test.ts \
  src/shared/context/useSurfaceContext.test.ts            # 22/22
```
