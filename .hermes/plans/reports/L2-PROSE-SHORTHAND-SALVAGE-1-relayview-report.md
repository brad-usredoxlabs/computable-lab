# L2-PROSE-SHORTHAND-SALVAGE-1 / relayview-fix1 (advc c1 D1/D2/D3)

- Lane: 2; worktree: /home/brad/cl-wt/L2-PROSE-relayview-lane2
- Branch: cl/lane2-prose-relayview-0615
- Base HEAD at STEP 0: 21365607159a5941556f11487c524f7280aae9bc (matched; tree clean)
- Unit: relayview-fix1 (1 of 1). Reviews: adversarial c1 returned FIX D1 D2 D3.

## Decisions
- D2: deleted the `title` tooltip block from the status line (MessageLog.tsx). No new visible
  string; receipt plumbing reads `data-recovered-from`. No exemption sought.
- D3: marker-arm text pin tightened to exact equality (`status.textContent === message`); the
  title assertion was removed with the tooltip.
- D1: added hook-level legs in useChatThread.agentAction.test.tsx reusing the existing
  harness()/sendOnce(): positive forwarding (`recoveredFrom` ⇒ state.statusRecoveredFrom object),
  negative plain status ⇒ null, and one-turn lifetime (follow-up plain status clears to null).
  No production hook change (useChatThread.ts already forwards correctly).

## Changed files (3, all owned)
- app/src/event-editor/right-pane/ai/MessageLog.tsx — removed title prop block (5 lines).
- app/src/event-editor/right-pane/ai/MessageLog.batching.test.tsx — exact-equality marker pin,
  dropped title assertion.
- app/src/event-editor/right-pane/ai/useChatThread.agentAction.test.tsx — +3 tests (new describe).

## Verification (measured)
- Baseline before edit: `npx vitest run .../useChatThread.agentAction.test.tsx .../MessageLog.batching.test.tsx`
  → 16 passed (agentAction 7, batching 9).
- After edit, same command → 19 passed (agentAction 10, batching 9).
- Full seam `npx vitest run src/event-editor/right-pane/ai/` → 37 files, 278 tests:
  277 passed, 1 failed = ClarificationPicker.realshape.card1 (`Cannot find module
  './compose/composer.js'`, server/yaml symlink env issue at base; 274→277 passed delta is exactly
  the 3 added legs). No other failures.
- `npx tsc --noEmit` → 7 errors, all TS2307 module-resolution (prosemirror-view, yaml x2,
  ajv x2, ajv-formats, ajv/dist/2020.js) — same 7 as baseline, zero new error kinds.
- Mutation probes deliberately NOT run by the coder (brief prohibits); pins are forwarding /
  exact-equality so deleting the conditional spread at useChatThread.ts:239 makes the positive
  leg red (reducer then yields null), and appending visible tail text fails the exact pin.

## Commits
- b29a2a6a — drop title tooltip, tighten marker-arm text pin (D2/D3)
- fedbc6de — pin recoveredFrom forwarding in useChatThread (D1)

## Next actions
- Independent reviewer to run the D1 mutation probe (delete conditional spread) and the D3
  visible-string probe; browser reviewer re-reads screenshots only if marker DOM changed.
