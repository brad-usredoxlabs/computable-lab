# L2-GROUPEDSUBMIT-ARM-ANSWER-1 u4bfix1 Outcome Report

## Summary
Fixed the `answerAllSlots` slot-kind classification and delegated answer arms to be slot-scoped,
plus added wells/option/parameter arms to `answerSlot`, and index-keyed receipt in leg4.

## Defects Resolved

D1 — Classification keyed on slot label (`chat-clarification-slot-identity`), a marker only rendered
when `request.slot !== undefined`. Chat-path requests never carry `slot`, so the identity picker
(`clarification-identity-search`) was invisible to the classifier. Fix: classification now probes
the answer SURFACE inside each slot (picker, chip, wells, options, parameter), matching
ChatClarificationCard.tsx:193-249 precedence. The label marker is deleted from `chrome.cjs`.

D2 — `answerSlot(page,'option',v)` threw "unknown kind: option". Fix: added `option` arm (click
numbered-option button matching the value) and `wells` arm (fill `clarify-well-target`, click
`clarify-well-target-approve`) and `parameter` arm (fill input, click submit).

D3 — Page-wide `.first()` at chrome.cjs:61-64 could fill the wrong slot on a multi-identity card.
Fix: `answerSlot` accepts optional 4th arg `root` (slot locator). When present, all probes resolve
from `root.locator(...)` instead of `page.locator(...)`. Popover remains page-wide (portal).

D4 — leg4 receipt keyed by kind only (`out.answer[r.kind]`), so same-kind pairs overwrite. Fix:
`out.answer.slots = results` stores the full index-keyed array. Error case records
`{index:-1, kind:'unknown', error}` instead of losing the attempt.

D5 — Paperwork (this report).

## Files Changed

1. `chrome.cjs` — 186 lines (was 149). Rewrote classification (lines 133-145) to probe answer
   surfaces; added wells/option/parameter arms to `answerSlot`; added slot-scoped delegation.
2. `leg4.cjs` — 105 lines (was 99). Added `out.answer.slots` and error-slot recording.
3. `probe.slots.cjs` — NEW (119 lines). RED pin with 5 measured shapes (A-E).

## Verification Results

### RED probe (base d9ca461e)
```
FAIL A-LIVE: answerAllSlots: slot 0 — unrecognized kind (no identity/quantity/options markers)
FAIL B-CARD1: answerAllSlots: slot 0 — unrecognized kind (no identity/quantity/options markers)
FAIL C-WELLS: answerAllSlots: slot 0 — unrecognized kind (no identity/quantity/options markers)
FAIL D-OPTIONS: answerAllSlots: slot 0 — unrecognized kind (no identity/quantity/options markers)
FAIL E-PARAMETER: answerAllSlots: slot 0 — unrecognized kind (no identity/quantity/options markers)
```

### GREEN probe (after fix)
```
PASS A-LIVE: slot0:identity, slot1:quantity
PASS B-CARD1: slot0:identity, slot1:quantity
PASS C-WELLS: slot0:wells
PASS D-OPTIONS: slot0:option
PASS E-PARAMETER: slot0:parameter
All shapes passed
```

### Mutation (teeth)
Restored `hasIdentity` (label probe) -> shape A FAIL:
```
FAIL A-LIVE: answerAllSlots: slot 0 — unrecognized kind (no picker/chip/wells/options/parameter surface)
PASS B-CARD1: slot0:identity, slot1:quantity
FAIL C-WELLS: answerAllSlots: no value for slot 0 (kind identity)
PASS D-OPTIONS: slot0:option
PASS E-PARAMETER: slot0:parameter
3 shape(s) failed
```
Reverted mutation in commit d18a751a.

### Syntax and exports
```
BOTH_EXIT_0
answerAllSlots: function  answerSlot: function
chat-clarification-slot-identity count: 0
answerSlot(page, 'identity' count: 0
answerSlot(page, 'quantity' count: 0
Product-path delta: NONE
git status: clean
```

### Budget
Files: 3 (chrome.cjs 186, leg4.cjs 105, probe.slots.cjs 119)
Total lines changed: ~95 added across 3 files (budget: 200, OK)

### Marker tables
Used review tables verbatim (advc c1 §4.1):
A: slot0 {search:1}, slot1 {chip:1, value:1, approve:1}
B: slot0 {identity:1, search:1}, slot1 {chip:1, value:1, approve:1}
C: slot0 {identity:1, target:1, targetApprove:1}
D: slot0 {options:2}
E: slot0 {param:1, paramInput:1, paramSubmit:1}

### Commit log
```
ce477bc6 u4bfix1: leg4 index-keyed receipt + error recording (D4)
d18a751a u4bfix1: REVERT mutation — restore picker-based classification
c064d75a u4bfix1: MUTATION PROOF — restore hasIdentity to show shape A fails
e6244068 u4bfix1: update probe to pass all 5 shapes with classification fix
06dafcf1 u4bfix1: classify slots by answer surface, add wells/option/parameter arms, scope answerSlot to slot root
42a83fe7 u4bfix1: probe.slots.cjs — RED pin for slot-kind classification
```

L2-GROUPEDSUBMIT-ARM-ANSWER-1 UNIT u4bfix1 DONE 53e2346716240cbf9d63661e8bae7c8827859b49
