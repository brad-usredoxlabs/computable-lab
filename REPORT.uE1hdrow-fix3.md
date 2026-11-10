REPORT — L2-SPEC-SHEET-INGEST-1 / uE1hdrowfix-c3 (fix cycle)
============================================================

UNIT: L2-SPEC-SHEET-INGEST-1-uE1hdrowfix-c3
Lane: 2
Worktree: /home/brad/cl-wt/L2-SPECSHEET-uE1hdrow-lane2
Branch: cl/lane2-specsheet-ue1hdrow-1110

DEFECTS RESOLVED
-----------------

D1 (MAJOR) — Separator regex too narrow (ASCII-only)
  Root cause: punctOnlyRe at SpecSheetExtractor.ts:196 was /^[\s\-\:\|]*$/
  which missed em-dash (U+2014), en-dash (U+2013), middle-dot (U+00B7),
  and underscore. PDF/HTML rule rows made of these chars were treated as
  data, fabricating punctuation values.
  Fix: Extended regex to /^[\s\-\u2013\u2014\u00b7_:\|]*$/ at line 196.
  Test: Added 'does not fabricate values from an em-dash separator row' test
  using "\u2014 | \u2014" separator. RED before fix (1 failed | 15 passed),
  GREEN after (16/16).

D2 (MINOR) — Multi-header pin fixture clarity
  Reality: The per-field loop resets lastHeader per mapping, so each mapping
  independently walks all lines. With two headers in swapped order followed
  by one data row, the second header layout wins for BOTH fields.
  IN:  "Catalog Number | Volume"  (header1: Cat@0, Vol@1)
        "Volume | Catalog Number"  (header2: Vol@0, Cat@1)
        "10 mL | X9"               (data)
  OUT: catalog_number = 'X9'  (position 1 from header2)
        package_size   = '10 mL' (position 0 from header2)
  Both fields are extractable — the per-field break does not prevent both.
  The fixture already tests the correct behavior; pinned with explanatory
  comment documenting IN/OUT.

D3 — Report file missing
  Resolved: This report is the deliverable.

FILES CHANGED
--------------
  server/src/ingestion/SpecSheetExtractor.ts       (line 196, punctOnlyRe)
  server/src/ingestion/SpecSheetExtractor.test.ts  (added D1 test + D2 comment)
  REPORT.uE1hdrow-fix3.md                          (this file)

VERIFICATION
-------------
  Tests:  16 passed (16) — all green
  Typecheck: tsc --noEmit — no errors

  Commit log:
    38db8a3f RED em-dash test (1 failed | 15 passed)
    bb3dfb3b D1 regex fix (16/16 GREEN)
    df072a1c D2 fixture pinned with IN/OUT documented

L2-SPEC-SHEET-INGEST-1-uE1hdrowfix-c3 UNIT unit DONE 8b1a4fe2
