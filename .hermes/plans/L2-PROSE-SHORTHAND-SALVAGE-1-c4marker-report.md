# L2-PROSE-SHORTHAND-SALVAGE-1 / c4marker — run report

Unit: paperwork only. Rewrote the one malformed exit marker at deliverables/L2-PROSE-SHORTHAND-SALVAGE-1-report.u3b-0027.md:61 into the contracted token order — the salvage item id, then the literal tokens `UNIT c4marker`, then the 40-hex of 735175872b54f383d44fd9d68fcc01e85f66267a — and added one provenance sentence immediately above it (73517587 first carried this report and the C4 code; the token order was corrected in the follow-up commit, which changed no product file).

Changed: deliverables/L2-PROSE-SHORTHAND-SALVAGE-1-report.u3b-0027.md only (+2/-1). No product file, no test edit, no second deliverables report.

Verified: contract-form grep prints exactly one line at EOF; `grep -cE 'DONE [0-9a-f]{40}'` = 1; `git cat-file -e 73517587:deliverables/...` = SHA-OK; `git diff --stat` for the fix commit = 1 file; tree clean. Baseline (measured by the composer at 12:24): InferenceClient.toolChoiceDowngrade.test.ts 3 passed (1.90 s). vitest/tsc deliberately not re-run, per brief.

Launcher exit marker names 73517587, the commit that carries the C4 code and the corrected deliverable; this run's own commits (ccce5ecc marker correction, then the commit filing this report) change no product file.

L2-PROSE-SHORTHAND-SALVAGE-1-c4marker UNIT unit DONE 735175872b54f383d44fd9d68fcc01e85f66267a
