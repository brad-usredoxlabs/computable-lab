# L2-JOURNEY-CAPABILITY-CATALOGUE-1 u2mk2 — duplicate exit-marker repair

Paperwork-only follow-on to u2loader-fix1 (advc round 2: VERDICT FIX 1, MINOR duplicate marker).

RED at base e0e65d7b: `grep -cE 'DONE [0-9a-f]{40}'` on ...-u2loader-fix1-report.md → 2 (lines 58, 59).
Change (base..HEAD): deleted malformed line 59; §Exit prose now states ONE marker. Product lines 0, test lines 0.
Verify: AC1 → 1 (line 58, acffe46aa04539ba70472bdd686fd2c81404ab35); AC2 → 0 and 0; typecheck/vitest not run (.ts unchanged).
Budget note: this unit report is an extra file vs OUTPUT BUDGET files<=1, because cl_marker_scan.marker_verdict matches item L2-JOURNEY-CAPABILITY-CATALOGUE-1-u2mk2 and the retained fix1 line cannot satisfy it; filing the u2mk2 marker in the fix1 report would re-create the defect under repair.

L2-JOURNEY-CAPABILITY-CATALOGUE-1-u2mk2 UNIT unit DONE 1b0ba142b566a292ed94a3e3777f8470e747236f
