# L2-GROUPEDSUBMIT-ARM-ANSWER-1 — unit u5mergeadapt report

Merged trunk ceeeb325 into `cl/lane2-groupedsubmit-u4b-1200` and ported the
slot-scoping seam onto trunk's surface-driven `chrome.cjs`.

Commits:
- C1 `f8f43b238a0561c31b803f9b60fafbe4a63e891e` — merge trunk ceeeb325 (conflicts resolved: chrome.cjs and
  leg4.cjs taken TRUNK-side, byte-identical to trunk; branch leg4 hunks
  discarded).
- C2 `bf84cd13aa06486914c9c9629ce2c02c9674e211` — scope port + probe adaptation (7/7 green).
- C3 (this report).

Seam (only semantic change vs trunk chrome.cjs):
- `pickTop3(page, searchValue, scope)` / `pickNumberedOption(page, searchValue, scope)`
  with `base = scope || page`.
- `answerSlotBySurface` picker arm threads the slot root into `pickTop3`.
- Arm 4: when the slot-scoped option lists yield 0, falls back to
  `pickNumberedOption(page, answerValue, slot)` for log-rendered option lists.
- Legacy `answerSlot` call sites (:228/:230) stay page-wide.
- Everything else trunk-side: identityKind, slotIdentity, slotAnswerValue,
  answerSlotBySurface arms 1/2/3/5, answerAllSlots, exports.

probe.slots.cjs adaptation: reads `slotIndex` (trunk receipt) and classifies
kind from the per-slot DOM marker table (trunk drops `kind`); stub resolves
trunk's prefix / `ol button` / nested-chip selectors. Assertions (7 shapes
A–G, expectPicked) unchanged.

## Verify (raw)

grep -c '<<<<<<<' chrome.cjs leg4.cjs probe.slots.cjs:
```
.../drivers/chrome.cjs:0
.../drivers/leg4.cjs:0
.../drivers/probe.slots.cjs:0
```

node --check chrome.cjs && leg4.cjs && probe.slots.cjs:
```
CHECK_OK
```

`cd $D && node probe.slots.cjs`:
```
PASS A-LIVE: slot0:identity, slot1:quantity
PASS B-CARD1: slot0:identity, slot1:quantity
PASS C-WELLS: slot0:wells
PASS D-OPTIONS: slot0:option
PASS E-PARAMETER: slot0:parameter
PASS F-IDENT-SCOPE: slot0:identity, slot1:identity picked=Clofibrate (slot0)|Clofibrate (slot1)
PASS G-OPTION-SCOPE: slot0:identity, slot1:identity picked=Clofibrate (slot0)|Clofibrate (slot1)

All shapes passed
EXIT=0
```

## Mutation M1 (teeth) — arm-4 fallback scope removed

`pickNumberedOption(page, answerValue, slot)` → `pickNumberedOption(page, answerValue)`:
```
PASS A-LIVE: slot0:identity, slot1:quantity
PASS B-CARD1: slot0:identity, slot1:quantity
PASS C-WELLS: slot0:wells
PASS D-OPTIONS: slot0:option
PASS E-PARAMETER: slot0:parameter
PASS F-IDENT-SCOPE: slot0:identity, slot1:identity picked=Clofibrate (slot0)|Clofibrate (slot1)
FAIL G-OPTION-SCOPE: picked [Clofibrate (slot0)|Clofibrate (slot0)] expected [Clofibrate (slot0)|Clofibrate (slot1)]

1 shape(s) failed
EXIT=1
```
Reverted:
```
PASS A-LIVE: slot0:identity, slot1:quantity
PASS B-CARD1: slot0:identity, slot1:quantity
PASS C-WELLS: slot0:wells
PASS D-OPTIONS: slot0:option
PASS E-PARAMETER: slot0:parameter
PASS F-IDENT-SCOPE: slot0:identity, slot1:identity picked=Clofibrate (slot0)|Clofibrate (slot1)
PASS G-OPTION-SCOPE: slot0:identity, slot1:identity picked=Clofibrate (slot0)|Clofibrate (slot1)

All shapes passed
EXIT=0
```

## Unit delta vs trunk (git diff FETCH_HEAD --stat)

```
.../L2-GROUPEDSUBMIT-ARM-ANSWER-1-u4b-report.md    |  27 +++
...L2-GROUPEDSUBMIT-ARM-ANSWER-1-u4bfix2-report.md |  90 ++++++++++
.../u6status/drivers/chrome.cjs                    |  23 ++-
.../u6status/drivers/probe.slots.cjs               | 194 +++++++++++++++++++++
4 files changed, 326 insertions(+), 8 deletions(-)
```
No app/ or server/ file is touched by this unit (the app/server entries in
`git diff 4bf1bc96 HEAD` are trunk-side changes carried by the merge, not edits
made here).

L2-GROUPEDSUBMIT-ARM-ANSWER-1 UNIT unit DONE bf84cd13aa06486914c9c9629ce2c02c9674e211
