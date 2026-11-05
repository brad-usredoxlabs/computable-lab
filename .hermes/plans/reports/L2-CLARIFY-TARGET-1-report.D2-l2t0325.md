L2-CLARIFY-TARGET-1 UNIT D2-2 report (l2t0325)

Evidence:
- PreviewActionBar.test.tsx: 9 passed (6 baseline + 3 new)
- DeckStage.twoplate.uifix2.fix2.test.tsx: 1 passed (unchanged)
- tsc --noEmit: pre-existing errors only (no new errors introduced)

Changed files:
- app/src/event-editor/deck/PreviewActionBar.tsx (+8 lines: chatCommitSurface guard wrapping Discard and Accept buttons)
- app/src/event-editor/deck/PreviewActionBar.test.tsx (+30 lines: 3 new tests for commit verb visibility)

Commit: 1c2a66ead472cd21da8bea208f16f71bdde38ec6

L2-CLARIFY-TARGET-1-D2 UNIT D2-2 DONE 1c2a66ead472cd21da8bea208f16f71bdde38ec6

--- D2-fix2 (advc delta-review defect 1, binding fallback) ---

Change: PreviewActionBar.tsx line 152 — added `&& pendingDecisions.length === 0` to
chatCommitSurface so Accept stays visible when hasPreview is true but there are
unsigned ontology terms. The card's Apply hardcodes termDecisions: {} so it would
block the card; the deck bar's Accept is retained for the whole life of a term-heavy
preview and is the commit path when the card's Apply is blocked.

Ruling 24f95c54 fix direction (b): keep bar's Accept rendered when
pendingDecisions.length > 0.

Test changes:
- New test leg: "keeps Accept visible when chat.hasPreview is true but ontology
  terms need sign-off (D2-fix2 binding fallback)" — verifies Accept and Discard
  are rendered when hasPreview=true AND pendingDecisions > 0.
- Updated existing "hides Accept and Discard" test to use empty ontologyBindings
  so it correctly asserts hidden state when hasPreview=true AND no pending terms.

Evidence:
- RED (before fix): 1 failed test — expected /review terms to accept/i button to be truthy but got null
- GREEN (after fix): 10 passed (10 total)
- Files changed: 2 (PreviewActionBar.tsx +4, PreviewActionBar.test.tsx +21)
- git diff HEAD~1 --stat: 2 files changed, 24 insertions(+), 2 deletions(-)

Commit: 1a4bffbf

L2-CLARIFY-TARGET-1 UNIT D2-fix2 DONE 1a4bffbf

--- D2-fix3 (advc delta-review: gate-key inversion + commit test leg + report honesty) ---

DEFECT 1 (MAJOR): chatCommitSurface key was `pendingDecisions.length === 0` which hides
Accept post-sign-off when terms are signed (pendingDecisions=0, decisionNeeded>0). Fixed
key: `decisionNeeded.length === 0` — Accept stays for the whole life of a term-heavy
preview. Comment updated to name decisionNeeded (term presence), not pendingDecisions.

DEFECT 2 (MAJOR): No test exercised the AC. Added new test leg that opens "View changes",
signs off every decisionNeeded term, closes, asserts the bar's Accept button is present
AND clicking it calls persistAcceptedEventGraph exactly once.

DEFECT 3 (MINOR): Report :21 misstated "permanently blocked; the only commit path" —
corrected to "retained for the whole life of a term-heavy preview and is the commit path
when the card's Apply is blocked". Report :34 misstated RED assertion — corrected from
"expected Accept button to be truthy but got null" to "expected /review terms to accept/i
button to be truthy but got null".

Residual status: DeckChatSlice.tsx unchanged by design — termDecisions: {} in the card's
Apply path remains blocked. The bar's Accept is the fallback commit path.

Evidence:
- RED (before fix): 1 failed test — "Unable to find an accessible element with the role
  button and name Accept" — Accept was hidden post-sign-off
- GREEN (after fix): 11 passed (11 total)
- Files changed: 2 (PreviewActionBar.tsx +1/-1 expression + comment, PreviewActionBar.test.tsx +24)

Commit: ca34fa6e

---

Report corrections commit follows.
