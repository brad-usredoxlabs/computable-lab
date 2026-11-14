# L2-GC-UPLOAD-UI-1 / u0marker — run report (lane 2)
Worktree: /home/brad/cl-wt/L2-GC-UPLOAD-UI-1-u0parserinfo-lane2
Branch: cl/lane2-gc-upload-ui-1-u0parserinfo-0809   Unit: u0marker (1 of 1)
Paperwork only — ZERO product code. Repaired the one malformed exit marker the
delivered u0parserinfo run left in the lane report, and re-measured its three
VERIFY bars so the already-committed code has a marker a scanner can read.
Scenario: NONE — GC-FID instrument round (Brad 2026-11-14); `grep -ril 'gc-fid\|chemstation'`
over the corpus manifest = 0 rows; this is not a Corpus2 scenario (no scenario leg).
Governing line (architect-context-l2.md:51-52, §2.10): "A human step declares its own
completion." A unit declares completion in a token the next tool can read, never in prose.
The defect was a NAME USED AS IF IT WERE THE IDENTITY (the item-unit slug written in the
unit field); the fix is the two-token pair, rewritten in place — not a second marker.

## Re-measured (raw, at HEAD 6d42f6fdc..., before any edit) — all three match the report
1. cd server && npx vitest run src/measurement/MeasurementService.parserInfoProvenance.test.ts
     Test Files  1 passed (1)
           Tests  3 passed (3)          [report :90-91]
2. cd server && npx vitest run src/measurement/parsers/agilent6890Parser.test.ts
     Test Files  1 passed (1)
           Tests  9 passed (9)          [report :106-107]
3. cd server && npx tsc --noEmit 2>&1 | grep -c "error TS"
     6                                    [report :108-109; pre-existing, none touched]
All three match the values the report already prints → NO closeout re-measure block appended
(a second version of a measurement is a second authority).

## The one-line diff (lane report line 145, in place — the ONLY change to that file)
- L2-GC-UPLOAD-UI-1-u0parserinfo UNIT L2-GC-UPLOAD-UI-1-u0parserinfo DONE 6d42f6fdc9de1af5c52d693faebe213e0f5de9d0
+ L2-GC-UPLOAD-UI-1 UNIT u0parserinfo DONE 6d42f6fdc9de1af5c52d693faebe213e0f5de9d0
Lane report sha256sum after edit: 5f5808fbc2e8547625b41262e445fe5d5dffc4a91320fb268cc2230950404d2d

## git -C <worktree> rev-parse HEAD (work-carrying commit, before this unit's commits)
6d42f6fdc9de1af5c52d693faebe213e0f5de9d0
Marker mechanism: commit A = this report body; the marker line (appended after A, sha read
from `git rev-parse HEAD`, never typed) names the commit that CONTAINS this report, per
cl-unit-evidence-check.py EV-4 (the marker sha's tree must contain the report file).
L2-GC-UPLOAD-UI-1 UNIT u0marker DONE ada62f36343a00178fd6915ca893b07a841552b9
