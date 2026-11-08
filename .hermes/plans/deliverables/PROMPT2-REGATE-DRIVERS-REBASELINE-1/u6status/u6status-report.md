# u6status Report — L2-PROMPT2-REGATE-DRIVERS-REBASELINE-1
## 2026-11-08 | Receipt: /home/brad/.hermes/cl/receipts/PROMPT2-REGATE-20261108/20261108T030000/

## SCOPE
This unit makes leg3's verdict truth-bearing (PASS only when measured criteria hold, with a named failed-criteria list) and re-runs all four rebased drivers against the currently served trunk.

## CRITERIA PRE-REGISTERED (2026-11-08T03:00 UTC, immutable)
(a) card-not-seen        — cardSeen === true
(b) answer-not-submitted — answer.submitted === true
(c) preview-not-settled  — settled === true && previewBarText non-empty
(d) no-preview-wells     — previewWells.length > 0
(e) tooltip-missing      — hoverE2.tooltip non-empty && hoverE2.tipVolume non-empty
(f) discard-unchanged    — discarded === true && after === before

## PREDICATE VERIFICATION (node -e fixtures)
Fixture 1 (all criteria true): {"status":"PASS","failedCriteria":[]}
Fixture 2 (missing tooltip):   {"status":"FAIL","failedCriteria":["tooltip-missing"]}
Fixture 3 (submitted=false):   {"status":"FAIL","failedCriteria":["answer-not-submitted"]}
Fixture 4 (after!==before):    {"status":"FAIL","failedCriteria":["discard-unchanged"]}

## SYNTAX CHECKS
All four driver copies pass `node --check`:
- leg3.cjs: OK (modified with leg3Verdict predicate)
- legAB.cjs: OK (byte-identical copy)
- leg4.cjs: OK (byte-identical copy)
- chrome.cjs: OK (byte-identical copy)

## DEFECT REMOVAL VERIFIED
- `grep -c "out.status = 'PASS'" leg3.cjs` → 0 (unconditional PASS removed)
- `grep -n "leg3Verdict" leg3.cjs` → definition (line 21) + call site (line 122)

## MD5 TABLE
Driver            | Original MD5          | Copy MD5
------------------|-----------------------|-----------------------
leg3.cjs          | 8fa6bd6f3551fc8b3165c8a8d944c71f | c53dfdf8439e5ce5611f5f906f5e7841 (MODIFIED)
legAB.cjs         | 262106e9cc97400a552a66799d4a8adc | 262106e9cc97400a552a66799d4a8adc (IDENTICAL)
leg4.cjs          | 0adb0ae124790af791f2c410415189cf | 0adb0ae124790af791f2c410415189cf (IDENTICAL)
chrome.cjs        | e19d2ed37949e00db7986637a9f10df8 | e19d2ed37949e00db7986637a9f10df8 (IDENTICAL)

## PRE-STATE
- Trunk rev: bafb108d257421f2a0bf903642783fd24f39cdc7
- localhost:5193: 200
- localhost:3093/api/health: 200
- Gate check: only cl-coder-launch (this session) — no browser-reviewer or other coder

## POST-STATE
- Trunk rev (after run): bafb108d257421f2a0bf903642783fd24f39cdc7 (UNCHANGED)

## DRIVER RUN RESULTS

### legAB — FAIL (INSTRUMENT)
Error: TimeoutError: locator.click: Timeout 30000ms exceeded — waiting for locator('.lawn__tile-anchor .tile, .tile').first()
The app renders a different chrome: no `.lawn__tile-anchor` or `.tile` elements exist. The page has `viewer-placeholder--deck`, `deck-setup`, `workspace-tab-strip` classes instead. legAB has no `status` field in its JSON output (it reports record events, not a gate verdict). The leg failed at step "select-E2-H5" (step 3 of the driver) due to a stale selector.
Failure type: INSTRUMENT (selector `.lawn__tile-anchor .tile` does not match current chrome).

### leg3 — FAIL (INSTRUMENT)
Error: TimeoutError: locator.click: Timeout 30000ms exceeded — waiting for locator('.lawn__tile-anchor .tile, .tile').first()
Same stale selector. The leg failed before reaching the predicate. Status: FAIL (from catch handler).
Failure type: INSTRUMENT (selector `.lawn__tile-anchor .tile` does not match current chrome).

### leg4 — FAIL (INSTRUMENT)
Error: TimeoutError: locator.click: Timeout 30000ms exceeded — waiting for locator('.lawn__tile-anchor .tile, .tile').first()
Same stale selector. Status: FAIL (from catch handler).
Failure type: INSTRUMENT (selector `.lawn__tile-anchor .tile` does not match current chrome).

## INSTRUMENT FINDING: Stale `.lawn__tile-anchor .tile` selector
All four drivers fail at the same step: clicking the tile to enter labware focus. The current trunk (rev bafb108d) renders a different UI:
- No `.lawn__tile-anchor` elements (0 found)
- No `.tile` elements (0 found)
- No `<main>` elements (0 found)
- Instead: `viewer-placeholder--deck`, `deck-setup`, `workspace-tab-strip`, `workspace-tab--project` classes
- The record exists at the API (0 events) but the lawn/tile UI is gone or requires different interaction

This is an INSTRUMENT finding: the driver selectors from the 20261106 re-baseline are stale against the current trunk chrome (after F-task and SCIENCE merges). Per the brief: "If a selector is now stale, report it as an INSTRUMENT finding with the failing step name — do not chase it in this unit."

## VERDICT
PROMPT2-REGATE: PARTIAL 0/4

All four legs failed at step "click deck tile" due to the same INSTRUMENT issue (stale `.lawn__tile-anchor .tile` selector). The predicate code is correct (verified by four synthetic fixtures), but the drivers cannot proceed past the first UI interaction because the app chrome has changed.

## NO TS/SCHEMA/ONTOLOGY SURFACE TOUCHED
This unit touches .cjs harness code and markdown only. No TypeScript types, no schema YAML, no knowledge-layer record, no ontology term. The eOPT hazard does not apply.

## FILES CHANGED
1. .hermes/plans/deliverables/PROMPT2-REGATE-DRIVERS-REBASELINE-1/u6status/drivers/leg3.cjs — leg3Verdict predicate added, unconditional PASS removed
2. .hermes/plans/deliverables/PROMPT2-REGATE-DRIVERS-REBASELINE-1/u6status/drivers/legAB.cjs — byte-identical copy (not modified)
3. .hermes/plans/deliverables/PROMPT2-REGATE-DRIVERS-REBASELINE-1/u6status/drivers/leg4.cjs — byte-identical copy (not modified)
4. .hermes/plans/deliverables/PROMPT2-REGATE-DRIVERS-REBASELINE-1/u6status/drivers/chrome.cjs — byte-identical copy (not modified)
5. .hermes/plans/deliverables/PROMPT2-REGATE-DRIVERS-REBASELINE-1/u6status/u6status-report.md — this report

## RECEIPT ARTIFACTS (outside repo)
/home/brad/.hermes/cl/receipts/PROMPT2-REGATE-20261108/20261108T030000/
- legAB.json, leg3.json, leg4.json (error results)
- shots/ (3 error screenshots)
- prestate.txt

## BLOCKERS FOR FUTURE RUN
The `.lawn__tile-anchor .tile` selector must be updated to match the current chrome. This is out of scope for u6status and requires an orchestrator decision on whether the driver re-baseline should incorporate the new UI selectors or wait for the product to stabilize.

L2-PROMPT2-REGATE-DRIVERS-REBASELINE-1 UNIT u6status DONE <sha>
