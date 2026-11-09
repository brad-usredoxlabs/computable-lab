# L2-CHAT-1 — Universal chat is THE chat everywhere; revision loop sewn into the universal path

CAMPAIGN: universal-chat (Brad-approved 2026-10-26). Binding UC-D1 (verbatim intent):
"the product should be universal chat with revision sewn in everywhere" — NOT restoring
AiTabPanel as the product. Corollary lock: no surface renders a chat pane whose event path
is unwired — dead pane = FAIL.

Base: trunk cl/integration-2 @ dac9f515. Worktree /mnt/vast/home/brad/git/wt/L2-CHAT-1-lane2-l2t0035,
branch cl/lane2-l2chat1-l2t0035. Deliverable report:
/home/brad/.hermes/cl/lanes/2/deliverables/L2-CHAT-1-report.l2t0035.md (write even if partial;
end with STATUS: line).

## Orch-verified anchors (first-hand at dac9f515)
- app/src/run/RunWorkspacePage.tsx:114 — `useSurfaceChat({ aiContext, endpoint: 'event-editor' })`
  passes NO accept handler; rightPane={<HarnessChatPane />} at :157.
- app/src/shared/hooks/useAiChat.ts — `grep -c resolvedLabwares` = 0: the done-handler never
  reads result.resolvedLabwares; `if (handler)` guards at :1093/:1146/:1221 no-op silently
  when absent. The file has NO honest-wall arm.
- app/src/agent/useSurfaceChat.ts — wires workstate/analysis/record-drafting proposal flow +
  handleAgentAction; NO event-shorthand/ghost leg, NO onAcceptEvent.
- app/src/agent/HarnessChatPane.tsx (75 lines) + ChatLog.tsx (206) — pure consumers of the
  AiPanelContext seam.
- The FIX LIVES IN AiTabPanel.tsx (1671 lines) only — revisionHistory round-trip (:312,
  :642-668), honest wall REPORTED failure (:373-379, :1154, :1432-1438 data-testid
  ai-tab-honest-wall), Stop escape on the interpreting window (:1591, :1635-1638), ghost mount
  via resolvedLabwares. Fix3 (d33a1bb6) touched ONLY AiTabPanel.tsx + assistStream.ts, so the
  universal path mounted on /runs + /deck (pane swap d1acccdc, direct main 2026-10-18) has
  NONE of it.
- config/drafting/shorthand-drafting.yaml `surfaces: [workspace.deck]` — surface ids
  'run-workspace' / 'event-editor' are NOT shorthand surfaces; their panes ride the legacy
  raw-event_graph path.

## Scope (port target = useAiChat.ts + useSurfaceChat.ts + ChatPreviewCard/ChatLog, NOT AiTabPanel)
1. Accept wiring: RunWorkspacePage (and any other useSurfaceChat call site lacking event
   accept) must wire a real onAcceptEvent through useSurfaceChat -> useAiChat so
   ChatPreviewCard Apply actually applies events (no more silent `if (handler)` no-op —
   make the missing-handler case loud, e.g. dev-time warning + user-visible error state,
   never silent).
2. Ghost mount: useAiChat done-handler must consume result.resolvedLabwares (the same
   contract AiTabPanel uses) so an event-bearing proposal mounts deck ghosts +
   ChangesPanel Apply/Discard on the universal pane.
3. Honest wall: port the REPORTED-failure semantics (zero mountable events + review state =
   plain-language failure, never a silently-empty plate beside a polished draft). Prefer
   EXTRACTING the wall logic into a shared module both panes consume over duplicating it —
   but do not refactor AiTabPanel beyond what extraction requires.
4. Revision trail + revise-turn reuse bindings (revisionHistory round-trip; answered cards
   persist inside the active proposal) + Stop escape on the interpreting window — port into
   the universal path (ChatLog/ChatPreviewCard render + useAiChat state).
5. Mount consistency: RunWorkspacePage.tsx:157, RightPane panelSlot?.chat decision point
   (RightPane.tsx:97-103 currently falls back to AiTabPanel), standalone /event-editor/:id,
   /deck/:id — one chat, one event/ghost path. Extend where universal chat already mounts
   proposals (Apply/Discard leg); do not duplicate.

## Boundaries
- Do NOT delete AiTabPanel's revision locks until universal equivalents exist (tests may
  keep both). Do NOT restore AiTabPanel anywhere new.
- Do NOT touch the resolver/badge vocabulary surface (resolvers.ts badges) — L2-TERM-1 owns
  that concurrently on another branch. If you need a shared module name, pick one that does
  not collide (e.g. shared/ai/chatHonesty.ts style).
- Server changes: only if a universal-path wire contract genuinely requires it; prove with a
  test. Any YAML change (e.g. shorthand-drafting surfaces) MUST be listed in the report —
  orch restarts the stack for YAML.
- Surface-membership decisions are DATA: if a pane must ride shorthand, that is a
  shorthand-drafting.yaml surfaces edit — propose it in the report, implement only with a
  test proving the pane's shorthand path works; otherwise leave membership alone.

## RED-first acceptance
- Vitest: revision trail + revise-reuse + honest wall + Stop render/behave through the
  UNIVERSAL path (useSurfaceChat/HarnessChatPane/ChatLog mounted via ChatPreviewCard),
  mirroring AiTabPanel's existing locks.
- Mount test: each mount point resolves to the universal chat with a wired accept handler
  (no pane renders dead chrome).
- `cd app && npx vitest run src/agent src/shared/hooks src/run src/event-editor/right-pane/RightPane*` green; app tsc sorted-diff zero NEW vs baseline.
- Report: files changed, what was extracted vs duplicated and why, YAML list, test tail,
  assumptions block.

## Evidence-debt note
The browser receipt (run workspace: canonical draft -> answer cards -> ghosts mount -> revise
-> revised ghosts REMOUNT -> Apply -> events on plate; plus one adversarial free-form turn
hitting the honest wall) is orch-owned after merge — do not attempt the vision gate.
