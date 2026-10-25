# W211-G1DRIFT-1 — coder report (l2t0530)

Item: W2-11 G1 leg broken by the MATRES-PANEL fold-surface swap (harness repair).
Worktree: /mnt/vast/home/brad/git/wt/W211-G1DRIFT-1-lane2-l2t0530
Branch: cl/lane2-w211-g1drift-1-l2t0530 (off trunk e1c443e2)
Scope honored: app/e2e/w2-11-campaign-demo.spec.mjs ONLY (+ this report).
Zero app/src / server/src / schema hunks (verified: `git -c core.fileMode=false diff --name-only`
lists exactly the one spec file). No stack script run, no port signaled.

## 1. Root cause (confirmed first-hand in this worktree, matching the orch evidence)

- f57c50c9 (MATRES-PANEL §7.1-§7.3, merged) replaced the flat held-422 card list with
  `<ClarificationPanel>` (ProtocolLocalizationThread.tsx:785). The panel container's testid is
  `pl-clarification-panel` (ClarificationPanel.tsx:147). Per-card `pl-clarification-card` (:163)
  and the menu span `.pl-held-clarification-menu` (:166) SURVIVE inside the panel.
- First-hand grep across app/src: `pl-clarification-cards` exists NOWHERE in app/src (only in the
  e2e spec and two e2e probe files). The G1 leg queried it at :1439 (chain-survival) and :1473
  (render gate) -> `cardsUp` was always false despite the fold happening correctly (draw2 422),
  so the leg misread the fold as a remount-wipe, re-drove against a textarea still holding the
  typed fixture prose (settleThread's family-derived-text bar can never re-stabilize there),
  and burned all 3 attempts. This is the byte-identical signature of g1-private-l2t0530.log.

## 2. Changes made (all in app/e2e/w2-11-campaign-demo.spec.mjs)

1. :1458 (chain-survival check): `getByTestId('pl-clarification-cards')` ->
   `getByTestId('pl-clarification-panel')`, with a line comment naming f57c50c9 as the drift
   source.
2. :1495 (cards-render gate): same swap. The per-card scoping
   `cards.locator('[data-testid="pl-clarification-card"]')` and `toHaveCount(2)` are UNCHANGED —
   the panel renders exactly one `pl-clarification-card` <section> per answerable fact
   (ClarificationPanel.tsx:153-163), so the count bar is identical, not weakened.
3. Re-drive honesty (contract-sanctioned): added `reDriveReset()` — on attempts 2-3 the leg now
   `page.reload({ waitUntil: 'networkidle' })`, re-clicks the Protocol tab, and re-waits for
   `protocol-localization-details` before re-settling. Rationale: after a failed chain the
   textarea holds the typed fixture text, so settleThread's family-derived-text condition can
   only re-stabilize after a REAL remount; the reload IS that remount. State-based, no longer
   sleep, settle requirement untouched. It also re-runs `clearGoldenNonce(fx)` so a failed
   attempt that already fired the real mint act cannot leave the class-(c) noun pre-existing
   for the re-drive (same rider the leg runs at start; zero-match premise restored, never
   relaxed).

## 3. Selector audit against the LIVE panel DOM (every remaining G1 interaction)

Each G1 surface the leg touches was checked first-hand at this tip; only the two container
selectors moved. Criteria (counts, '/l'//m' pins, no-mint-floor on '/l', mint floor on '/m',
clear-on-next-draw, ANSWER-BIND-1 shrink, deck review labels/checkbox count, accept, LPR,
SEAM-A log) are all UNCHANGED.

| Leg selector | Live source | Status |
|---|---|---|
| pl-clarification-panel | ClarificationPanel.tsx:147 | FIXED (was dead pl-clarification-cards) |
| [data-testid="pl-clarification-card"] x2 | ClarificationPanel.tsx:163 | alive |
| .pl-held-clarification-menu '/l'//m' | ClarificationPanel.tsx:166 (request.menuProvider) | alive |
| bCard/cCard hasText filters | card head label span :170 + option label span :199 | alive |
| .message-log__clarification-search | ClarificationPicker.tsx:275 (panel mounts the picker per slot, :212-221) | alive |
| [data-slash-row] picker rows | SlashSuggestionList.tsx:130 | alive |
| mint floor row 'Create local term' | resolvers.ts:115 (`mint:<q>` floor row, resolveMaterial only) + ClarificationPicker canMint :268-269 | alive; '/l' zero-mint-row bar holds (resolveLabware emits no mint row) |
| (c) mint search seeded to label | ClarificationPicker.tsx:164/180 (query = request.query) | alive |
| (c) mint floor availability | slotPickerLayer (panelSemantics.ts:156-171): unknown-noun candidates degrade to `unspecified` arm -> mintAllowed -> layer undefined -> unscoped '/m' menu keeps the floor | holds |
| pl-clarify / pl-axis / pl-axis__choice / pl-submit-answers | ProtocolLocalizationThread.tsx (untouched by f57c50c9's render swap) | alive |
| pl-deck-review, .pl-deckreview-item__label, deck-labware-<key>, pl-load-deck, pl-accept, pl-msg | ProtocolLocalizationThread.tsx:800-830 etc. | alive |
| right-pane-tab-protocol | RightPane.tsx:79 (`right-pane-tab-${mode}`, 'protocol' in TABS :36) | alive (re-drive reset uses it) |

## 4. RED -> GREEN logic

- RED (pre-fix, reproduced from the orch logs, not re-run here — no stack touch allowed):
  draw1 ask 200 -> draw2 answered compile 422 (fold CORRECT) -> `cardsUp=false` because
  `pl-clarification-cards` no longer exists -> "remount wiped the chain" misread -> attempts
  2-3 fail at settleThread stable>=3 (textarea holds attempt-1 fixture prose, family-derived
  text can never return without a remount) -> G1 fails identically on both stacks.
- GREEN (post-fix, static): the fold check now queries the container the product actually
  renders (pl-clarification-panel), so a correct fold reads cardsUp=true and the leg proceeds
  to the card gates. If a genuine late key-flip wipe occurs, the reload-based re-drive restores
  the family-settled state so settleThread can honestly re-stabilize and re-drive.
- The live G1 determinism gate (>=3 consecutive green runs + receipts) is the ORCH's to run
  after merge, per contract; this lane verified everything verifiable without a stack.

## 5. Verification actually run (no stack, no ports)

- `node --check app/e2e/w2-11-campaign-demo.spec.mjs` -> SYNTAX_OK.
- vitest run e2e/fixtures/w211-golden/zymo-intent.integrity.test.ts (the spec's unit sibling)
  -> 8/8 passed (fixture pins + adapter answer-surface verdicts intact).
- vitest run ClarificationPanel.test.tsx + ProtocolLocalizationThread.clarificationCards.test.tsx
  + ProtocolLocalizationThread.optionbind.test.tsx -> 22/22 passed: proves
  pl-clarification-panel / pl-clarification-card / menu spans are the LIVE surfaces the fixed
  selectors now target.
- Scope gate: `git -c core.fileMode=false diff --name-only` -> only
  app/e2e/w2-11-campaign-demo.spec.mjs (34 insertions, 6 deletions).

## 6. Known residuals (named, not weakened)

- app/e2e/probes/w211-chain-probe.mjs:40 and w211-remount-probe.mjs:32 still query the dead
  `pl-clarification-cards`. They are diagnostic-only (not part of the G1 gate, not collected by
  playwright testDir runs as specs) and OUTSIDE this item's file scope; flagged for the orch to
  fold into a follow-up harness touch if the probes are ever re-used.
- Class-(d) gap-fact deck-surface answerability remains BLOCKED-ON-FIX (W211-GAPCARD-1) —
  unchanged by this item.

## 7. Resume condition for the orch

Merge this branch, re-seat the stack, run the G1 determinism gate (>=3 consecutive green runs,
receipts under app/e2e/receipts/w211-mach1-l2t1740/), then dispatch cl-browser-reviewer on the
MACH-1 spec surfaces for the VERDICT accept. If G1 still fails, the new attempt logs will show
whether cardsUp is now true (residual genuine-remount class) vs false (a different dead
selector — the audit table above is the first place to check).
