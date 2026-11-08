# L2-GROUPEDSUBMIT-ARM-ANSWER-1 u4bfix2 Outcome Report

Replaces `L2-GROUPEDSUBMIT-ARM-ANSWER-1-u4bfix1-report.md`, DELETED here: it cited c064d75a and
d18a751a, commits that never existed (`git cat-file -t` -> fatal), and its D3 slot-scoping claim was
false. Every line below was produced in this run.

Defects fixed: D-1 (identity arm's `pickTop3`/`pickNumberedOption` fallbacks were page-wide, so a
grouped card's slot1 could be answered with slot0's row), D-6 (no shape exercised those fallbacks —
the popover stub always matched — so un-scoping left the probe GREEN), D-2 (fabricated provenance,
retracted above). D-4 (leg4 receipts) deferred: leg4.cjs untouched.

## Changes (chrome.cjs, probe.slots.cjs, report)

1. chrome.cjs (190 lines): `pickTop3(page, searchValue, scope)` and
   `pickNumberedOption(page, searchValue, scope)` use `const base = scope || page`; the identity arm
   passes its slot root `r` to both. Popover stays page-wide (portal); its comment is unchanged/true.
2. probe.slots.cjs (143 lines): stub elements carry per-element text (`mkEl(key, si, text)`, per-slot
   `texts`) and record picks. New shape F-IDENT-SCOPE: two identity slots, each with its own top-3
   row, both wanting "Clofibrate", asserting `picked = [Clofibrate (slot0), Clofibrate (slot1)]`.
   A page-wide fallback returns slot0's row twice and fails.
3. u4bfix1-report.md deleted; this report added.

## Verification (run from worktree root)

RED at e5930714 (probe pinned, chrome.cjs still page-wide):
```
FAIL F-IDENT-SCOPE: picked [Clofibrate (slot0)|Clofibrate (slot0)] expected [Clofibrate (slot0)|Clofibrate (slot1)]
1 shape(s) failed            PROBE_EXIT=1
```
GREEN at f9618d43 and at HEAD:
```
PASS A-LIVE: slot0:identity, slot1:quantity
PASS B-CARD1: slot0:identity, slot1:quantity
PASS C-WELLS: slot0:wells
PASS D-OPTIONS: slot0:option
PASS E-PARAMETER: slot0:parameter
PASS F-IDENT-SCOPE: slot0:identity, slot1:identity picked=Clofibrate (slot0)|Clofibrate (slot1)
All shapes passed            PROBE_EXIT=0
```
Real M3 mutation this session (both call sites reverted to page-wide, uncommitted, file restored):
```
FAIL F-IDENT-SCOPE: picked [Clofibrate (slot0)|Clofibrate (slot0)] expected [Clofibrate (slot0)|Clofibrate (slot1)]
1 shape(s) failed -> MUT_EXIT=1;  [after restore] All shapes passed
```
```
node --check chrome.cjs && node --check probe.slots.cjs && node --check leg4.cjs -> CHECK_ALL_OK (0)
exports: card,slots,anySurface,arm,answerSlot,answerAllSlots,submitAnswers,previewBar,apply,discard
leg4.cjs diff 669ea317..HEAD -> empty;  git status --porcelain -> empty
```
Commits this run, each `git cat-file -t` -> commit: e5930714 (c1 RED pin), f9618d43 (c2 scoping fix,
green), report commit after f9618d43.

Note: a commit cannot contain its own id, so the marker names f9618d43, the final commit that changes
code/probe; the report commit immediately follows it and `git log -1 --format=%H` names that one.

L2-GROUPEDSUBMIT-ARM-ANSWER-1 UNIT u4bfix2 DONE f9618d43ab8cc89fd9db428d6a5dee1667336ec1
