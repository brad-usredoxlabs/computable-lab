# L2-PROSE-SHORTHAND-SALVAGE-1 / c4marker — run report

Unit: paperwork only. Corrected the malformed exit marker at deliverables/L2-PROSE-SHORTHAND-SALVAGE-1-report.u3b-0027.md:61 from `...-SALVAGE-1-u3b UNIT unit DONE ...` to the contracted `L2-PROSE-SHORTHAND-SALVAGE-1 UNIT c4marker DONE 735175872b54f383d44fd9d68fcc01e85f66267a`, and added one provenance sentence above it (73517587 first carried the report and the C4 code; the token order was corrected in the follow-up commit, no product file changed).

Changed: deliverables/L2-PROSE-SHORTHAND-SALVAGE-1-report.u3b-0027.md only (+2/-1). No product file, no test edit, no new deliverables report.

Verified: contract-form grep prints exactly one line at EOF; `grep -cE 'DONE [0-9a-f]{40}'` = 1; `git cat-file -e 73517587:deliverables/...` = SHA-OK; `git diff --stat HEAD~1 HEAD` = 1 file; tree clean. Baseline (measured by composer 12:24): InferenceClient.toolChoiceDowngrade.test.ts 3 passed (1.90 s). vitest/tsc deliberately not re-run, per brief.

L2-PROSE-SHORTHAND-SALVAGE-1-c4marker UNIT unit DONE ccce5ecc0dec73e6112fa1dbc94aa9ef602895fb
