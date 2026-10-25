# W211-G1DRIFT-1 — W2-11 G1 leg broken by the MATRES-PANEL fold-surface swap (harness repair, W2-11 closure obligation)

Item: W2-11-ZYMO-GOLDEN-DEMO closure leg (remaining obligation per W211-GATE-RESHAPE:
G1 green + cl-browser-reviewer VERDICT accept on the MACH-1 spec surfaces).
Class: E2E HARNESS drift. NO product-code fix is in scope.

## First-hand evidence (orch, 2026-10-25 l2t0530 tick)

1. G1 on the ORCH stack (SEAM A wired, :5193/:3093): FAILED at settleThread
   (log lanes/2/logs/g1-seam-orch-l2t0430.log).
2. G1 on the CODER-PROVEN private stack mechanics run ON TRUNK
   (scripts/w211-private-stack.sh — identical bytes to the coder's green
   environment script; data dir /home/brad/.computable-lab-lane2-w211;
   :3193/:5293/:43117): FAILED with the BYTE-IDENTICAL signature
   (log lanes/2/logs/g1-private-l2t0530.log):
   draw1 ask 200 -> draw2 answered compile 422 -> "late thread remount wiped
   the chain (cards=false nonceKept=true)" -> attempts 2-3 fail at
   settleThread stable>=3.
   -> Data-drift hypothesis REFUTED: identical failure in the deterministic env.
3. ROOT CAUSE (verified first-hand in trunk sources):
   f57c50c9 (MATRES-PANEL §7.1-§7.3, merged) swapped the held-422 fold surface:
   ProtocolLocalizationThread.tsx:785 now renders <ClarificationPanel> whose
   container testid is `pl-clarification-panel` (ClarificationPanel.tsx:147).
   The per-card testid `pl-clarification-card` (:163) and the menu class
   `.pl-held-clarification-menu` (:166) SURVIVE inside the panel, but the
   CONTAINER testid `pl-clarification-cards` NO LONGER EXISTS anywhere in app/src.
   The G1 leg (app/e2e/w2-11-campaign-demo.spec.mjs) queries
   getByTestId('pl-clarification-cards') at :1439 (chain-survival check) and
   :1473 (cards-render gate). So the fold happens CORRECTLY (draw2 422 proves
   it), but `cardsUp` is false, the leg misreads it as "remount wiped the
   chain", re-drives, and never recovers (the textarea holds the typed fixture
   text from attempt 1, so settleThread's family-derived-text condition can
   never re-stabilize) -> 3 attempts burn -> fail.

## Fix scope (e2e ONLY)

File: app/e2e/w2-11-campaign-demo.spec.mjs (G1 test, ~:1290 onward).
- Replace the dead container selector `pl-clarification-cards` with the live
  `pl-clarification-panel` (both call sites: :1439 chain-survival, :1473
  render gate). Keep `[data-testid="pl-clarification-card"]` per-card scoping,
  `.pl-held-clarification-menu` '/l'//m' pins, and every downstream surface
  UNCHANGED.
- Read the NEW panel structure first-hand (ClarificationPanel.tsx) and verify
  each remaining G1 card interaction (option pick, mint floor, next-draw clear)
  still resolves against the panel's DOM; adapt ONLY selectors that the swap
  moved — criteria (counts, menus, clear-on-next-draw, deck review, LPR) are
  NEVER weakened. If a card-interaction selector is genuinely dead, cite the
  new one with a line comment naming f57c50c9 as the drift source.
- If settleThread's re-drive recovery proves fragile even with correct
  selectors, you may make the re-drive reset state honestly (e.g. reload the
  page before re-settling) — state-based, never a longer sleep, and never
  removing the settle requirement.

## Contract

- Worktree: /mnt/vast/home/brad/git/wt/W211-G1DRIFT-1-lane2-l2t0530
  branch cl/lane2-w211-g1drift-1-l2t0530 off trunk e1c443e2.
- Files in scope: app/e2e/w2-11-campaign-demo.spec.mjs ONLY (+ .hermes docs).
  Zero app/src, server/src, schema hunks (scope gate: git -c core.fileMode=false
  diff <base>..HEAD --name-only).
- NO stack touches: never signal :3093/:5193/:3001/:5174/:3193/:5293/:43117.
  Do NOT run scripts/w211-private-stack.sh (orch owns it this window).
  Verify by: vitest on the touched spec's unit siblings if any + your own
  targeted static reasoning; the ORCH runs the live G1 determinism gate after
  your merge. Write the RED->GREEN logic into your report.
- Report: .hermes/plans/W211-G1DRIFT-1-report.l2t0530.md in YOUR worktree.
  End stdout exactly `W211-G1DRIFT-1 DONE <sha>`.
- All git via `git -c core.fileMode=false`. node_modules are symlinks —
  install nothing.
