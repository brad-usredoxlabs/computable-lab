# PURGE VERIFICATION — L2-STORE-CHURN-PURGE-1 (orch tick l2t3085, 2026-11-07 ~22:20 EST)

Exec unit: cl-l2-purge-exec-l2t3080 — exited Result=success (967 DELETE attempted).
delete-results.json status counts: 200=937, 404=10 (child-cascaded), 400=17 (server git pathspec fatal), 405=3 (APPEND_ONLY guard).
No 200-deleted id reappeared (measured: 0).

FRESH CENSUS (GET /api/records paginated, USR-BRAD): total 194.
- pre-census 1201 -> removed 1007, added 0.
- Manifest KEEP=234 present=182; the 52 absent KEEP ids are ALL kind=record-revision whose
  sourceRecordId is a DELETED churn record — server cascade removed the revision with its parent.
  0 unexplained. Semantically churn-of-churn; manifest KEEP-classification over-inclusive, no data loss of substance.
- Manifest DELETE present=12: 2 ATT append-only + 1 RECV append-only (405 guard) + 9 EVG-PDT-vendor-*
  (400 git pathspec fatal). Retained-with-reason per policy; NO force-delete.
- 404 walk over first 60 KEEP ids: CLEAN (zero 404).
- Non-vacuity: MAT-1-mm-clofibrate1-mm-clof-l84l ABSENT; MSP-DRAFT-EVG_* remaining = 0.
- "1 mM clofibrate in DMSO": /api/resolve route 404 (not a served route on this build); stronger
  substitute used — full-store scan: records mentioning "clof" = 0 rows.

RESIDUALS (filed, not blockers): 17 churn EVG rows stuck behind a server git-pathspec 400 (defect
candidate for architect: delete path fatal on long EVG-PDT filenames); 3 append-only attest/receiving
rows kept by design guard. Reversible: store-export-pre.json (sha-reversible) + this manifest.
L2-STORE-CHURN-PURGE-1 UNIT purge DONE (verification: this file; exec results: delete-results.json)
