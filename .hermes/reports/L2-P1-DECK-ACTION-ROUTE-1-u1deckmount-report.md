# L2-P1-DECK-ACTION-ROUTE-1 u1deckmount — unit report

Lane 2 | branch cl/lane2-deck-route-l2t2585 | base d983e52633ae228e0dbc9cb31ae5775b070063c7
Governing ruling: .hermes/plans/decisions/DECK-ACTIONS-ARE-THE-OPERATION-l2-20261114.md
- clause 1: "When a turn decides a plate belongs on the deck, it mounts through
  addLabware / addLabwareFromRecord — the same action the manual right-click uses."
- clause 3: "Anything the AI cannot route to an existing operation is a NAMED wall,
  not a silently accepted proposal."
§2 context line (architect-context-l2.md §2.16, Recording is not gated): the fix adds
NO prerequisite form and NO gate — the plate mounts through the already-wired deck
action, and nothing is invented (payload resolution falls back to the seed/local
payload exactly like the legacy per-event apply).

## Defect (base d983e5263)
On the deck surface, a done result carrying ONLY labwareAdditions (no events) hit the
named wall ("proposed N new labware, which this surface cannot mount without events")
even though the mount operation already exists in this hook: the legacy per-event apply
calls `resolveLabwareAdditionPayload` + `addLabwareFromRecordRef.current` (base :2504-2505),
but only the event-bearing path ever reached it.

## Fix (one seam, useAiChat.ts wall leg only)
In the wall leg (`if (!askedQuestion && !surfacedError && !answerDelivered &&
!navActionDelivered && !handledProposalFrame)`), BEFORE the unmountable list:
- if `labwareOnly && addLabwareFromRecordRef.current !== undefined`: for each addition,
  in a try/catch, `const payload = await resolveLabwareAdditionPayload(addition)` then
  `addLabwareFromRecordRef.current?.(payload as unknown as Record<string, unknown>, addition)`
  — exactly the legacy invocation shape (final file lines 2149-2157); count successes
  (`labwareMountedCount`) and failures (`labwareUnresolvedCount`).
- Successes: a plain-language summary system message ("Placed N new labware on the deck.")
  AND the wall closing clause reuses the adopted-summary pattern (L2-SUITE-A-uifix3 D1 /
  L2-P1-CREATE-RECORD-LANDS-1 arms): ` Placed ${n} new labware${plural} on the deck.`
  instead of "Nothing was proposed and nothing was applied." (final lines 2210-2212).
- The unmountable entry now names only what was NOT mounted:
  `labwareWallCount = handler === undefined ? additions.length : labwareUnresolvedCount`
  (final lines 2166-2168). No handler wired → base wording byte-identical; payload
  throw → that addition keeps the exact base wall string ("proposed 1 new labware,
  which this surface cannot mount without events") — the wall names truth.
- Guarded by the `!hasEvents` wall context (the event-bearing adoption path at
  final :2534 is untouched); the deckLayout/recordCreations/notes arms of the closing
  are unchanged and still take precedence.
Final wall-leg code (HEAD):
  app/src/shared/hooks/useAiChat.ts:2141-2172 (routing block + wall count), :2210-2212 (closing arm).
Changed lines: useAiChat.ts +33/−3; test file +80 (new). Total 116 changed lines (<=120), 2 files (<=2).

## RED (first)
Commit f4e47e7445c9fa097caf5e4a3729f9cd53ef4046 "L2-P1-DECK-ACTION-ROUTE-1 u1deckmount RED: ...".
Test file on base hook (verified by checking out base useAiChat.ts):
  $ cd app && npx vitest run src/shared/hooks/useAiChat.deckRoute.test.tsx
  → Test Files 1 failed (1); Tests 1 failed | 2 passed (3)
  test 1 fails: "expect(spy).toHaveBeenCalledTimes(1)" — spy received 0 calls, and the
  wall carries "cannot mount without events". Tests 2/3 pin base behavior and pass on base
  (they are the acceptance locks for AC2/AC3).
Baselines recorded BEFORE any edit (on base d983e5263):
  useAiChat.adoptError.regatefix2.test.tsx → 2 passed
  useAiChat.wall.test.tsx → 6 passed
  npm run typecheck → 17 pre-existing "error TS" (saved /tmp/lane2-typecheck-base.txt)

## GREEN (HEAD 02da0cc5d)
$ cd app && npx vitest run src/shared/hooks/useAiChat.deckRoute.test.tsx \
      src/shared/hooks/useAiChat.adoptError.regatefix2.test.tsx \
      src/shared/hooks/useAiChat.wall.test.tsx
→ Test Files 3 passed (3); Tests 11 passed (11)   (3 + 2 + 6 — neighbouring counts unchanged)
$ cd app && npm run typecheck → 17 "error TS"; diff vs baseline (sorted, line/col stripped) = 0.

## Acceptance map
1. Handler wired → one call per addition, no "cannot mount": test 1 (payload kind/recordId
   checked, "Placed 1 new labware on the deck." in transcript, no "cannot mount").
2. No handler wired → byte-identical base wall wording: test 2 (exact base string asserted;
   no "Placed" in transcript; closing keeps "Nothing was proposed and nothing was applied.").
3. Payload throw keeps the named wall: test 3. The spy throws ONLY on the resolver's call —
   code path: `labwareDefinitionRecordToPayload` (imported by resolveLabwareAdditionPayload)
   is ALSO read by `getLinearWellTemplate` inside normalizePreviewEvents (before the wall
   leg, a pre-existing path this unit must not crash), so the spy distinguishes by call
   count (1st call passes, 2nd throws). Caught by the new try/catch → labwareUnresolvedCount
   = 1 → wall keeps the base wording; the throw is contained (no outer-catch "Error:"
   message). This subtlety was found by a scratch probe (later deleted): a blanket spy
   throws at the earlier baseline site and crashes the whole done branch — pre-existing
   behavior, outside this unit's seam.
4. Event-bearing path untouched: regatefix2 2/2 unchanged; the new block sits inside the
   `!hasEvents` wall context; legacy call sites at final :2534/:2752 unmodified.

## Decisions / notes
- Reused the legacy invocation shape verbatim (brief: "copy this invocation shape, do not
  reinvent it"); did not add ghost mounts (the mount is the committed deck action).
- Wall closing: added one ternary arm mirroring the existing deckLayout/recordCreations
  pattern (those still take precedence) rather than a parallel message mechanism.
- No handler / throw cases keep the EXACT base wall string, so no surface wording changed
  for them.
- Prohibited files untouched: LabwareEditorContext.tsx, LabwareEventEditor.tsx,
  LabwareList.tsx, ChatLog.tsx, PreviewActionBar.tsx, server/, schema/, records/, PromptBar.

## Verification commands (exact)
1. cd app && npx vitest run src/shared/hooks/useAiChat.deckRoute.test.tsx
   base-hook re-run: "Tests 1 failed | 2 passed (3)"; on HEAD: 3 passed (3).
2. cd app && npx vitest run src/shared/hooks/useAiChat.adoptError.regatefix2.test.tsx \
       src/shared/hooks/useAiChat.wall.test.tsx → "Tests 8 passed (8)" on base and HEAD.
3. cd app && npm run typecheck → 17 errors base and HEAD; delta 0 (verified by sorted diff).

## Commits (branch tip)
- f4e47e7445c9fa097caf5e4a3729f9cd53ef4046 RED (test file only)
- 02da0cc5d6e4843ef275e6772edcead91c459c77 GREEN (useAiChat.ts wall leg + final test form)
- (this report + -DONE marker: final commit)
